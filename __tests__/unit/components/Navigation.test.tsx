import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen, waitFor } from '@testing-library/react'
import { Navigation } from '@/components/Navigation'
import {
  beginExecution,
  finishExecution,
  forceResetExecutionSessionForTests,
  getExecutionState
} from '@/lib/hydration/executionStateStore'
import { EXECUTION_RECORD_STORAGE_KEY } from '@/lib/storageKeys'

const push = vi.fn()
const signIn = vi.fn()
const resetWizard = vi.fn()
const useIsAuthenticated = vi.fn()
const usePathname = vi.fn()
const toastSuccess = vi.fn()
const toastError = vi.fn()

vi.mock('@azure/msal-react', () => ({
  useIsAuthenticated: () => useIsAuthenticated(),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => usePathname(),
  useRouter: () => ({ push }),
}))

vi.mock('next/image', () => ({
  default: () => null,
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('@/lib/auth/authUtils', () => ({
  signIn: (...args: unknown[]) => signIn(...args),
}))

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}))

vi.mock('@/hooks/useWizardState', () => ({
  useWizardState: () => ({ resetWizard }),
}))

describe('Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    forceResetExecutionSessionForTests()
    usePathname.mockReturnValue('/')
  })

  it('starts sign-in from the landing page and routes to the wizard on success', async () => {
    const user = userEvent.setup()
    useIsAuthenticated.mockReturnValue(false)
    signIn.mockResolvedValue(undefined)

    render(<Navigation />)

    expect(screen.getByRole('navigation').parentElement).toHaveClass(
      'mx-auto',
      'w-full',
      'max-w-screen-2xl',
      'px-4',
      'sm:px-6',
    )
    expect(screen.getByText('OFFLINE')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Intune Hydration Kit home' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Features' })).toHaveAttribute('href', '#features')

    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(signIn).toHaveBeenCalled()
    })

    expect(toastSuccess).toHaveBeenCalledWith('Successfully signed in!')
    expect(resetWizard).toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith('/wizard')
  })

  it('launches the wizard directly for authenticated users on nested routes', async () => {
    const user = userEvent.setup()
    useIsAuthenticated.mockReturnValue(true)
    usePathname.mockReturnValue('/templates')
    const runId = beginExecution({
      tenantId: 'tenant-1',
      homeAccountId: 'account-1',
      operationMode: 'create',
      isPreview: false,
      selectedObjectCount: 1
    })
    if (runId === null) throw new Error('Expected a test run ID')
    finishExecution(runId, {
      endTime: new Date('2026-08-17T04:00:00.000Z'),
      summary: null,
      outcome: 'failed',
      fatalError: 'Test completion'
    })
    sessionStorage.setItem(EXECUTION_RECORD_STORAGE_KEY, '{"outcome":"failed"}')

    render(<Navigation />)

    expect(screen.getByText('CONNECTED')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Features' })).toHaveAttribute('href', '/#features')

    await user.click(screen.getByRole('button', { name: /launch wizard/i }))

    expect(resetWizard).toHaveBeenCalled()
    expect(sessionStorage.getItem(EXECUTION_RECORD_STORAGE_KEY)).toBeNull()
    expect(getExecutionState().phase).toBe('idle')
    expect(push).toHaveBeenCalledWith('/wizard')
  })

  it('shows an error toast when sign-in fails', async () => {
    const user = userEvent.setup()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    useIsAuthenticated.mockReturnValue(false)
    signIn.mockRejectedValue(new Error('sign-in failed'))

    render(<Navigation />)

    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('Failed to sign in. Please try again.')
    })

    expect(push).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalledWith('Sign in error:', expect.any(Error))

    consoleError.mockRestore()
  })
})
