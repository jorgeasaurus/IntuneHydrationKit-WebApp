import { afterAll, describe, expect, it } from 'vitest'

import {
  findTemplateBySlug,
  getTemplateFilePath,
  getTemplatePath,
  getTemplateBaseSlug,
  getTemplateSourceLabel,
  type TemplateDocumentationItem,
} from '@/lib/templates/catalog'
import {
  getServerTemplateBySlug,
  loadServerTemplateCatalog,
  resolvePublicFilePath,
} from '@/lib/templates/serverCatalog'

const originalFetch = globalThis.fetch

afterAll(() => {
  globalThis.fetch = originalFetch
})

describe('template slugs', () => {
  it('builds a readable, URL-safe slug from the catalog id', () => {
    expect(
      getTemplateBaseSlug({ id: 'groups:[IHD] Intune - Windows Devices', category: 'groups' })
    ).toBe('groups--intune-windows-devices')
    expect(
      getTemplateBaseSlug({
        id: 'conditionalAccess:[IHD] Require MFA for admins',
        category: 'conditionalAccess',
      })
    ).toBe('conditional-access--require-mfa-for-admins')
    expect(
      getTemplateBaseSlug({
        id: 'baseline:WINDOWS/IntuneManagement/SettingsCatalog/Win - OIB - SC - Edge (v4.0).json',
        category: 'baseline',
      })
    ).toBe('baseline--windows-intunemanagement-settingscatalog-win-oib-sc-edge-v4-0')
    expect(getTemplateBaseSlug({ id: 'groups:Café Ünïcode', category: 'groups' })).toBe(
      'groups--cafe-unicode'
    )
    expect(getTemplatePath({ slug: 'win32-apps--7-zip' })).toBe('/templates/win32-apps--7-zip')
  })

  it('gives every bundled template a unique slug that resolves back to it', async () => {
    const catalog = await loadServerTemplateCatalog()
    const slugs = catalog.items.map((item) => item.slug)

    expect(catalog.items.length).toBeGreaterThan(900)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*--[a-z0-9]+(?:-[a-z0-9]+)*$/)
    }

    const sample = catalog.items[catalog.items.length - 1]
    expect(sample.slug).toBe(getTemplateBaseSlug(sample))
    expect(findTemplateBySlug(catalog.items, sample.slug)).toBe(sample)
    expect(await getServerTemplateBySlug(sample.slug)).toBe(sample)
  })

  it('adds a stable hash to slugs that would otherwise be the same', async () => {
    const catalog = await loadServerTemplateCatalog()
    const recallItems = catalog.items.filter((item) =>
      /Windows AI -\s+Block Microsoft Recall/.test(item.displayName)
    )
    const baseSlug = 'cis-baseline--8-0-windows-11-benchmarks-windows-ai-baseline-windows-ai-block-microsoft-recall'

    expect(recallItems).toHaveLength(2)
    expect(recallItems.map((item) => getTemplateBaseSlug(item))).toEqual([baseSlug, baseSlug])
    for (const item of recallItems) {
      expect(item.slug).toMatch(new RegExp(`^${baseSlug}-[a-z0-9]+$`))
    }
    expect(recallItems[0].slug).not.toBe(recallItems[1].slug)
  })

  it('returns undefined for unknown slugs', async () => {
    expect(await getServerTemplateBySlug('groups--does-not-exist')).toBeUndefined()
    expect(await getServerTemplateBySlug('../../package.json')).toBeUndefined()
  })
})

describe('template source details', () => {
  const baseItem = {
    id: 'x:y',
    slug: 'groups--y',
    category: 'groups',
    categoryLabel: 'Groups',
    displayName: 'y',
    description: '',
    itemType: 'Dynamic Group',
  } as const

  it('names the source and file of each payload kind', () => {
    const oib = {
      ...baseItem,
      payloadSource: {
        kind: 'oib',
        file: { path: 'WINDOWS/a.json', displayName: 'a', platform: 'WINDOWS', policyType: '' },
      },
    } satisfies TemplateDocumentationItem
    const cis = {
      ...baseItem,
      payloadSource: { kind: 'cis', file: { path: '1.0/b.json', displayName: 'b' } },
    } as unknown as TemplateDocumentationItem
    const inline = {
      ...baseItem,
      payloadSource: { kind: 'inline', payload: {} },
    } satisfies TemplateDocumentationItem

    expect(getTemplateSourceLabel(oib)).toBe('OpenIntuneBaseline')
    expect(getTemplateFilePath(oib)).toBe('public/IntuneTemplates/OpenIntuneBaseline/WINDOWS/a.json')
    expect(getTemplateSourceLabel(cis)).toBe('CIS Intune Benchmarks')
    expect(getTemplateFilePath(cis)).toBe('public/CISIntuneBaselines/1.0/b.json')
    expect(getTemplateSourceLabel(inline)).toBe('Intune Hydration Kit')
    expect(getTemplateFilePath(inline)).toBeUndefined()
  })
})

describe('resolvePublicFilePath', () => {
  it('reads only files inside the public folder', () => {
    expect(resolvePublicFilePath('/IntuneTemplates/a%20b.json')).toMatch(
      /public[/\\]IntuneTemplates[/\\]a b\.json$/
    )
    expect(resolvePublicFilePath('/../package.json')).toBeNull()
    expect(resolvePublicFilePath('/%2e%2e/package.json')).toBeNull()
  })
})
