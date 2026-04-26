import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen, waitFor } from '@/__tests__/setup/test-utils'
import { Navigation } from '@/components/Navigation'

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
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} alt={props.alt ?? ''} />,
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

vi.mock('@/components/ThemeToggle', () => ({
  LIGHT_DARK_THEME_CYCLE: ['light', 'dark'],
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}))

vi.mock('@/components/CloudEnvironmentSelector', () => ({
  CloudEnvironmentSelector: ({ open, onSelect, onCancel }: { open: boolean; onSelect: (env: 'global') => void; onCancel: () => void }) =>
    open ? (
      <div data-testid="cloud-selector">
        <button onClick={() => onSelect('global')}>Choose Global</button>
        <button onClick={onCancel}>Cancel Sign In</button>
      </div>
    ) : null,
}))

describe('Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    usePathname.mockReturnValue('/')
  })

  it('starts sign-in from the landing page and routes to the wizard on success', async () => {
    const user = userEvent.setup()
    useIsAuthenticated.mockReturnValue(false)
    signIn.mockResolvedValue(undefined)

    render(<Navigation />)

    expect(screen.getByText('OFFLINE')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Features' })).toHaveAttribute('href', '#features')

    await user.click(screen.getByRole('button', { name: /sign in/i }))
    await user.click(screen.getByRole('button', { name: 'Choose Global' }))

    await waitFor(() => {
      expect(signIn).toHaveBeenCalledWith('global')
    })

    expect(toastSuccess).toHaveBeenCalledWith('Successfully signed in!')
    expect(resetWizard).toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith('/wizard')
  })

  it('launches the wizard directly for authenticated users on nested routes', async () => {
    const user = userEvent.setup()
    useIsAuthenticated.mockReturnValue(true)
    usePathname.mockReturnValue('/templates')

    render(<Navigation />)

    expect(screen.getByText('CONNECTED')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Features' })).toHaveAttribute('href', '/#features')

    await user.click(screen.getByRole('button', { name: /launch wizard/i }))

    expect(resetWizard).toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith('/wizard')
  })

  it('shows an error toast when sign-in fails', async () => {
    const user = userEvent.setup()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    useIsAuthenticated.mockReturnValue(false)
    signIn.mockRejectedValue(new Error('sign-in failed'))

    render(<Navigation />)

    await user.click(screen.getByRole('button', { name: /sign in/i }))
    await user.click(screen.getByRole('button', { name: 'Choose Global' }))

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('Failed to sign in. Please try again.')
    })

    expect(push).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalledWith('Sign in error:', expect.any(Error))

    consoleError.mockRestore()
  })
})
