/* oxlint-disable react-doctor/async-await-in-loop -- retry attempts must remain sequential for backoff semantics. */
/**
 * Retry policy for Microsoft Graph requests.
 *
 * One policy for every request type:
 * - MAX_RETRIES retries after the first attempt (the specification value).
 * - A Retry-After header (delta-seconds or HTTP-date) sets the wait on 429 and 503.
 *   One wait is never longer than MAX_RETRY_AFTER_MS.
 * - Without Retry-After, the wait is exponential backoff with jitter.
 * - Waits go through a wait function that the run supplies, so cancel and pause
 *   take effect during a wait.
 */

/** Retries after the first attempt. The specification sets 3. */
export const MAX_RETRIES = 3;

/**
 * Longest single wait for a Retry-After value. Graph and Intune usually send values
 * below 30 seconds. A longer wait makes the run look stopped, and the next attempt
 * is counted against MAX_RETRIES, so a larger value still ends in a bounded time.
 */
export const MAX_RETRY_AFTER_MS = 60_000;

/** Message of the error that a wait throws when the run is cancelled. */
export const RUN_CANCELLED_MESSAGE = "Cancelled by user";

/**
 * Thrown when the run is cancelled during a retry wait.
 */
export class RunCancelledError extends Error {
  constructor() {
    super(RUN_CANCELLED_MESSAGE);
    this.name = "RunCancelledError";
  }
}

export function isRunCancelledError(error: unknown): error is RunCancelledError {
  return error instanceof Error && error.name === "RunCancelledError";
}

/**
 * True for an error that tells that the sign-in session is not usable
 * (AuthSessionExpiredError and its subclasses, for example InteractionRequiredError).
 * The check uses the error name, so this module does not import the auth module.
 */
export function isAuthSessionError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    (error.name === "AuthSessionExpiredError" || error.name === "InteractionRequiredError")
  );
}

/**
 * Wait for a time. Returns "cancelled" when the run was cancelled during the wait.
 * A pause holds the wait until the run resumes.
 */
export type RetryWait = (ms: number) => Promise<"completed" | "cancelled">;

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  /** Decides if an error can be retried. The default is isRetryableError. */
  isRetryable?: (error: unknown) => boolean;
  /** Wait function. The default waits without cancel or pause checks. */
  wait?: RetryWait;
}

const DEFAULT_RETRY_OPTIONS = {
  maxRetries: MAX_RETRIES,
  initialDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const plainWait: RetryWait = async (ms) => {
  await sleep(ms);
  return "completed";
};

/**
 * Parse a Retry-After header value (delta-seconds or HTTP-date) to milliseconds.
 * The result is capped at MAX_RETRY_AFTER_MS. Returns undefined for a missing or invalid value.
 */
export function parseRetryAfterMs(value: string | null | undefined, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  let ms: number;
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    ms = Math.round(Number(trimmed) * 1000);
  } else {
    const date = Date.parse(trimmed);
    if (Number.isNaN(date)) return undefined;
    ms = Math.max(date - now, 0);
  }
  return Math.min(ms, MAX_RETRY_AFTER_MS);
}

/**
 * Wait before retry number `attempt + 1`. A Retry-After value is used as given (capped).
 * Otherwise the wait is exponential backoff with "equal jitter": a random value between
 * half the backoff and the full backoff, so parallel requests do not retry at the same time.
 */
export function getRetryDelayMs(
  attempt: number,
  retryAfterMs?: number,
  options: { initialDelay?: number; maxDelay?: number; backoffMultiplier?: number } = {}
): number {
  if (retryAfterMs !== undefined) {
    return Math.min(retryAfterMs, MAX_RETRY_AFTER_MS);
  }
  const initialDelay = options.initialDelay ?? DEFAULT_RETRY_OPTIONS.initialDelay;
  const maxDelay = options.maxDelay ?? DEFAULT_RETRY_OPTIONS.maxDelay;
  const multiplier = options.backoffMultiplier ?? DEFAULT_RETRY_OPTIONS.backoffMultiplier;
  const backoff = Math.min(initialDelay * Math.pow(multiplier, attempt), maxDelay);
  return Math.round(backoff / 2 + Math.random() * (backoff / 2));
}

