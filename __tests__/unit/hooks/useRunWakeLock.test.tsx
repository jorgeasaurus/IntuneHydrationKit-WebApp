import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRunWakeLock } from '@/hooks/useRunWakeLock'
import {
  beginExecution,
  cancelExecution,
  finishExecution,
  forceResetExecutionSessionForTests,
  pauseExecution,
  resumeExecution,
  updateExecutionStateForRun,
} from '@/lib/hydration/executionStateStore'

interface FakeSentinel {
  released: boolean
  release: ReturnType<typeof vi.fn>
}

let sentinels: FakeSentinel[] = []
let visibility: DocumentVisibilityState = 'visible'
const request = vi.fn(async () => {
  const sentinel: FakeSentinel = {
    released: false,
    release: vi.fn(async () => {
      sentinel.released = true
    }),
  }
  sentinels.push(sentinel)
  return sentinel
})

function setVisibility(state: DocumentVisibilityState): void {
  visibility = state
  document.dispatchEvent(new Event('visibilitychange'))
}

function startRunningRun(): number {
  const runId = beginExecution({
    tenantId: 'tenant', homeAccountId: 'account', operationMode: 'create', isPreview: false, selectedObjectCount: 1,
  })
  if (runId === null) throw new Error('Run did not start')
  updateExecutionStateForRun(runId, (state) => ({ ...state, phase: 'running' }))
  return runId
}

const activeLocks = (): FakeSentinel[] => sentinels.filter((sentinel) => !sentinel.released)

describe('useRunWakeLock', () => {
  beforeEach(() => {
    sentinels = []
    visibility = 'visible'
    request.mockClear()
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } })
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
  })

  afterEach(() => {
    act(() => forceResetExecutionSessionForTests())
    Reflect.deleteProperty(navigator, 'wakeLock')
    Reflect.deleteProperty(document, 'visibilityState')
  })

  it('does not request a lock without an active run', () => {
    renderHook(() => useRunWakeLock())
    expect(request).not.toHaveBeenCalled()
  })

  it('holds the lock while running, releases it on pause, and requests it again on resume', async () => {
    renderHook(() => useRunWakeLock())
    let runId = 0
    act(() => {
      runId = startRunningRun()
    })
    await waitFor(() => expect(activeLocks()).toHaveLength(1))
    expect(request).toHaveBeenCalledWith('screen')

    act(() => {
      pauseExecution(runId)
    })
    await waitFor(() => expect(activeLocks()).toHaveLength(0))

    act(() => {
      resumeExecution(runId)
    })
    await waitFor(() => expect(activeLocks()).toHaveLength(1))
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('keeps the lock while cancelling and releases it when the run finishes', async () => {
    renderHook(() => useRunWakeLock())
    let runId = 0
    act(() => {
      runId = startRunningRun()
    })
    await waitFor(() => expect(activeLocks()).toHaveLength(1))

    act(() => {
      cancelExecution(runId)
    })
    expect(activeLocks()).toHaveLength(1)

    act(() => {
      finishExecution(runId, { endTime: new Date(), summary: null, outcome: 'cancelled', fatalError: null })
    })
    await waitFor(() => expect(activeLocks()).toHaveLength(0))
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('requests the lock again when the tab becomes visible after the browser released it', async () => {
    renderHook(() => useRunWakeLock())
    act(() => {
      startRunningRun()
    })
    await waitFor(() => expect(activeLocks()).toHaveLength(1))

    // The browser releases the lock when the tab is hidden.
    sentinels[0].released = true
    act(() => setVisibility('hidden'))
    expect(request).toHaveBeenCalledTimes(1)

    act(() => setVisibility('visible'))
    await waitFor(() => expect(activeLocks()).toHaveLength(1))
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('releases the lock on unmount', async () => {
    const { unmount } = renderHook(() => useRunWakeLock())
    act(() => {
      startRunningRun()
    })
    await waitFor(() => expect(activeLocks()).toHaveLength(1))

    unmount()

    expect(activeLocks()).toHaveLength(0)
  })

  it('continues silently when the browser refuses the lock', async () => {
    request.mockRejectedValueOnce(new DOMException('Not allowed', 'NotAllowedError'))
    renderHook(() => useRunWakeLock())
    act(() => {
      startRunningRun()
    })
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
    expect(activeLocks()).toHaveLength(0)
  })

  it('does nothing when the browser has no Screen Wake Lock API', () => {
    Reflect.deleteProperty(navigator, 'wakeLock')
    renderHook(() => useRunWakeLock())
    expect(() =>
      act(() => {
        startRunningRun()
      }),
    ).not.toThrow()
    expect(request).not.toHaveBeenCalled()
  })
})
