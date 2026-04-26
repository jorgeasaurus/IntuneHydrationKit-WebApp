import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen, waitFor } from '@/__tests__/setup/test-utils'
import { TemplateCatalogPage } from '@/components/templates/TemplateCatalogPage'

const loadTemplateDocumentationCatalog = vi.fn()
const loadTemplateDocumentationPayload = vi.fn()

vi.mock('@/components/Navigation', () => ({
  Navigation: () => <div data-testid="navigation" />,
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
  },
}))

vi.mock('@/lib/templates/catalog', () => ({
  loadTemplateDocumentationCatalog: (...args: unknown[]) =>
    loadTemplateDocumentationCatalog(...args),
  loadTemplateDocumentationPayload: (...args: unknown[]) =>
    loadTemplateDocumentationPayload(...args),
  getPlatformFilterOrder: (platforms: string[]) => platforms,
}))

describe('TemplateCatalogPage', () => {
  beforeEach(() => {
    loadTemplateDocumentationCatalog.mockReset()
    loadTemplateDocumentationPayload.mockReset()
  })

  it('renders catalog data, filters results, and expands raw JSON on demand', async () => {
    loadTemplateDocumentationCatalog.mockResolvedValue({
      totalCount: 2,
      categories: [
        {
          id: 'groups',
          label: 'Groups',
          description: 'Dynamic and assigned Entra groups.',
          count: 1,
        },
        {
          id: 'baseline',
          label: 'OpenIntuneBaseline',
          description: 'OpenIntuneBaseline payloads.',
          count: 1,
        },
      ],
      items: [
        {
          id: 'groups:[IHD] Intune - Windows Devices',
          category: 'groups',
          categoryLabel: 'Groups',
          displayName: '[IHD] Intune - Windows Devices',
          description: 'All Windows devices.',
          platform: 'Windows',
          itemType: 'Dynamic Group',
          payloadSource: {
            kind: 'inline',
            payload: {
              displayName: '[IHD] Intune - Windows Devices',
              membershipRule: '(device.deviceOSType -eq "Windows")',
            },
          },
        },
        {
          id: 'baseline:Windows/SettingsCatalog/Baseline.json',
          category: 'baseline',
          categoryLabel: 'OpenIntuneBaseline',
          displayName: 'Baseline - Windows Hardening',
          description: 'Settings Catalog template.',
          platform: 'Windows',
          itemType: 'Settings Catalog',
          sourcePath: 'Windows/SettingsCatalog/Baseline.json',
          payloadSource: {
            kind: 'oib',
            file: {
              path: 'Windows/SettingsCatalog/Baseline.json',
              platform: 'WINDOWS',
              policyType: 'Settings Catalog',
              displayName: 'Baseline - Windows Hardening',
            },
          },
        },
      ],
    })

    loadTemplateDocumentationPayload.mockResolvedValue({
      displayName: '[IHD] Intune - Windows Devices',
      membershipRule: '(device.deviceOSType -eq "Windows")',
      description: 'All Windows devices.',
    })

    const user = userEvent.setup()

    render(<TemplateCatalogPage />)

    expect(await screen.findByText(/Inspect every payload before you import it/i)).toBeInTheDocument()
    expect(await screen.findByText(/\[IHD\] Intune - Windows Devices/i)).toBeInTheDocument()

    await user.type(screen.getByLabelText(/Search template catalog/i), 'Windows Devices')

    expect(screen.queryByText(/Baseline - Windows Hardening/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /\[IHD\] Intune - Windows Devices/i }))

    await waitFor(() => {
      expect(loadTemplateDocumentationPayload).toHaveBeenCalledTimes(1)
    })

    expect(await screen.findByText(/Human-readable summary/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Dynamic Group/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/Membership Rule/i)).toBeInTheDocument()
    expect(screen.getByText(/\(device\.deviceOSType -eq "Windows"\)/i)).toBeInTheDocument()
  })
})
