import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen, waitFor } from '@/__tests__/setup/test-utils'
import { MsalProvider } from '@/components/auth/MsalProvider'

const { baseMsalProvider, initializeMsal, msalInstance } = vi.hoisted(() => ({
  baseMsalProvider: vi.fn(({ children }: { children: React.ReactNode }) => (
    <div data-testid="base-msal-provider">{children}</div>
  )),
  initializeMsal: vi.fn(),
  msalInstance: { instance: 'test-msal' },
}))

vi.mock('@azure/msal-react', () => ({
  MsalProvider: baseMsalProvider,
}))

vi.mock('@/lib/auth/msalConfig', () => ({
  msalInstance,
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

  it('renders children even when initialization fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    initializeMsal.mockRejectedValue(new Error('boom'))

    render(
      <MsalProvider>
        <span>Fallback render</span>
      </MsalProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Fallback render')).toBeInTheDocument()
    })

    expect(consoleError).toHaveBeenCalledWith('[MSAL] Failed to initialize:', expect.any(Error))

    consoleError.mockRestore()
  })
})
