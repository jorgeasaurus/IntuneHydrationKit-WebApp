import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen, waitFor, within } from '@/__tests__/setup/test-utils'
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
  TEMPLATE_DOCUMENTATION_CATEGORY_ORDER: [
    'groups',
    'win32Apps',
    'baseline',
    'cisBaseline',
  ],
}))

describe('TemplateCatalogPage', () => {
  beforeEach(() => {
    loadTemplateDocumentationCatalog.mockReset()
    loadTemplateDocumentationPayload.mockReset()
  })

  it('renders catalog data, filters results, and expands raw JSON on demand', async () => {
    loadTemplateDocumentationCatalog.mockResolvedValue({
      totalCount: 3,
      categories: [
        {
          id: 'groups',
          label: 'Groups',
          description: 'Dynamic and assigned Entra groups.',
          count: 1,
        },
        {
          id: 'win32Apps',
          label: 'Win32 Apps',
          description: 'Packaged Windows applications that install through Intune.',
          count: 1,
        },
        {
          id: 'baseline',
          label: 'OpenIntuneBaseline',
          description: 'OpenIntuneBaseline payloads.',
          count: 1,
        },
        {
          id: 'cisBaseline',
          label: 'CIS Baselines',
          description: 'CIS benchmark payloads indexed from the local CIS manifest.',
          count: 0,
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
          id: 'win32Apps:7-zip',
          category: 'win32Apps',
          categoryLabel: 'Win32 Apps',
          displayName: '7-Zip - [IHD]',
          description: 'Starter-pack WinGet template for 7-Zip Win32 packaging.',
          subcategory: 'WinGet Package',
          platform: 'Windows',
          itemType: 'Windows app (Win32)',
          sourcePath: '/win32-apps/7-zip.intunewin',
          payloadSource: {
            kind: 'win32',
            template: {
              displayName: '7-Zip - [IHD]',
              packageIdentifier: '7zip.7zip',
              publisher: 'Igor Pavlov',
              version: 'latest',
              setupFilePath: 'Install-WinGetPackage.ps1',
              installCommandLine: 'powershell.exe -File .\\Install-WinGetPackage.ps1',
              uninstallCommandLine: 'powershell.exe -File .\\Uninstall-WinGetPackage.ps1',
              applicableArchitectures: 'x64',
              allowAvailableUninstall: true,
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
    screen
      .getAllByRole('button', { name: /OpenIntuneBaseline payloads/i })
      .forEach((button) => {
        expect(button).not.toHaveTextContent(/\d+\s*\/\s*\d+/)
      })
    screen.getAllByRole('button', { name: /^All$/i }).forEach((button) => {
      expect(button).toHaveClass('bg-black')
      expect(button).not.toHaveClass('bg-primary')
    })
    expect(
      screen.getByRole('button', { name: /CIS Baselines CIS benchmark/i })
    ).toHaveClass('flex', 'items-start', 'justify-start')

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

    await user.clear(screen.getByLabelText(/Search template catalog/i))
    await user.click(screen.getByRole('button', { name: /^Win32 Apps$/i }))

    expect(await screen.findByText('7-Zip - [IHD]')).toBeInTheDocument()

    loadTemplateDocumentationPayload.mockResolvedValue({
      displayName: '7-Zip - [IHD]',
      packageIdentifier: '7zip.7zip',
      publisher: 'Igor Pavlov',
      version: 'latest',
      setupFilePath: 'Install-WinGetPackage.ps1',
      installCommandLine: 'powershell.exe -File .\\Install-WinGetPackage.ps1',
      uninstallCommandLine: 'powershell.exe -File .\\Uninstall-WinGetPackage.ps1',
      applicableArchitectures: 'x64',
      allowAvailableUninstall: true,
      installScriptContent:
        "$packageIdentifier = '7zip.7zip'\nInstall-WinGetPackage $packageIdentifier",
      uninstallScriptContent:
        "$packageIdentifier = '7zip.7zip'\nUninstall-WinGetPackage $packageIdentifier",
    })
    await user.click(screen.getByRole('button', { name: /7-Zip - \[IHD\]/i }))

    await waitFor(() => {
      expect(loadTemplateDocumentationPayload).toHaveBeenCalledTimes(2)
    })
    expect(await screen.findByText(/Human-readable summary/i)).toBeInTheDocument()
    expect(await screen.findByText('Package Identifier')).toBeInTheDocument()
    expect(screen.getByText('7zip.7zip')).toBeInTheDocument()
    expect(screen.getByText('Install Command Line')).toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: 'Install script' })).getByText(
        /Install-WinGetPackage \$packageIdentifier/
      )
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: 'Uninstall script' })).getByText(
        /Uninstall-WinGetPackage \$packageIdentifier/
      )
    ).toBeInTheDocument()
  })
})
