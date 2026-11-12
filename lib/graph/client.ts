import { assertActiveAccountMatches, getAccessToken } from "@/lib/auth/authUtils";
import { getGraphEndpoint } from "@/lib/graph/endpoints";
import { GraphResponse } from "@/types/graph";
import {
  RetryWait,
  RunCancelledError,
  isAuthSessionError,
  isNotProcessedError,
  isOutcomeUnknownError,
  isRetryableError,
  parseRetryAfterMs,
  retryWithBackoff,
} from "@/lib/utils/retry";
import { BatchRequest, BatchResult } from "./batch";

/**
 * Controls that a hydration run attaches to the client.
 */
export interface GraphRunControls {
  /** Wait used for retries and verification reads. Cancel and pause take effect during it. */
  wait: RetryWait;
  /**
   * Called when a token cannot be acquired. The run pauses until the user resumes it.
   * "retry": get the token again and send the request. "stop": throw the session error.
   * "cancelled": the run was cancelled.
   */
  onAuthSessionLost?: (error: Error) => Promise<"retry" | "stop" | "cancelled">;
}

/** An object that a create request made, found by name. */
export type FoundObject = { id: string } & Record<string, unknown>;

/**
 * Waits before each read that verifies a write with an unknown outcome. A new object
 * can take a few seconds to appear in its collection.
 */
const VERIFY_READ_DELAYS_MS = [3000, 5000];

export const OUTCOME_UNKNOWN_NOT_FOUND =
  "Outcome unknown. The object was not found in the tenant after the error, so the request was not sent again. Run the hydration again to create it.";
export const OUTCOME_UNKNOWN_UNVERIFIED =
  "Outcome unknown. The tenant could not be read to verify the result, so the request was not sent again. Run the hydration again to verify.";

/**
 * Name property and value of the object that a create body describes.
 */
function getCreateName(body: unknown): { key: "name" | "displayName"; value: string } | undefined {
  const record = body as { name?: unknown; displayName?: unknown } | null;
  if (typeof record?.name === "string" && record.name) return { key: "name", value: record.name };
  if (typeof record?.displayName === "string" && record.displayName) {
    return { key: "displayName", value: record.displayName };
  }
  return undefined;
}

/**
 * Copy of an error with a note added to the message. Status and code stay the same.
 */
export function addErrorNote(error: unknown, note: string): Error {
  const base = error instanceof Error ? error : new Error(String(error));
  const result = new Error(`${base.message} (${note})`) as Error & Record<string, unknown>;
  for (const key of ["status", "code", "retryAfterMs"]) {
    const value = (base as unknown as Record<string, unknown>)[key];
    if (value !== undefined) result[key] = value;
  }
  return result;
}

function isNotFoundError(error: unknown): boolean {
  const { status, message } = (error ?? {}) as { status?: number; message?: string };
  return status === 404 || (status === 400 && /resourcenotfound/i.test(message ?? ""));
}

/**
 * Microsoft Graph API client with retry logic
 */
export class GraphClient {
  private baseUrl: string;
  private readonly expectedAccount?: { tenantId: string; homeAccountId: string };
  private runControls?: GraphRunControls;

  constructor(expectedAccount?: { tenantId: string; homeAccountId: string }, private readonly onBatchDispatch?: (requests: BatchRequest[]) => void) {
    this.baseUrl = getGraphEndpoint();
    this.expectedAccount = expectedAccount;
  }

  /**
   * Attach the controls of a hydration run, or remove them with undefined.
   */
  setExecutionControls(controls: GraphRunControls | undefined): void {
    this.runControls = controls;
  }

  private wait(ms: number): Promise<"completed" | "cancelled"> {
    if (this.runControls) return this.runControls.wait(ms);
    return new Promise((resolve) => setTimeout(() => resolve("completed"), ms));
  }

