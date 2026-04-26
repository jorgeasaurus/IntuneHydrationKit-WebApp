import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { render, screen } from '@/__tests__/setup/test-utils'
import { CloudEnvironmentSelector } from '@/components/CloudEnvironmentSelector'

describe('CloudEnvironmentSelector', () => {
  it('renders the supported and PowerShell-only cloud options', () => {
    render(
      <CloudEnvironmentSelector
        open
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByRole('heading', { name: /select cloud environment/i })).toBeInTheDocument()
    expect(screen.getByText('Global (Commercial)')).toBeInTheDocument()
    expect(screen.getByText('US Government (GCC High)')).toBeInTheDocument()
    expect(screen.getByText('US Government (DoD)')).toBeInTheDocument()
    expect(screen.getByText('Germany')).toBeInTheDocument()
    expect(screen.getByText('China (21Vianet)')).toBeInTheDocument()
    expect(screen.getByText('Supported')).toBeInTheDocument()
    expect(screen.getAllByText('PowerShell only')).toHaveLength(4)
    expect(
      screen.getByRole('link', { name: /view intunehydrationkit powershell module/i })
    ).toHaveAttribute('href', 'https://github.com/jorgeasaurus/IntuneHydrationKit')
  })

  it('continues with the global environment and allows cancelling', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const onCancel = vi.fn()

    render(
      <CloudEnvironmentSelector
        open
        onSelect={onSelect}
        onCancel={onCancel}
      />
    )

    await user.click(screen.getByRole('button', { name: /continue to sign in/i }))
    expect(onSelect).toHaveBeenCalledWith('global')

    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
