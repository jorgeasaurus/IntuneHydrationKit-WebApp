import { afterAll, describe, expect, it } from 'vitest'

import sitemap from '@/app/sitemap'
import { SITE_URL } from '@/lib/siteUrl'

const originalFetch = globalThis.fetch

afterAll(() => {
  globalThis.fetch = originalFetch
})

describe('sitemap', () => {
  it('lists the home page, the catalog, and one unique URL per template', async () => {
    const entries = await sitemap()
    const urls = entries.map((entry) => entry.url)
    const templateUrls = urls.filter((url) => url.startsWith(`${SITE_URL}/templates/`))

    expect(urls.slice(0, 2)).toEqual([`${SITE_URL}/`, `${SITE_URL}/templates`])
    expect(templateUrls.length).toBeGreaterThan(900)
    expect(new Set(templateUrls).size).toBe(templateUrls.length)
    expect(templateUrls).toContain(`${SITE_URL}/templates/win32-apps--7-zip`)
  })
})