function getErrorStatus(error: unknown): number | undefined {
  if (error instanceof Response) {
    return error.status;
  }
  const errorWithStatus = error as { status?: unknown } | null;
  if (typeof errorWithStatus?.status === "number") {
    return errorWithStatus.status;
  }
  return undefined;
}

/**
 * Retry-After value of an error, in milliseconds. GraphClient sets retryAfterMs.
 */
export function getErrorRetryAfterMs(error: unknown): number | undefined {
  if (error instanceof Response) {
    return parseRetryAfterMs(error.headers.get("Retry-After"));
  }
  const errorWithRetry = error as { retryAfterMs?: unknown } | null;
  return typeof errorWithRetry?.retryAfterMs === "number" ? errorWithRetry.retryAfterMs : undefined;
}

/** Errors from the run itself (cancel, sign-in), not from Graph. They are never retried. */
function isRunControlError(error: unknown): boolean {
  return isRunCancelledError(error) || isAuthSessionError(error);
}

/**
 * Retry rule for requests that can be sent again without a side effect (GET, PATCH, DELETE,
 * and action POSTs sent with GraphClient.postAction).
 * Retryable: 429, 5xx, transient 400 errors from the Microsoft backend (not ResourceNotFound),
 * and network errors.
 */
export function isRetryableError(error: unknown): boolean {
  if (isRunControlError(error)) return false;

  const errorWithCode = error as { code?: unknown } | null;
  if (typeof errorWithCode?.code === "string") {
    const retryableCodes = ["TooManyRequests", "ServiceUnavailable", "GatewayTimeout"];
    if (retryableCodes.includes(errorWithCode.code)) {
      return true;
    }
  }

  const status = getErrorStatus(error);
  if (status === undefined) {
    // Network errors and other errors without a status
    return true;
  }

  if (status === 429 || (status >= 500 && status < 600)) {
    return true;
  }

  // Transient 400 errors from the Microsoft backend have generic messages.
  // ResourceNotFound is not transient: the resource does not exist.
  const message = (error as { message?: unknown }).message;
  if (status === 400 && typeof message === "string") {
    const lower = message.toLowerCase();
    if (lower.includes("resourcenotfound")) {
      console.log(`[Retry] 400 ResourceNotFound - resource does not exist, not retrying`);
      return false;
    }
    const transientPatterns = [
      "an error has occurred",
      "operation id (for customer support): 00000000-0000-0000-0000-000000000000",
      "transient",
      "temporary",
    ];
    if (transientPatterns.some((pattern) => lower.includes(pattern))) {
      console.log(`[Retry] Detected transient 400 error, will retry: ${message.substring(0, 100)}...`);
      return true;
    }
  }

  return false;
}

/**
 * Retry rule for a create (POST). A create is sent again only when the response proves
 * that Graph did not process the request: 429, or 503 with a Retry-After header.
 * Every other failure can come after Graph created the object, so the caller must
 * read the tenant before it sends the request again.
 */
export function isNotProcessedError(error: unknown): boolean {
  if (isRunControlError(error)) return false;
  const status = getErrorStatus(error);
  if (status === 429) return true;
  return status === 503 && getErrorRetryAfterMs(error) !== undefined;
}

/**
 * True when a failed write can have changed the tenant: a 5xx response that does not
 * prove "not processed", or an error without a status (network error, timeout).
 */
export function isOutcomeUnknownError(error: unknown): boolean {
  if (isRunControlError(error)) return false;
  const status = getErrorStatus(error);
  if (status === undefined) return true;
  if (status < 500 || status >= 600) return false;
  return !isNotProcessedError(error);
}

/**
 * Run a function and retry it with the retry policy.
 * Throws RunCancelledError when the run is cancelled during a wait.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  const isRetryable = options.isRetryable ?? isRetryableError;
  const wait = options.wait ?? plainWait;

  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= opts.maxRetries || !isRetryable(error)) {
        throw error;
      }

      const status = getErrorStatus(error);
      const delay = getRetryDelayMs(attempt, getErrorRetryAfterMs(error), opts);
      const statusInfo = status ? ` with status ${status}` : "";
      console.warn(
        `Request failed${statusInfo}. Retrying in ${delay}ms... (Attempt ${attempt + 1}/${opts.maxRetries})`
      );

      if ((await wait(delay)) === "cancelled") {
        throw new RunCancelledError();
      }
    }
  }
}
