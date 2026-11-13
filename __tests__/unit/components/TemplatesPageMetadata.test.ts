import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/templates/TemplateCatalogPage', () => ({
  TemplateCatalogPage: () => null,
}))

import { metadata } from '@/app/templates/page'

describe('/templates metadata', () => {
  it('declares its own canonical, Open Graph, and Twitter card values', () => {
    expect(metadata.alternates?.canonical).toBe('/templates')
    expect(metadata.openGraph).toMatchObject({
      url: '/templates',
      title: 'Template Catalog | Intune Hydration Kit',
      siteName: 'Intune Hydration Kit',
      images: [expect.objectContaining({ url: '/SocialCard.jpg' })],
    })
    expect(metadata.twitter).toMatchObject({
      card: 'summary_large_image',
      title: 'Template Catalog | Intune Hydration Kit',
      images: ['/SocialCard.jpg'],
    })
  })
})
