import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen, waitFor } from '@/__tests__/setup/test-utils'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'

const push = vi.fn()
const isAuthenticated = vi.fn()

vi.mock('@azure/msal-react', () => ({
  useIsAuthenticated: () => isAuthenticated(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects unauthenticated users to the home page', async () => {
    isAuthenticated.mockReturnValue(false)

    render(
      <ProtectedRoute>
        <span>Secret content</span>
      </ProtectedRoute>
    )

    expect(screen.queryByText('Secret content')).not.toBeInTheDocument()

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/')
    })
  })

  it('renders children for authenticated users', () => {
    isAuthenticated.mockReturnValue(true)

    render(
      <ProtectedRoute>
        <span>Secret content</span>
      </ProtectedRoute>
    )

    expect(screen.getByText('Secret content')).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })
})
