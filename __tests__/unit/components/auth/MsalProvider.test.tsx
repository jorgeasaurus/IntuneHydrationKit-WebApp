import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { MsalProvider, SESSION_TIMEOUT_MS } from '@/components/auth/MsalProvider'
import {
  beginExecution,
  cancelExecution,
  finishExecution,
  forceResetExecutionSessionForTests,
  pauseExecution,
} from '@/lib/hydration/executionStateStore'

const mocks = vi.hoisted(() => ({
  baseMsalProvider: vi.fn(({ children }: { children: React.ReactNode; instance: unknown }) => (
    <div data-testid="base-msal-provider">{children}</div>
  )),
  initializeMsal: vi.fn(),
  getMsalConfigurationError: vi.fn<() => string | null>(() => null),
  msalInstance: { instance: 'test-msal' },
  accounts: [] as unknown[],
  signOutForInactivity: vi.fn(),
  consumeInactivitySignOutNotice: vi.fn(() => false),
}))

vi.mock('@azure/msal-react', () => ({
  MsalProvider: mocks.baseMsalProvider,
  useMsal: () => ({ accounts: mocks.accounts }),
}))

vi.mock('@/lib/auth/authUtils', () => ({
  signOutForInactivity: () => mocks.signOutForInactivity(),
  consumeInactivitySignOutNotice: () => mocks.consumeInactivitySignOutNotice(),
}))

vi.mock('@/lib/auth/msalConfig', () => ({
  msalInstance: mocks.msalInstance,
  getMsalConfigurationError: () => mocks.getMsalConfigurationError(),
  initializeMsal: (...args: unknown[]) => mocks.initializeMsal(...args),
}))

const runConfiguration = {
  tenantId: 'tenant-id',
  homeAccountId: 'home-account-id',
  operationMode: 'create' as const,
  isPreview: false,
  selectedObjectCount: 3,
}

describe('MsalProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.accounts = []
    mocks.initializeMsal.mockResolvedValue(undefined)
    mocks.signOutForInactivity.mockResolvedValue(undefined)
    mocks.getMsalConfigurationError.mockReturnValue(null)
    mocks.consumeInactivitySignOutNotice.mockReturnValue(false)
    forceResetExecutionSessionForTests()
  })

  it('renders children on the server before MSAL initialization', () => {
    const html = renderToString(
      <MsalProvider>
        <span>Public landing content</span>
      </MsalProvider>
    )

    expect(html).toContain('Public landing content')
    expect(mocks.initializeMsal).not.toHaveBeenCalled()
  })

  it('renders children inside the MSAL context before initialization completes', () => {
    mocks.initializeMsal.mockReturnValue(new Promise(() => undefined))

    render(
      <MsalProvider>
        <span>Public landing content</span>
      </MsalProvider>
    )

    expect(screen.getByText('Public landing content')).toBeInTheDocument()
    expect(mocks.initializeMsal).toHaveBeenCalledTimes(1)
    const [props] = mocks.baseMsalProvider.mock.calls[0]
    expect(props.instance).toBe(mocks.msalInstance)
  })

  it('keeps children visible and shows an alert when initialization fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.initializeMsal.mockRejectedValue(new Error('boom'))

    render(
      <MsalProvider>
        <span>Page content</span>
      </MsalProvider>
    )

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Authentication unavailable')
    })
    expect(screen.getByRole('alert')).toHaveTextContent('boom')
    expect(screen.getByText('Page content')).toBeInTheDocument()
    expect(consoleError).toHaveBeenCalledWith('[MSAL] Failed to initialize:', expect.any(Error))

    consoleError.mockRestore()
  })

  it('shows the Entra configuration error without attempting MSAL initialization', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.getMsalConfigurationError.mockReturnValue('Microsoft Entra sign-in is not configured.')

    render(
      <MsalProvider>
        <span>Page content</span>
      </MsalProvider>
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Microsoft Entra sign-in is not configured.')
    expect(screen.getByText('Page content')).toBeInTheDocument()
    expect(mocks.initializeMsal).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('shows a dismissible notice after an inactivity sign-out', () => {
    mocks.consumeInactivitySignOutNotice.mockReturnValue(true)

    render(
      <MsalProvider>
        <span>Page content</span>
      </MsalProvider>
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Signed out due to inactivity')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss sign-out notice' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('SessionTimeoutHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mocks.accounts = [{ homeAccountId: 'home-account-id' }]
    mocks.initializeMsal.mockResolvedValue(undefined)
    mocks.signOutForInactivity.mockResolvedValue(undefined)
    mocks.getMsalConfigurationError.mockReturnValue(null)
    mocks.consumeInactivitySignOutNotice.mockReturnValue(false)
    forceResetExecutionSessionForTests()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    forceResetExecutionSessionForTests()
  })

  function renderProvider() {
    return render(
      <MsalProvider>
        <span>App</span>
      </MsalProvider>
    )
  }

  it('signs out after one hour without activity', () => {
    renderProvider()

    act(() => {
      vi.advanceTimersByTime(SESSION_TIMEOUT_MS - 1)
    })
    expect(mocks.signOutForInactivity).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(mocks.signOutForInactivity).toHaveBeenCalledTimes(1)
  })

  it('restarts the timer on user activity', () => {
    renderProvider()

    act(() => {
      vi.advanceTimersByTime(SESSION_TIMEOUT_MS - 1000)
    })
    fireEvent.keyDown(window)
    act(() => {
      vi.advanceTimersByTime(SESSION_TIMEOUT_MS - 1000)
    })

    expect(mocks.signOutForInactivity).not.toHaveBeenCalled()
  })

  it('does not run when no account is signed in', () => {
    mocks.accounts = []
    renderProvider()

    act(() => {
      vi.advanceTimersByTime(SESSION_TIMEOUT_MS * 2)
    })

    expect(mocks.signOutForInactivity).not.toHaveBeenCalled()
  })

  it('does not sign out while a run is running, paused, or cancelling', () => {
    renderProvider()
    let runId: number | null = null

    act(() => {
      runId = beginExecution(runConfiguration)
    })
    act(() => {
      vi.advanceTimersByTime(SESSION_TIMEOUT_MS * 2)
    })
    act(() => {
      pauseExecution(runId!)
    })
    act(() => {
      vi.advanceTimersByTime(SESSION_TIMEOUT_MS * 2)
    })
    act(() => {
      cancelExecution(runId!)
    })
    act(() => {
      vi.advanceTimersByTime(SESSION_TIMEOUT_MS * 2)
    })

    expect(mocks.signOutForInactivity).not.toHaveBeenCalled()
  })

  it('starts a full inactivity period when the run ends', () => {
    renderProvider()
    let runId: number | null = null

    act(() => {
      vi.advanceTimersByTime(SESSION_TIMEOUT_MS - 1000)
      runId = beginExecution(runConfiguration)
    })
    act(() => {
      vi.advanceTimersByTime(SESSION_TIMEOUT_MS * 3)
    })
    act(() => {
      finishExecution(runId!, { endTime: new Date(), summary: null, outcome: null, fatalError: null })
    })
    act(() => {
      vi.advanceTimersByTime(SESSION_TIMEOUT_MS - 1)
    })
    expect(mocks.signOutForInactivity).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(mocks.signOutForInactivity).toHaveBeenCalledTimes(1)
  })
})
