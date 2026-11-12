import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen, waitFor, within } from '@testing-library/react'
import { TemplateCatalogPage } from '@/components/templates/TemplateCatalogPage'

const loadTemplateDocumentationCatalog = vi.fn()
const loadTemplateDocumentationPayload = vi.fn()

vi.mock('@/components/Navigation', () => ({
  Navigation: () => <div data-testid="navigation" />,
}))

const toastSuccess = vi.fn()
const toastError = vi.fn()

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}))

vi.mock('@/lib/templates/catalog', () => ({
  loadTemplateDocumentationCatalog: (...args: unknown[]) =>
    loadTemplateDocumentationCatalog(...args),
  loadTemplateDocumentationPayload: (...args: unknown[]) =>
    loadTemplateDocumentationPayload(...args),
  getTemplatePath: (item: { slug: string }) => `/templates/${item.slug}`,
  getPlatformFilterOrder: (platforms: Array<string | undefined>) =>
    Array.from(new Set(platforms.filter(Boolean))),
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
    toastSuccess.mockReset()
    toastError.mockReset()
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
      '@odata.type': '#microsoft.graph.group',
      displayName: '[IHD] Intune - Windows Devices',
      membershipRule: '(device.deviceOSType -eq "Windows")',
      description: 'All Windows devices.',
    })

    const user = userEvent.setup()

    render(<TemplateCatalogPage />)

    expect(await screen.findByText(/Inspect every payload before you import it/i)).toBeInTheDocument()
    expect(await screen.findByText(/\[IHD\] Intune - Windows Devices/i)).toBeInTheDocument()
    const baselineCard = screen.getByRole('button', { name: 'Show OpenIntuneBaseline templates' })
    expect(baselineCard).toHaveAccessibleDescription('OpenIntuneBaseline payloads.')
    expect(baselineCard).not.toHaveTextContent(/\d+\s*\/\s*\d+/)
    screen.getAllByRole('button', { name: /^All$/i }).forEach((button) => {
      expect(button).toHaveClass('bg-black')
      expect(button).not.toHaveClass('bg-primary')
    })
    expect(
      screen.getByRole('button', { name: 'Show CIS Baselines templates' })
    ).toHaveClass('flex', 'items-start', 'justify-start')

    await user.type(screen.getByLabelText(/Search template catalog/i), 'Windows Devices')

    expect(screen.queryByText(/Baseline - Windows Hardening/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /\[IHD\] Intune - Windows Devices/i }))

    await waitFor(() => {
      expect(loadTemplateDocumentationPayload).toHaveBeenCalledTimes(1)
    })

    expect(await screen.findByText(/Human-readable summary/i)).toBeInTheDocument()
    expect(screen.getByText('OData type')).toBeInTheDocument()
    expect(screen.getByText('#microsoft.graph.group')).toBeInTheDocument()
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
      detectionScriptContent:
        "$packageIdentifier = '7zip.7zip'\nDetect-WinGetPackage $packageIdentifier",
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
    const detectionScript = await screen.findByRole('region', { name: 'Detection script' })
    const installScript = await screen.findByRole('region', { name: 'Install script' })
    const uninstallScript = await screen.findByRole('region', { name: 'Uninstall script' })

    expect(detectionScript).toHaveTextContent(
      'Detect-WinGetPackage $packageIdentifier'
    )
    expect(installScript).toHaveTextContent('Install-WinGetPackage $packageIdentifier')
    expect(uninstallScript).toHaveTextContent(
      'Uninstall-WinGetPackage $packageIdentifier'
    )
    expect(detectionScript.parentElement).toHaveClass('space-y-4')
    expect(installScript.parentElement).toBe(detectionScript.parentElement)
    expect(uninstallScript.parentElement).toBe(detectionScript.parentElement)
  })

  it('shows each item type once and reports clipboard failures', async () => {
    loadTemplateDocumentationCatalog.mockResolvedValue({
      totalCount: 1,
      categories: [
        { id: 'groups', label: 'Groups', description: 'Entra groups.', count: 1 },
      ],
      items: [
        {
          id: 'groups:[IHD] All Windows Devices',
          category: 'groups',
          categoryLabel: 'Groups',
          displayName: '[IHD] All Windows Devices',
          description: 'All Windows devices.',
          subcategory: 'Dynamic Group',
          platform: 'Windows',
          itemType: 'Dynamic Group',
          payloadSource: { kind: 'inline', payload: { displayName: '[IHD] All Windows Devices' } },
        },
      ],
    })
    loadTemplateDocumentationPayload.mockResolvedValue({
      displayName: '[IHD] All Windows Devices',
    })
    const writeText = vi.fn().mockRejectedValue(new Error('Clipboard blocked'))
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    render(<TemplateCatalogPage />)

    const row = await screen.findByRole('button', { name: /\[IHD\] All Windows Devices/i })
    expect(within(row).getAllByText('Dynamic Group')).toHaveLength(1)

    await user.click(row)
    await user.click(await screen.findByRole('button', { name: /^Copy$/ }))

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        'Could not copy the template JSON. Select the JSON and copy it manually.'
      )
    })
    expect(writeText).toHaveBeenCalledOnce()
    expect(toastSuccess).not.toHaveBeenCalled()
  })
})
