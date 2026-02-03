import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { retryWithBackoff } from '@/lib/utils/retry'

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

      // Default maxRetries is 5, so 6 total calls
      expect(mockFn).toHaveBeenCalledTimes(6)
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
})
