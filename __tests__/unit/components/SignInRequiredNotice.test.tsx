import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen } from '@testing-library/react'
import { SignInRequiredNotice } from '@/components/landing/SignInRequiredNotice'

let searchParams = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
}))

describe('SignInRequiredNotice', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/?signin=required#faq')
    searchParams = new URLSearchParams('signin=required')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('announces the notice politely and removes the hint from the URL', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState')

    render(<SignInRequiredNotice isAuthenticated={false} onSignInClick={vi.fn()} />)

    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveTextContent('Sign in to continue to the wizard')
    expect(replaceState).toHaveBeenCalledWith(null, '', '/#faq')
    expect(window.location.search).toBe('')
  })

  it('stays visible after the hint leaves the URL, and can be dismissed', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <SignInRequiredNotice isAuthenticated={false} onSignInClick={vi.fn()} />
    )

    searchParams = new URLSearchParams()
    rerender(<SignInRequiredNotice isAuthenticated={false} onSignInClick={vi.fn()} />)
    expect(screen.getByText('Sign in to continue to the wizard')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Dismiss sign-in notice' }))
    expect(screen.queryByText('Sign in to continue to the wizard')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('starts sign-in from the notice', async () => {
    const user = userEvent.setup()
    const onSignInClick = vi.fn()
    render(<SignInRequiredNotice isAuthenticated={false} onSignInClick={onSignInClick} />)

    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(onSignInClick).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Sign in to continue to the wizard')).not.toBeInTheDocument()
  })

  it('shows nothing without the hint or for a signed-in user', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState')
    const { rerender } = render(
      <SignInRequiredNotice isAuthenticated onSignInClick={vi.fn()} />
    )
    expect(screen.getByRole('status')).toBeEmptyDOMElement()

    searchParams = new URLSearchParams()
    replaceState.mockClear()
    rerender(<SignInRequiredNotice isAuthenticated={false} onSignInClick={vi.fn()} />)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(replaceState).not.toHaveBeenCalled()
  })
})
