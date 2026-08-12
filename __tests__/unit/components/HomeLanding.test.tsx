import type { AnchorHTMLAttributes, ComponentProps } from 'react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen } from '@testing-library/react'
import { HomeLanding } from '@/components/landing/HomeLanding'
import packageJson from '@/package.json'

const onSignInClick = vi.fn()
const onContinue = vi.fn()

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('@/components/Navigation', () => ({
  Navigation: () => <nav data-testid="navigation" />,
}))

vi.mock('@/components/WebAppDemo', () => ({
  WebAppDemo: () => <div data-testid="web-app-demo" />,
}))

vi.mock('@/components/ui/animated-counter', () => ({
  AnimatedCounter: ({ value }: { value: number }) => <span>{value}</span>,
}))

function renderLanding(overrides: Partial<ComponentProps<typeof HomeLanding>> = {}) {
  render(
    <HomeLanding
      isAuthenticated={false}
      onSignInClick={onSignInClick}
      onContinue={onContinue}
      {...overrides}
    />
  )
}

describe('HomeLanding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the current app version with product proof and core sections', () => {
    renderLanding()

    expect(screen.getByRole('heading', { name: 'Intune Hydration Kit' })).toBeInTheDocument()
    expect(screen.getByText(`v${packageJson.version}`)).toBeInTheDocument()
    expect(screen.getByTestId('web-app-demo')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /PowerShell Module/i })[0]).toHaveAttribute(
      'href',
      'https://github.com/jorgeasaurus/IntuneHydrationKit'
    )
    expect(screen.getByText('Operating Model')).toBeInTheDocument()
    expect(screen.getByText('Available Configurations')).toBeInTheDocument()
    expect(screen.getByText('Required Microsoft Graph Permissions')).toBeInTheDocument()
    expect(screen.getByText('Made By Jorgeasaurus')).toBeInTheDocument()

    const demoColumn = screen.getByTestId('web-app-demo').closest('.landing-demo-column')
    expect(demoColumn).not.toBeNull()
    expect(demoColumn?.querySelector('[aria-hidden="true"]')).toBeNull()
  })

  it('starts sign-in or continues to the wizard from the primary CTA', async () => {
    const user = userEvent.setup()

    renderLanding()

    await user.click(screen.getByRole('button', { name: /Sign In with Microsoft/i }))
    expect(onSignInClick).toHaveBeenCalledTimes(1)

    vi.clearAllMocks()
    renderLanding({ isAuthenticated: true })

    await user.click(screen.getAllByRole('button', { name: /Launch Wizard|Continue/i })[0])
    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  it('supports legacy media-query listeners for the desktop demo', () => {
    const addListener = vi.fn()

    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
        matches: false,
        addListener,
        removeListener: vi.fn(),
    }))

    renderLanding()

    expect(addListener).toHaveBeenCalledTimes(1)
  })

})
