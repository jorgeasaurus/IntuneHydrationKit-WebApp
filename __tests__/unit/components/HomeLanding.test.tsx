import type { AnchorHTMLAttributes, ComponentProps } from 'react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen } from '@/__tests__/setup/test-utils'
import { HomeLanding } from '@/components/landing/HomeLanding'

const onSignInClick = vi.fn()
const onCloudSelect = vi.fn()
const onCloudSelectorCancel = vi.fn()
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

vi.mock('@/components/CloudEnvironmentSelector', () => ({
  CloudEnvironmentSelector: ({
    open,
    onSelect,
    onCancel,
  }: {
    open: boolean
    onSelect: (environment: 'global') => void
    onCancel: () => void
  }) =>
    open ? (
      <div data-testid="cloud-selector">
        <button onClick={() => onSelect('global')}>Choose Global</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    ) : null,
}))

function renderLanding(overrides: Partial<ComponentProps<typeof HomeLanding>> = {}) {
  render(
    <HomeLanding
      isAuthenticated={false}
      showCloudSelector={false}
      onSignInClick={onSignInClick}
      onCloudSelect={onCloudSelect}
      onCloudSelectorCancel={onCloudSelectorCancel}
      onContinue={onContinue}
      {...overrides}
    />
  )
}

describe('HomeLanding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the v2.6 landing surface with product proof and core sections', () => {
    renderLanding()

    expect(screen.getByRole('heading', { name: 'Intune Hydration Kit' })).toBeInTheDocument()
    expect(screen.getByText('v2.6')).toBeInTheDocument()
    expect(screen.getByTestId('web-app-demo')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /PowerShell Module/i })[0]).toHaveAttribute(
      'href',
      'https://github.com/jorgeasaurus/IntuneHydrationKit'
    )
    expect(screen.getByText('Operating Model')).toBeInTheDocument()
    expect(screen.getByText('Available Configurations')).toBeInTheDocument()
    expect(screen.getByText('Required Microsoft Graph Permissions')).toBeInTheDocument()
    expect(screen.getByText('Made By Jorgeasaurus')).toBeInTheDocument()
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

  it('passes cloud selector events through to the page state container', async () => {
    const user = userEvent.setup()

    renderLanding({ showCloudSelector: true })

    await user.click(screen.getByRole('button', { name: 'Choose Global' }))
    expect(onCloudSelect).toHaveBeenCalledWith('global')

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCloudSelectorCancel).toHaveBeenCalledTimes(1)
  })
})