  /**
   * Get authorization headers with access token.
   * When the token cannot be acquired during a run, the run decides what to do.
   * No request was sent at that point, so the same request can be sent after recovery.
   */
  private async getHeaders(): Promise<HeadersInit> {
    for (;;) {
      try {
        if (this.expectedAccount) {
          assertActiveAccountMatches(
            this.expectedAccount.tenantId,
            this.expectedAccount.homeAccountId
          );
        }
        const token = await getAccessToken();
        return {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "client-request-id": crypto.randomUUID(),
        };
      } catch (error) {
        const onAuthSessionLost = this.runControls?.onAuthSessionLost;
        if (!isAuthSessionError(error) || !onAuthSessionLost) throw error;
        const decision = await onAuthSessionLost(error);
        if (decision === "cancelled") throw new RunCancelledError();
        if (decision === "stop") throw error;
      }
    }
  }

  /**
   * Handle Graph API errors
   * Handles both standard Graph API error format and Intune-specific error format
   */
  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      let errorMessage = `Graph API error: ${response.status} ${response.statusText}`;
      let errorCode: string | undefined;

      try {
        const responseText = await response.text();
        if (responseText) {
          const errorData = JSON.parse(responseText);
          // Standard Graph API error format: { error: { message: "..." } }
          if (errorData.error?.message) {
            errorMessage = errorData.error.message;
          }
          // Intune-specific error format: { Message: "..." }
          else if (errorData.Message) {
            errorMessage = errorData.Message;
          }
          // Intune error format with nested details: { error: { code: "...", details: [...] } }
          else if (errorData.error?.code) {
            errorMessage = `${errorData.error.code}: ${errorData.error.details?.[0]?.message || errorData.error.message || "Unknown error"}`;
          }

          // Extract error code, walking innererror recursively for the most specific code
          if (errorData.error?.code) {
            errorCode = errorData.error.code;
            let inner = errorData.error.innererror;
            while (inner && typeof inner === "object") {
              if (typeof inner.code === "string") {
                errorCode = inner.code;
              }
              inner = inner.innererror;
            }
          }

          // Log full error for debugging
          console.error("[GraphClient] Full error response:", responseText);
        }
      } catch {
        // Failed to parse error response
      }

      // Always include status code in error message for proper error handling
      const error = new Error(`[${response.status}] ${errorMessage}`) as Error & {
        status: number;
        code?: string;
        retryAfterMs?: number;
      };
      error.status = response.status;

      if (errorCode) {
        error.code = errorCode;
      }

      // Retry-After is honoured on 429 and 503 responses
      if (response.status === 429 || response.status === 503) {
        const retryAfterMs = parseRetryAfterMs(response.headers.get("Retry-After"));
        if (retryAfterMs !== undefined) {
          error.retryAfterMs = retryAfterMs;
        }
      }

