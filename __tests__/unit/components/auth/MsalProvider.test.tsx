import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen, waitFor } from '@testing-library/react'
import { MsalProvider } from '@/components/auth/MsalProvider'

const { baseMsalProvider, getMsalConfigurationError, initializeMsal, msalInstance } = vi.hoisted(() => ({
  baseMsalProvider: vi.fn(({ children }: { children: React.ReactNode; instance: unknown }) => (
    <div data-testid="base-msal-provider">{children}</div>
  )),
  initializeMsal: vi.fn(),
  getMsalConfigurationError: vi.fn<() => string | null>(() => null),
  msalInstance: { instance: 'test-msal' },
}))

vi.mock('@azure/msal-react', () => ({
  MsalProvider: baseMsalProvider,
  useMsal: () => ({ accounts: [] }),
}))

vi.mock('@/lib/auth/authUtils', () => ({
  signOut: vi.fn(),
}))

vi.mock('@/lib/auth/msalConfig', () => ({
  msalInstance,
  getMsalConfigurationError: () => getMsalConfigurationError(),
  initializeMsal: (...args: unknown[]) => initializeMsal(...args),
}))

function createDeferredPromise() {
  let resolve!: () => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

describe('MsalProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('waits for MSAL initialization before rendering children', async () => {
    const deferred = createDeferredPromise()
    initializeMsal.mockReturnValue(deferred.promise)

    const { container } = render(
      <MsalProvider>
        <span>Protected app</span>
      </MsalProvider>
    )

    expect(container).toBeEmptyDOMElement()
    expect(baseMsalProvider).not.toHaveBeenCalled()

    deferred.resolve()

    await waitFor(() => {
      expect(screen.getByText('Protected app')).toBeInTheDocument()
    })

    const [props] = baseMsalProvider.mock.calls[0]
    expect(props.instance).toBe(msalInstance)
  })

  it('shows an error panel instead of children when initialization fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    initializeMsal.mockRejectedValue(new Error('boom'))

    render(
      <MsalProvider>
        <span>Fallback render</span>
      </MsalProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Authentication unavailable')).toBeInTheDocument()
    })

    expect(screen.queryByText('Fallback render')).not.toBeInTheDocument()
    expect(baseMsalProvider).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalledWith('[MSAL] Failed to initialize:', expect.any(Error))

    consoleError.mockRestore()
  })

  it('shows the Entra configuration error before attempting MSAL initialization', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    getMsalConfigurationError.mockReturnValue('Microsoft Entra sign-in is not configured.')

    render(
      <MsalProvider>
        <span>Fallback render</span>
      </MsalProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Microsoft Entra sign-in is not configured.')).toBeInTheDocument()
    })

    expect(initializeMsal).not.toHaveBeenCalled()
    expect(baseMsalProvider).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
