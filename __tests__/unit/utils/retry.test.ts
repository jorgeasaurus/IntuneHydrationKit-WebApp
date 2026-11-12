import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  MAX_RETRIES,
  MAX_RETRY_AFTER_MS,
  RunCancelledError,
  getRetryDelayMs,
  isNotProcessedError,
  isOutcomeUnknownError,
  parseRetryAfterMs,
  retryWithBackoff,
} from '@/lib/utils/retry'

describe('retryWithBackoff', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('successful execution', () => {
    it('returns result on first attempt when function succeeds', async () => {
      const mockFn = vi.fn().mockResolvedValue('success')

      const result = await retryWithBackoff(mockFn)

      expect(result).toBe('success')
      expect(mockFn).toHaveBeenCalledTimes(1)
    })

    it('returns result after retries when function eventually succeeds', async () => {
      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success')

      const resultPromise = retryWithBackoff(mockFn)
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result).toBe('success')
      expect(mockFn).toHaveBeenCalledTimes(3)
    })
  })

  describe('retry behavior', () => {
    it('retries on 429 (Too Many Requests) error', async () => {
      const error429 = Object.assign(new Error('Rate limited'), { status: 429 })
      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(error429)
        .mockResolvedValue('success')

      const resultPromise = retryWithBackoff(mockFn)
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result).toBe('success')
      expect(mockFn).toHaveBeenCalledTimes(2)
    })

    it('retries on 5xx server errors', async () => {
      const error500 = Object.assign(new Error('Server error'), { status: 500 })
      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(error500)
        .mockResolvedValue('success')

      const resultPromise = retryWithBackoff(mockFn)
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result).toBe('success')
      expect(mockFn).toHaveBeenCalledTimes(2)
    })

    it('retries on 503 service unavailable', async () => {
      const error503 = Object.assign(new Error('Service unavailable'), { status: 503 })
      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(error503)
        .mockResolvedValue('success')

      const resultPromise = retryWithBackoff(mockFn)
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result).toBe('success')
      expect(mockFn).toHaveBeenCalledTimes(2)
    })

    it('retries on network errors (no status)', async () => {
      const networkError = new Error('Network error')
      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(networkError)
        .mockResolvedValue('success')

      const resultPromise = retryWithBackoff(mockFn)
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result).toBe('success')
      expect(mockFn).toHaveBeenCalledTimes(2)
    })
  })

  describe('non-retryable errors', () => {
    it('does not retry on 400 Bad Request', async () => {
      const error400 = Object.assign(new Error('Bad request'), { status: 400 })
      const mockFn = vi.fn().mockRejectedValue(error400)

      await expect(retryWithBackoff(mockFn)).rejects.toThrow('Bad request')
      expect(mockFn).toHaveBeenCalledTimes(1)
    })

    it('does not retry on 401 Unauthorized', async () => {
      const error401 = Object.assign(new Error('Unauthorized'), { status: 401 })
      const mockFn = vi.fn().mockRejectedValue(error401)

      await expect(retryWithBackoff(mockFn)).rejects.toThrow('Unauthorized')
      expect(mockFn).toHaveBeenCalledTimes(1)
    })

    it('does not retry on 403 Forbidden', async () => {
      const error403 = Object.assign(new Error('Forbidden'), { status: 403 })
      const mockFn = vi.fn().mockRejectedValue(error403)

      await expect(retryWithBackoff(mockFn)).rejects.toThrow('Forbidden')
      expect(mockFn).toHaveBeenCalledTimes(1)
    })

    it('does not retry on 404 Not Found', async () => {
      const error404 = Object.assign(new Error('Not found'), { status: 404 })
      const mockFn = vi.fn().mockRejectedValue(error404)

      await expect(retryWithBackoff(mockFn)).rejects.toThrow('Not found')
      expect(mockFn).toHaveBeenCalledTimes(1)
    })
  })

  describe('max retries', () => {
    it('throws after max retries exceeded', async () => {
      const error500 = Object.assign(new Error('Server error'), { status: 500 })
      const mockFn = vi.fn().mockRejectedValue(error500)

      const resultPromise = retryWithBackoff(mockFn, { maxRetries: 3 })

      let caughtError: Error | null = null
      resultPromise.catch((e) => { caughtError = e })

      await vi.runAllTimersAsync()

      expect(mockFn).toHaveBeenCalledTimes(4) // 1 initial + 3 retries
      expect(caughtError).toBeTruthy()
      expect(caughtError!.message).toBe('Server error')
    })

    it('respects custom maxRetries option', async () => {
      const error500 = Object.assign(new Error('Server error'), { status: 500 })
      const mockFn = vi.fn().mockRejectedValue(error500)

      const resultPromise = retryWithBackoff(mockFn, { maxRetries: 1 })

      let caughtError: Error | null = null
      resultPromise.catch((e) => { caughtError = e })

      await vi.runAllTimersAsync()

      expect(mockFn).toHaveBeenCalledTimes(2) // 1 initial + 1 retry
      expect(caughtError).toBeTruthy()
    })

    it('does not retry when maxRetries is 0', async () => {
      const error500 = Object.assign(new Error('Server error'), { status: 500 })
      const mockFn = vi.fn().mockRejectedValue(error500)

      const resultPromise = retryWithBackoff(mockFn, { maxRetries: 0 })

      let caughtError: Error | null = null
      resultPromise.catch((e) => { caughtError = e })

      await vi.runAllTimersAsync()

      expect(mockFn).toHaveBeenCalledTimes(1)
      expect(caughtError).toBeTruthy()
    })
  })

  describe('backoff delay calculation', () => {
    // Jitter at its maximum gives the full backoff, so the timings are exact.
    beforeEach(() => {
      vi.spyOn(Math, 'random').mockReturnValue(0.999999)
    })

    it('uses exponential backoff with default options', async () => {
      const error500 = Object.assign(new Error('Server error'), { status: 500 })
      const mockFn = vi.fn().mockRejectedValue(error500)

      const resultPromise = retryWithBackoff(mockFn, { maxRetries: 3 })
      resultPromise.catch(() => {}) // Attach handler immediately

      // Initial attempt fails immediately
      await vi.advanceTimersByTimeAsync(0)
      expect(mockFn).toHaveBeenCalledTimes(1)

      // First retry after 1000ms (initialDelay)
      await vi.advanceTimersByTimeAsync(1000)
      expect(mockFn).toHaveBeenCalledTimes(2)

      // Second retry after 2000ms (1000 * 2)
      await vi.advanceTimersByTimeAsync(2000)
      expect(mockFn).toHaveBeenCalledTimes(3)

      // Third retry after 4000ms (2000 * 2)
      await vi.advanceTimersByTimeAsync(4000)
      expect(mockFn).toHaveBeenCalledTimes(4)
    })

    it('respects maxDelay option', async () => {
      const error500 = Object.assign(new Error('Server error'), { status: 500 })
      const mockFn = vi.fn().mockRejectedValue(error500)

      const resultPromise = retryWithBackoff(mockFn, {
        maxRetries: 5,
        initialDelay: 5000,
        maxDelay: 10000,
        backoffMultiplier: 2,
      })
      resultPromise.catch(() => {}) // Attach handler immediately

      // First attempt immediately
      await vi.advanceTimersByTimeAsync(0)
      expect(mockFn).toHaveBeenCalledTimes(1)

      // First retry: 5000ms
      await vi.advanceTimersByTimeAsync(5000)
      expect(mockFn).toHaveBeenCalledTimes(2)

      // Second retry: 10000ms (capped at maxDelay)
      await vi.advanceTimersByTimeAsync(10000)
      expect(mockFn).toHaveBeenCalledTimes(3)

      // Third retry: still 10000ms (capped)
      await vi.advanceTimersByTimeAsync(10000)
      expect(mockFn).toHaveBeenCalledTimes(4)
    })

    it('respects custom initialDelay', async () => {
      const error500 = Object.assign(new Error('Server error'), { status: 500 })
      const mockFn = vi.fn().mockRejectedValue(error500)

      const resultPromise = retryWithBackoff(mockFn, {
        maxRetries: 1,
        initialDelay: 500,
      })
      resultPromise.catch(() => {}) // Attach handler immediately

      await vi.advanceTimersByTimeAsync(0)
      expect(mockFn).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(500)
      expect(mockFn).toHaveBeenCalledTimes(2)
    })
  })

  describe('Response object handling', () => {
    it('handles Response with 429 status and Retry-After header', async () => {
      const response429 = new Response(null, {
        status: 429,
        headers: { 'Retry-After': '3' },
      })
      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(response429)
        .mockResolvedValue('success')

      const resultPromise = retryWithBackoff(mockFn)

      await vi.advanceTimersByTimeAsync(0)
      expect(mockFn).toHaveBeenCalledTimes(1)

      // Should use Retry-After value (3 seconds = 3000ms)
      await vi.advanceTimersByTimeAsync(3000)
      expect(mockFn).toHaveBeenCalledTimes(2)

      const result = await resultPromise
      expect(result).toBe('success')
    })

    it('handles Response with 500 status', async () => {
      const response500 = new Response(null, { status: 500 })
      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(response500)
        .mockResolvedValue('success')

      const resultPromise = retryWithBackoff(mockFn)
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result).toBe('success')
      expect(mockFn).toHaveBeenCalledTimes(2)
    })

    it('does not retry Response with 400 status', async () => {
      const response400 = new Response(null, { status: 400 })
      const mockFn = vi.fn().mockRejectedValue(response400)

      await expect(retryWithBackoff(mockFn)).rejects.toBe(response400)
      expect(mockFn).toHaveBeenCalledTimes(1)
    })
  })

  describe('edge cases', () => {
    it('handles function that returns undefined', async () => {
      const mockFn = vi.fn().mockResolvedValue(undefined)

      const result = await retryWithBackoff(mockFn)

      expect(result).toBeUndefined()
      expect(mockFn).toHaveBeenCalledTimes(1)
    })

    it('handles function that returns null', async () => {
      const mockFn = vi.fn().mockResolvedValue(null)

      const result = await retryWithBackoff(mockFn)

      expect(result).toBeNull()
      expect(mockFn).toHaveBeenCalledTimes(1)
    })

    it('handles function that returns complex object', async () => {
      const complexObject = { data: { nested: [1, 2, 3] }, meta: { count: 3 } }
      const mockFn = vi.fn().mockResolvedValue(complexObject)

      const result = await retryWithBackoff(mockFn)

      expect(result).toEqual(complexObject)
    })

    it('uses default options when none provided', async () => {
      const error500 = Object.assign(new Error('Server error'), { status: 500 })
      const mockFn = vi.fn().mockRejectedValue(error500)

      const resultPromise = retryWithBackoff(mockFn)
      resultPromise.catch(() => {}) // Attach handler immediately

      await vi.runAllTimersAsync()

      // Default maxRetries is MAX_RETRIES (3), so 4 total calls
      expect(MAX_RETRIES).toBe(3)
      expect(mockFn).toHaveBeenCalledTimes(4)
    })

    it('preserves error type on final throw', async () => {
      class CustomError extends Error {
        code = 'CUSTOM_ERROR'
      }
      const customError = new CustomError('Custom error')
      const mockFn = vi.fn().mockRejectedValue(customError)

      try {
        await retryWithBackoff(mockFn, { maxRetries: 0 })
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(CustomError)
        expect((error as CustomError).code).toBe('CUSTOM_ERROR')
      }
    })
  })

  describe('Retry-After and limits', () => {
    it('parses delta-seconds and HTTP-date values and rejects invalid values', () => {
      const now = Date.parse('2026-01-01T00:00:00Z')
      expect(parseRetryAfterMs('7', now)).toBe(7000)
      expect(parseRetryAfterMs(' 1.5 ', now)).toBe(1500)
      expect(parseRetryAfterMs('Thu, 01 Jan 2026 00:00:20 GMT', now)).toBe(20000)
      expect(parseRetryAfterMs('Wed, 31 Dec 2025 23:00:00 GMT', now)).toBe(0)
      expect(parseRetryAfterMs('soon', now)).toBeUndefined()
      expect(parseRetryAfterMs(null, now)).toBeUndefined()
    })

    it('caps one Retry-After wait at MAX_RETRY_AFTER_MS', () => {
      expect(parseRetryAfterMs('600')).toBe(MAX_RETRY_AFTER_MS)
      expect(getRetryDelayMs(0, 600_000)).toBe(MAX_RETRY_AFTER_MS)
    })

    it('adds jitter to exponential backoff (between half and the full backoff)', () => {
      const random = vi.spyOn(Math, 'random')
      random.mockReturnValue(0)
      expect(getRetryDelayMs(2)).toBe(2000)
      random.mockReturnValue(0.999999)
      expect(getRetryDelayMs(2)).toBe(4000)
    })

    it('honours retryAfterMs on a 503 error', async () => {
      const error503 = Object.assign(new Error('Unavailable'), { status: 503, retryAfterMs: 9000 })
      const mockFn = vi.fn().mockRejectedValueOnce(error503).mockResolvedValue('ok')

      const resultPromise = retryWithBackoff(mockFn)
      await vi.advanceTimersByTimeAsync(8999)
      expect(mockFn).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1)
      expect(mockFn).toHaveBeenCalledTimes(2)
      await expect(resultPromise).resolves.toBe('ok')
    })
  })

  describe('create (POST) rule', () => {
    const withStatus = (status: number, extra: Record<string, unknown> = {}) =>
      Object.assign(new Error(`[${status}]`), { status, ...extra })

    it('treats only 429 and 503 with Retry-After as "not processed"', () => {
      expect(isNotProcessedError(withStatus(429))).toBe(true)
      expect(isNotProcessedError(withStatus(503, { retryAfterMs: 1000 }))).toBe(true)
      expect(isNotProcessedError(withStatus(503))).toBe(false)
      expect(isNotProcessedError(withStatus(500))).toBe(false)
      expect(isNotProcessedError(withStatus(504))).toBe(false)
      expect(isNotProcessedError(new TypeError('Failed to fetch'))).toBe(false)
    })

    it('treats other 5xx responses and network errors as "outcome unknown"', () => {
      expect(isOutcomeUnknownError(withStatus(500))).toBe(true)
      expect(isOutcomeUnknownError(withStatus(503))).toBe(true)
      expect(isOutcomeUnknownError(withStatus(504))).toBe(true)
      expect(isOutcomeUnknownError(new TypeError('Failed to fetch'))).toBe(true)
      expect(isOutcomeUnknownError(withStatus(429))).toBe(false)
      expect(isOutcomeUnknownError(withStatus(503, { retryAfterMs: 1000 }))).toBe(false)
      expect(isOutcomeUnknownError(withStatus(400))).toBe(false)
      expect(isOutcomeUnknownError(new RunCancelledError())).toBe(false)
    })

    it('does not retry a create on a 504 when the "not processed" rule is used', async () => {
      const mockFn = vi.fn().mockRejectedValue(withStatus(504))
      await expect(retryWithBackoff(mockFn, { isRetryable: isNotProcessedError })).rejects.toThrow('[504]')
      expect(mockFn).toHaveBeenCalledTimes(1)
    })
  })

  describe('run controls', () => {
    it('throws RunCancelledError when the run is cancelled during a wait', async () => {
      const mockFn = vi.fn().mockRejectedValue(Object.assign(new Error('Busy'), { status: 429, retryAfterMs: 60000 }))
      const wait = vi.fn().mockResolvedValue('cancelled')

      await expect(retryWithBackoff(mockFn, { wait })).rejects.toBeInstanceOf(RunCancelledError)
      expect(mockFn).toHaveBeenCalledTimes(1)
      expect(wait).toHaveBeenCalledWith(60000)
    })

    it('does not retry cancel or sign-in errors', async () => {
      const authError = Object.assign(new Error('Session expired'), { name: 'InteractionRequiredError' })
      const cancelFn = vi.fn().mockRejectedValue(new RunCancelledError())
      const authFn = vi.fn().mockRejectedValue(authError)

      await expect(retryWithBackoff(cancelFn)).rejects.toBeInstanceOf(RunCancelledError)
      await expect(retryWithBackoff(authFn)).rejects.toBe(authError)
      expect(cancelFn).toHaveBeenCalledTimes(1)
      expect(authFn).toHaveBeenCalledTimes(1)
    })
  })
})
