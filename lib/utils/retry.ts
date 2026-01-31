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
  maxRetries: 5,
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
 * Retryable: 429 (Too Many Requests), 5xx (Server Errors),
 *            and transient 400 errors from Microsoft backend (except ResourceNotFound)
 * Non-retryable: 4xx (Client Errors) except 429 and transient 400s
 */
function isRetryableError(error: unknown): boolean {
  // Check for status property on error (added by GraphClient)
  const errorWithStatus = error as { status?: number; message?: string };
  if (typeof errorWithStatus.status === "number") {
    const status = errorWithStatus.status;

    // Always retry 429 and 5xx errors
    if (status === 429 || (status >= 500 && status < 600)) {
      return true;
    }

    // Check for transient 400 errors from Microsoft backend
    // These have generic "An error has occurred" messages and should be retried
    // EXCEPTION: ResourceNotFound errors should NOT be retried - the resource is gone
    if (status === 400 && errorWithStatus.message) {
      const message = errorWithStatus.message.toLowerCase();

      // ResourceNotFound means the resource doesn't exist - don't retry
      // This commonly happens during DELETE when the resource was already deleted
      if (message.includes("resourcenotfound")) {
        console.log(`[Retry] 400 ResourceNotFound - resource does not exist, not retrying`);
        return false;
      }

      // Transient backend errors contain these patterns
      const transientPatterns = [
        "an error has occurred",
        "operation id (for customer support): 00000000-0000-0000-0000-000000000000",
        "transient",
        "temporary",
      ];
      const isTransient = transientPatterns.some(pattern => message.includes(pattern));
      if (isTransient) {
        console.log(`[Retry] Detected transient 400 error, will retry: ${errorWithStatus.message.substring(0, 100)}...`);
        return true;
      }
    }

    // Other 4xx errors are not retryable
    return false;
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
