import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { render, screen } from '@testing-library/react'
import TemplatePage from '@/app/templates/[id]/page'
import type { TemplateDocumentationItem } from '@/lib/templates/catalog'

const item = {
  id: 'win32Apps:7-zip',
  slug: 'win32-apps--7-zip',
  category: 'win32Apps',
  categoryLabel: 'Win32 Apps',
  displayName: '7-Zip - [IHD]',
  description: 'Starter-pack WinGet template.',
  itemType: 'Windows app (Win32)',
  platform: 'Windows',
  payloadSource: { kind: 'inline', payload: {} },
} satisfies TemplateDocumentationItem

vi.mock('@/lib/templates/serverCatalog', () => ({
  getServerTemplateBySlug: vi.fn(async (slug: string) => (slug === item.slug ? item : undefined)),
  getServerWinGetCatalogApp: vi.fn(async () => null),
  loadServerTemplateCatalog: vi.fn(async () => ({ items: [item], categories: [], totalCount: 1 })),
  loadServerTemplatePayload: vi.fn(async () => ({
    status: 'error',
    error: 'Unable to load the Win32 detection script from /win32-apps/7-zip/Detect.ps1: 404',
  })),
}))

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))

vi.mock('@/components/Navigation', () => ({
  Navigation: () => <nav data-testid="navigation" />,
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

const params = { params: Promise.resolve({ id: item.slug }) }

describe('/templates/[id] when the payload does not load', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('renders the details with a "could not load" state outside the build', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(await TemplatePage(params))

    expect(screen.getByRole('heading', { level: 1, name: '7-Zip - [IHD]' })).toBeInTheDocument()
    expect(screen.getByText('The payload for this template could not load.')).toBeInTheDocument()
    // The settings section must not point at JSON that is not there.
    expect(
      screen.getByText('No summary is available because the payload for this template could not load.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/The JSON below shows every value/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copy JSON' })).not.toBeInTheDocument()
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('win32-apps--7-zip'))
  })

  it('stops the production build, because every payload is a bundled file', async () => {
    vi.stubEnv('NEXT_PHASE', 'phase-production-build')

    await expect(TemplatePage(params)).rejects.toThrow(
      /Template payload for win32-apps--7-zip did not load: Unable to load the Win32 detection script/
    )
  })
})
