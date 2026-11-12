/**
 * Microsoft Graph API $batch endpoint support
 * Enables batching multiple requests into a single HTTP call
 */

import { parseRetryAfterMs } from "@/lib/utils/retry";

/**
 * Single request within a batch
 */
export interface BatchRequest {
  /** Unique identifier for correlating responses */
  id: string;
  /** HTTP method */
  method: "GET" | "POST" | "PATCH" | "DELETE";
  /** Relative URL (e.g., "/groups" not "https://graph.microsoft.com/v1.0/groups") */
  url: string;
  /** Request body for POST/PATCH */
  body?: unknown;
  /** Optional headers for this specific request */
  headers?: Record<string, string>;
}

/**
 * Single response from a batch
 */
export interface BatchResponse {
  /** Correlates to the request id */
  id: string;
  /** HTTP status code */
  status: number;
  /** Response headers */
  headers?: Record<string, string>;
  /** Response body (parsed JSON) */
  body?: unknown;
}

/**
 * Full batch response from Graph API
 */
export interface BatchResult {
  responses: BatchResponse[];
}

/**
 * Parsed error from a batch response
 */
export interface BatchResponseError {
  id: string;
  status: number;
  code?: string;
  message: string;
  innerMessage?: string;
}

/**
 * API version mapping for different resource types
 */
export type ApiVersion = "v1.0" | "beta";

/**
 * Check if a batch response status indicates success
 */
export function isBatchResponseSuccess(status: number): boolean {
  return status >= 200 && status < 300;
}

/**
 * Check if a batch response proves that Graph did not process the request, so the
 * request can be sent again: 429, or 503 with a Retry-After header.
 * Other 5xx responses can come after Graph created the object (see isBatchResponseOutcomeUnknown).
 */
export function isBatchResponseRetryable(response: Pick<BatchResponse, "status" | "headers">): boolean {
  if (response.status === 429) return true;
  return response.status === 503 && getRetryAfterFromBatchResponse(response.headers) !== undefined;
}

/**
 * Check if a batch response is a 5xx error after which the object can exist.
 */
export function isBatchResponseOutcomeUnknown(response: Pick<BatchResponse, "status" | "headers">): boolean {
  return response.status >= 500 && response.status < 600 && !isBatchResponseRetryable(response);
}

/**
 * Check if a batch response indicates the resource already exists
 */
export function isBatchResponseConflict(status: number): boolean {
  return status === 409;
}

/**
 * Extract error details from a batch response body
 */
export function extractBatchError(response: BatchResponse): BatchResponseError {
  const body = response.body as Record<string, unknown> | undefined;

  let code: string | undefined;
  let message = `HTTP ${response.status}`;
  let innerMessage: string | undefined;

  if (body) {
    // Standard Graph error format
    const error = body.error as Record<string, unknown> | undefined;
    if (error) {
      code = error.code as string | undefined;
      message = (error.message as string) || message;
      const innerError = (error.innerError || error.innererror) as Record<string, unknown> | undefined;
      innerMessage = innerError?.message as string | undefined;
    }
    // Intune-specific format
    else if (body.Message) {
      message = body.Message as string;
    }
  }

  return {
    id: response.id,
    status: response.status,
    code,
    message,
    innerMessage,
  };
}

/**
 * Get the Retry-After value (delta-seconds or HTTP-date) from batch response headers,
 * in milliseconds and capped like every other Retry-After wait.
 */
export function getRetryAfterFromBatchResponse(
  headers?: Record<string, string>
): number | undefined {
  if (!headers) return undefined;
  const key = Object.keys(headers).find((name) => name.toLowerCase() === "retry-after");
  return key ? parseRetryAfterMs(headers[key]) : undefined;
}
