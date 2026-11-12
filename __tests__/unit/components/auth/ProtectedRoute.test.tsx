import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen, waitFor } from '@testing-library/react'
import { ProtectedRoute, SIGN_IN_REQUIRED_PATH } from '@/components/auth/ProtectedRoute'

const replace = vi.fn()
const isAuthenticated = vi.fn()
const inProgress = vi.fn()

vi.mock('@azure/msal-react', () => ({
  useIsAuthenticated: () => isAuthenticated(),
  useMsal: () => ({ inProgress: inProgress() }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}))

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    inProgress.mockReturnValue('none')
  })

  it('redirects unauthenticated users to the home page with a sign-in hint', async () => {
    isAuthenticated.mockReturnValue(false)

    render(
      <ProtectedRoute>
        <span>Secret content</span>
      </ProtectedRoute>
    )

    expect(screen.queryByText('Secret content')).not.toBeInTheDocument()

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/?signin=required')
    })
    expect(SIGN_IN_REQUIRED_PATH).toBe('/?signin=required')
  })

  it.each(['startup', 'login', 'logout'])('waits without redirecting while MSAL is in %s', (status) => {
    isAuthenticated.mockReturnValue(false)
    inProgress.mockReturnValue(status)

    render(
      <ProtectedRoute>
        <span>Secret content</span>
      </ProtectedRoute>
    )

    expect(screen.queryByText('Secret content')).not.toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
  })

  it('renders children for authenticated users', () => {
    isAuthenticated.mockReturnValue(true)

    render(
      <ProtectedRoute>
        <span>Secret content</span>
      </ProtectedRoute>
    )

    expect(screen.getByText('Secret content')).toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
  })
})
