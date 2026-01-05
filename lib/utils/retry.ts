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

      // Check if error is retryable (429 Too Many Requests or 5xx errors)
      if (error instanceof Response) {
        const status = error.status;
        const shouldRetry = status === 429 || (status >= 500 && status < 600);

        if (!shouldRetry) {
          throw error;
        }

        // Get Retry-After header if present
        const retryAfter = error.headers.get("Retry-After");
        const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;

        const delay = calculateDelay(attempt, opts, retryAfterSeconds);
        console.warn(
          `Request failed with status ${status}. Retrying in ${delay}ms... (Attempt ${attempt + 1}/${opts.maxRetries})`
        );

        await sleep(delay);
      } else {
        // For non-HTTP errors, still retry with backoff
        const delay = calculateDelay(attempt, opts);
        console.warn(
          `Request failed. Retrying in ${delay}ms... (Attempt ${attempt + 1}/${opts.maxRetries})`
        );
        await sleep(delay);
      }
    }
  }

  throw lastError;
}
