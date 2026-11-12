import React from 'react'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { render, screen, within } from '@testing-library/react'
import TemplatePage, {
  dynamicParams,
  generateMetadata,
  generateStaticParams,
} from '@/app/templates/[id]/page'
import { getTemplateMetaDescription } from '@/app/templates/[id]/templateMetadata'
import type { TemplateDocumentationItem } from '@/lib/templates/catalog'

const NOT_FOUND_ERROR = 'NEXT_NOT_FOUND'
const originalFetch = globalThis.fetch

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error(NOT_FOUND_ERROR)
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

afterAll(() => {
  globalThis.fetch = originalFetch
})

const params = (id: string) => ({ params: Promise.resolve({ id }) })

describe('/templates/[id]', () => {
  it('prerenders one page per catalog item and rejects other ids', async () => {
    const staticParams = await generateStaticParams()

    expect(dynamicParams).toBe(false)
    expect(staticParams.length).toBeGreaterThan(900)
    expect(staticParams).toContainEqual({ id: 'win32-apps--7-zip' })
  })

  it('builds per-page metadata with canonical and social fields', async () => {
    const metadata = await generateMetadata(params('win32-apps--7-zip'))

    expect(metadata.title).toBe('7-Zip - [IHD]')
    expect(metadata.alternates?.canonical).toBe('/templates/win32-apps--7-zip')
    expect(metadata.openGraph).toMatchObject({
      url: '/templates/win32-apps--7-zip',
      title: '7-Zip - [IHD] | Intune Hydration Kit',
      siteName: 'Intune Hydration Kit',
      images: [expect.objectContaining({ url: '/SocialCard.jpg' })],
    })
    expect(metadata.twitter).toMatchObject({
      card: 'summary_large_image',
      title: '7-Zip - [IHD] | Intune Hydration Kit',
    })
    expect(String(metadata.description)).toMatch(/^Win32 Apps: Windows Windows app \(Win32\) template\./)
  })

  it('keeps meta descriptions within 160 characters', () => {
    const description = getTemplateMetaDescription({
      categoryLabel: 'Groups',
      itemType: 'Dynamic Group',
      description: 'x'.repeat(400),
    } as TemplateDocumentationItem)

    expect(description).toHaveLength(160)
    expect(description.endsWith('…')).toBe(true)
  })

  it('shows the not-found page for unknown ids', async () => {
    await expect(TemplatePage(params('groups--missing-template'))).rejects.toThrow(NOT_FOUND_ERROR)
    await expect(generateMetadata(params('groups--missing-template'))).rejects.toThrow(
      NOT_FOUND_ERROR
    )
  })

  it('renders details, a settings summary, and the payload JSON for a template', async () => {
    const staticParams = await generateStaticParams()
    const complianceId = staticParams.find(({ id }) => id.startsWith('compliance--'))?.id
    if (!complianceId) throw new Error('Expected a compliance template')

    render(await TemplatePage(params(complianceId)))

    const headings = screen.getAllByRole('heading').map((heading) => heading.tagName)
    expect(headings).toEqual(['H1', 'H2', 'H2', 'H2'])
    expect(screen.getByRole('link', { name: 'Back to the template catalog' })).toHaveAttribute(
      'href',
      '/templates'
    )
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy JSON' })).toBeInTheDocument()

    const details = screen.getByRole('region', { name: 'Template details' })
    expect(within(details).getByText('Compliance Policies')).toBeInTheDocument()
    expect(within(details).getByText('Intune Hydration Kit')).toBeInTheDocument()
    expect(screen.getByText(/configured propert/)).toBeInTheDocument()
    expect(document.getElementById('template-json')?.textContent).toContain('"@odata.type"')
  })

  it('renders Win32 wrapper scripts under their own heading', async () => {
    render(await TemplatePage(params('win32-apps--7-zip')))

    const scripts = screen.getByRole('region', { name: 'Wrapper scripts' })
    expect(within(scripts).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Detection script',
      'Install script',
      'Uninstall script',
    ])
  })
})