      throw error;
    }

    // Handle 204 No Content or 201 Created with empty body
    if (response.status === 204) {
      return {} as T;
    }

    // Check Content-Length header or try to parse body safely
    const contentLength = response.headers.get("Content-Length");
    if (contentLength === "0") {
      return {} as T;
    }

    // Try to read the response text first to handle empty bodies
    const responseText = await response.text();
    if (!responseText || responseText.trim() === "") {
      return {} as T;
    }

    // Parse the JSON
    try {
      return JSON.parse(responseText) as T;
    } catch {
      console.warn("[GraphClient] Failed to parse response as JSON, returning empty object");
      return {} as T;
    }
  }

  private async fetchJson<T>(
    url: string,
    init: RequestInit,
    isRetryable: (error: unknown) => boolean = isRetryableError
  ): Promise<T> {
    return retryWithBackoff(
      async () => {
        const headers = await this.getHeaders();
        const response = await fetch(url, {
          ...init,
          headers: {
            ...headers,
            ...init.headers,
          },
        });
        return this.handleResponse<T>(response);
      },
      { isRetryable, wait: (ms) => this.wait(ms) }
    );
  }

  /**
   * GET request to Graph API
   */
  async get<T>(endpoint: string, version: "v1.0" | "beta" = "beta"): Promise<T> {
    const url = `${this.baseUrl}/${version}${endpoint}`;

    return this.fetchJson<T>(url, { method: "GET" });
  }

  /**
   * GET request that returns a collection with automatic pagination
   */
  async getCollection<T>(
    endpoint: string,
    version: "v1.0" | "beta" = "beta"
  ): Promise<T[]> {
    const results: T[] = [];
    let url: string | undefined = `${this.baseUrl}/${version}${endpoint}`;

    while (url) {
      const response: GraphResponse<T> = await this.fetchJson<GraphResponse<T>>(url, { method: "GET" });
      if (response.value && Array.isArray(response.value)) {
        results.push(...response.value);
      }
      url = response["@odata.nextLink"];
    }

    return results;
  }

  /**
   * POST request (create) to Graph API.
   *
   * A create is sent again only when the response proves that Graph did not process it
   * (429, or 503 with Retry-After). After any other 5xx response or a network error, the
   * object can exist. The client then reads the collection and looks for the object by
   * the name in the body. A found object is returned as the result. When the object is
   * not found, or cannot be looked for, the error is thrown with a note. The request is
   * not sent again, so a retry never makes a second copy.
   */
  async post<T>(
    endpoint: string,
    data: unknown,
    version: "v1.0" | "beta" = "beta"
  ): Promise<T> {
    const url = `${this.baseUrl}/${version}${endpoint}`;

    try {
      return await this.fetchJson<T>(url, { method: "POST", body: JSON.stringify(data) }, isNotProcessedError);
    } catch (error) {
      if (!isOutcomeUnknownError(error)) throw error;
      if (!getCreateName(data)) throw addErrorNote(error, OUTCOME_UNKNOWN_UNVERIFIED);

      console.warn(`[GraphClient] POST ${endpoint} outcome unknown - looking for the object before any resend`);
      let found: FoundObject | undefined;
      try {
        [found] = await this.findCreatedObjects(endpoint, [data], version);
      } catch (readError) {
        if (readError instanceof RunCancelledError) throw readError;
        console.warn(`[GraphClient] Could not verify POST ${endpoint}:`, readError);
        throw addErrorNote(error, OUTCOME_UNKNOWN_UNVERIFIED);
      }
      if (found) {
        console.log(`[GraphClient] POST ${endpoint} created the object despite the error (ID: ${found.id})`);
        return found as T;
      }
      throw addErrorNote(error, OUTCOME_UNKNOWN_NOT_FOUND);
    }
  }

  /**
   * POST request with the same retry rule as post. A create is never sent again unless
   * Graph proved that it did not process the request.
   */
  async postNoRetry<T>(
    endpoint: string,
    data: unknown,
    version: "v1.0" | "beta" = "beta"
  ): Promise<T> {
    return this.post<T>(endpoint, data, version);
  }

  /**
   * POST request to an action endpoint (for example `.../renewUpload` or `.../commit`).
   *
   * Use this only for an action that has the same result when it is sent again. The
   * request uses the normal retry policy (MAX_RETRIES, Retry-After, cancel and pause),
   * the same as GET, PATCH and DELETE. It does not do the create verification of post.
   * Never use it to create an object in a collection.
   */
  async postAction<T>(
    endpoint: string,
    data: unknown,
    version: "v1.0" | "beta" = "beta"
  ): Promise<T> {
    const url = `${this.baseUrl}/${version}${endpoint}`;

    return this.fetchJson<T>(url, { method: "POST", body: JSON.stringify(data) });
  }

  /**
   * Look for objects that create requests to a collection made. The objects are matched
   * by the name (name or displayName) in each body, case-insensitive.
   * Waits before each read, because a new object can take time to appear.
   * Returns one entry per body (undefined when not found). Throws when the collection
   * cannot be read, or RunCancelledError when the run is cancelled.
   */
  async findCreatedObjects(
    endpoint: string,
    bodies: unknown[],
    version: "v1.0" | "beta" = "beta"
  ): Promise<Array<FoundObject | undefined>> {
    const names = bodies.map(getCreateName);
    const found: Array<FoundObject | undefined> = bodies.map(() => undefined);

    for (const delay of VERIFY_READ_DELAYS_MS) {
      if ((await this.wait(delay)) === "cancelled") throw new RunCancelledError();
      const items = await this.getCollection<FoundObject>(endpoint, version);
      names.forEach((name, index) => {
        if (!name || found[index]) return;
        const lower = name.value.toLowerCase();
        found[index] = items.find((item) => {
          const itemName = item[name.key];
          return typeof itemName === "string" && itemName.toLowerCase() === lower && typeof item.id === "string";
        });
      });
      if (names.every((name, index) => !name || found[index])) break;
    }

    return found;
  }

  /**
   * PATCH request to Graph API
   */
  async patch<T>(
    endpoint: string,
    data: unknown,
    version: "v1.0" | "beta" = "beta"
  ): Promise<T> {
    const url = `${this.baseUrl}/${version}${endpoint}`;

    return this.fetchJson<T>(url, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(data),
    });
  }

  /**
   * DELETE request to Graph API.
   * Treats 404 and 400/ResourceNotFound as success (idempotent delete - if resource is gone, mission accomplished).
   * When the delete still fails with a 5xx response or a network error after the retries,
   * the object is read again. A 404 then means that the delete was done.
   */
  async delete(endpoint: string, version: "v1.0" | "beta" = "beta"): Promise<void> {
    const url = `${this.baseUrl}/${version}${endpoint}`;

    try {
      return await retryWithBackoff(
        async () => {
          const headers = await this.getHeaders();
          const response = await fetch(url, {
            method: "DELETE",
            headers: { ...headers, Prefer: "return=minimal" },
          });

          // Treat 404 as success for DELETE (idempotent - resource already gone)
          if (response.status === 404) {
            console.log(`[GraphClient] DELETE returned 404 - resource already deleted, treating as success`);
            return;
          }

          // Treat 400 with ResourceNotFound as success for DELETE
          // Microsoft Graph sometimes returns 400 instead of 404 when resource doesn't exist
          if (response.status === 400) {
            const responseText = await response.clone().text();
            if (responseText.toLowerCase().includes("resourcenotfound")) {
              console.log(`[GraphClient] DELETE returned 400/ResourceNotFound - resource already deleted, treating as success`);
              return;
            }
          }

          return this.handleResponse<void>(response);
        },
        { wait: (ms) => this.wait(ms) }
      );
    } catch (error) {
      if (!isOutcomeUnknownError(error)) throw error;
      if (await this.isGone(endpoint, version)) {
        console.log(`[GraphClient] DELETE ${endpoint} failed, but the object is gone - treating as success`);
        return;
      }
      throw error;
    }
  }

  /**
   * Read an object after a delete with an unknown outcome. True only for a not-found response.
   */
  private async isGone(endpoint: string, version: "v1.0" | "beta"): Promise<boolean> {
    if ((await this.wait(VERIFY_READ_DELAYS_MS[0])) === "cancelled") throw new RunCancelledError();
    try {
      await this.get(endpoint, version);
      return false;
    } catch (error) {
      if (error instanceof RunCancelledError) throw error;
      return isNotFoundError(error);
    }
  }

  /**
   * Execute a batch request against the Graph API $batch endpoint
   * All requests in a batch must use the same API version
   * Microsoft Graph supports up to 20 requests per batch
   * Batch requests intentionally do not use the generic retry wrapper.
   * The batch executor decides whether retrying an entire batch is safe.
   * An error for the outer request has status and retryAfterMs like other requests.
   *
   * @param requests - Array of batch requests (max 20)
   * @param version - API version (v1.0 or beta) - all requests must use same version
   * @returns BatchResult with responses for each request
   */
  async batch(
    requests: BatchRequest[],
    version: "v1.0" | "beta" = "beta"
  ): Promise<BatchResult> {
    if (requests.length === 0) {
      return { responses: [] };
    }

    if (requests.length > 20) {
      throw new Error(`Batch size exceeds maximum of 20 requests (got ${requests.length})`);
    }

    const url = `${this.baseUrl}/${version}/$batch`;

    console.log(`[GraphClient] Executing batch with ${requests.length} requests (${version})`);

    const headers = await this.getHeaders();
    this.onBatchDispatch?.(requests);
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ requests }),
    });
    return this.handleResponse<BatchResult>(response);
  }
}

/**
 * Create a new Graph API client instance
 */
export function createGraphClient(expectedAccount?: { tenantId: string; homeAccountId: string }, onBatchDispatch?: (requests: BatchRequest[]) => void): GraphClient {
  return new GraphClient(expectedAccount, onBatchDispatch);
}
