import { Client } from "@microsoft/microsoft-graph-client";
import { getAccessToken } from "@/lib/auth/authUtils";
import { getGraphEndpoint } from "@/lib/auth/msalConfig";
import { CloudEnvironment } from "@/types/hydration";
import { GraphResponse } from "@/types/graph";
import { retryWithBackoff } from "@/lib/utils/retry";
import { BatchRequest, BatchResult } from "./batch";

/**
 * Microsoft Graph API client with retry logic
 * Uses Microsoft Graph Client SDK for reliable pagination through Intune proxies
 */
export class GraphClient {
  private baseUrl: string;
  private environment: CloudEnvironment;

  constructor(environment: CloudEnvironment = "global") {
    this.environment = environment;
    this.baseUrl = getGraphEndpoint(environment);
  }

  /**
   * Get a Microsoft Graph Client SDK instance
   * Used for operations that need reliable pagination through Intune proxies
   */
  private async getSdkClient(): Promise<Client> {
    const accessToken = await getAccessToken();
    return Client.init({
      authProvider: (done) => {
        done(null, accessToken);
      },
    });
  }

  /**
   * Get authorization headers with access token
   */
  private async getHeaders(): Promise<HeadersInit> {
    const token = await getAccessToken();
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "client-request-id": crypto.randomUUID(),
    };
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
        retryAfterSeconds?: number;
      };
      error.status = response.status;

      if (errorCode) {
        error.code = errorCode;
      }

      // Propagate Retry-After header on 429 responses
      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        if (retryAfter) {
          const parsed = parseInt(retryAfter, 10);
          if (!isNaN(parsed)) {
            error.retryAfterSeconds = parsed;
          }
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

  /**
   * GET request to Graph API
   */
  async get<T>(endpoint: string, version: "v1.0" | "beta" = "beta"): Promise<T> {
    const url = `${this.baseUrl}/${version}${endpoint}`;

    return retryWithBackoff(async () => {
      const headers = await this.getHeaders();
      const response = await fetch(url, {
        method: "GET",
        headers,
      });
      return this.handleResponse<T>(response);
    });
  }

  /**
   * GET request that returns a collection with automatic pagination
   * Uses Microsoft Graph Client SDK for reliable pagination through Intune proxies
   * (like NukeTune does - fixes 401 errors on Settings Catalog pagination)
   */
  async getCollection<T>(
    endpoint: string,
    version: "v1.0" | "beta" = "beta"
  ): Promise<T[]> {
    const results: T[] = [];
    const client = await this.getSdkClient();
    const url = `${this.baseUrl}/${version}${endpoint}`;

    // First request
    let response = await client.api(url).get() as GraphResponse<T>;
    if (response.value && Array.isArray(response.value)) {
      results.push(...response.value);
    }

    // Follow pagination using @odata.nextLink
    let nextLink = response["@odata.nextLink"];
    while (nextLink) {
      // Get fresh token for each page (in case of long pagination)
      const freshClient = await this.getSdkClient();
      response = await freshClient.api(nextLink).get() as GraphResponse<T>;
      if (response.value && Array.isArray(response.value)) {
        results.push(...response.value);
      }
      nextLink = response["@odata.nextLink"];
    }

    return results;
  }

  /**
   * POST request to Graph API
   */
  async post<T>(
    endpoint: string,
    data: unknown,
    version: "v1.0" | "beta" = "beta"
  ): Promise<T> {
    const url = `${this.baseUrl}/${version}${endpoint}`;

    return retryWithBackoff(async () => {
      const headers = await this.getHeaders();
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(data),
      });
      return this.handleResponse<T>(response);
    });
  }

  /**
   * POST request WITHOUT retry - use for operations where retry could create duplicates
   * (e.g., compliance policies that timeout but actually succeed)
   */
  async postNoRetry<T>(
    endpoint: string,
    data: unknown,
    version: "v1.0" | "beta" = "beta"
  ): Promise<T> {
    const url = `${this.baseUrl}/${version}${endpoint}`;
    const headers = await this.getHeaders();
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(data),
    });
    return this.handleResponse<T>(response);
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

    return retryWithBackoff(async () => {
      const headers = await this.getHeaders();
      const response = await fetch(url, {
        method: "PATCH",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify(data),
      });
      return this.handleResponse<T>(response);
    });
  }

  /**
   * DELETE request to Graph API
   * Treats 404 and 400/ResourceNotFound as success (idempotent delete - if resource is gone, mission accomplished)
   */
  async delete(endpoint: string, version: "v1.0" | "beta" = "beta"): Promise<void> {
    const url = `${this.baseUrl}/${version}${endpoint}`;

    return retryWithBackoff(async () => {
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
    });
  }

  /**
   * Execute a batch request against the Graph API $batch endpoint
   * All requests in a batch must use the same API version
   * Microsoft Graph supports up to 20 requests per batch
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

    return retryWithBackoff(async () => {
      const headers = await this.getHeaders();
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ requests }),
      });
      return this.handleResponse<BatchResult>(response);
    });
  }
}

/**
 * Create a new Graph API client instance
 */
export function createGraphClient(environment: CloudEnvironment = "global"): GraphClient {
  return new GraphClient(environment);
}
