/**
 * Exponential backoff retry utility for Graph API requests
 */

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2,
};

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate delay for exponential backoff
 */
function calculateDelay(
  retryCount: number,
  options: Required<RetryOptions>,
  retryAfter?: number
): number {
  if (retryAfter) {
    return retryAfter * 1000; // Convert seconds to milliseconds
  }

  const delay = options.initialDelay * Math.pow(options.backoffMultiplier, retryCount);
  return Math.min(delay, options.maxDelay);
}

/**
 * Check if an error has a status code that should be retried
 * Retryable: 429 (Too Many Requests), 5xx (Server Errors)
 * Non-retryable: 4xx (Client Errors) except 429
 */
function isRetryableError(error: unknown): boolean {
  // Check for status property on error (added by GraphClient)
  const errorWithStatus = error as { status?: number };
  if (typeof errorWithStatus.status === "number") {
    const status = errorWithStatus.status;
    // Only retry 429 and 5xx errors
    return status === 429 || (status >= 500 && status < 600);
  }

  // Check if it's a Response object
  if (error instanceof Response) {
    const status = error.status;
    return status === 429 || (status >= 500 && status < 600);
  }

  // For other errors (network errors, etc.), retry by default
  return true;
}

/**
 * Get status code from error if available
 */
function getErrorStatus(error: unknown): number | undefined {
  const errorWithStatus = error as { status?: number };
  if (typeof errorWithStatus.status === "number") {
    return errorWithStatus.status;
  }
  if (error instanceof Response) {
    return error.status;
  }
  return undefined;
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Don't retry on last attempt
      if (attempt === opts.maxRetries) {
        break;
      }

      // Check if error is retryable
      if (!isRetryableError(error)) {
        // Non-retryable error (4xx except 429) - throw immediately
        const status = getErrorStatus(error);
        console.warn(`Request failed with status ${status}. Not retrying (non-retryable error).`);
        throw error;
      }

      // Get status for logging
      const status = getErrorStatus(error);

      // Check for Retry-After header if it's a Response
      let retryAfterSeconds: number | undefined;
      if (error instanceof Response) {
        const retryAfter = error.headers.get("Retry-After");
        retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;
      }

      const delay = calculateDelay(attempt, opts, retryAfterSeconds);
      const statusInfo = status ? ` with status ${status}` : "";
      console.warn(
        `Request failed${statusInfo}. Retrying in ${delay}ms... (Attempt ${attempt + 1}/${opts.maxRetries})`
      );

      await sleep(delay);
    }
  }

  throw lastError;
}
