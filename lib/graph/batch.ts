/**
 * Microsoft Graph API $batch endpoint support
 * Enables batching multiple requests into a single HTTP call
 */

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
 * Check if a batch response status indicates a retryable error
 */
export function isBatchResponseRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
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
 * Get Retry-After value from batch response headers
 */
export function getRetryAfterFromBatchResponse(
  headers?: Record<string, string>
): number | undefined {
  if (!headers) return undefined;

  const retryAfter = headers["Retry-After"] || headers["retry-after"];
  if (!retryAfter) return undefined;

  const seconds = parseInt(retryAfter, 10);
  return isNaN(seconds) ? undefined : seconds * 1000; // Convert to milliseconds
}
