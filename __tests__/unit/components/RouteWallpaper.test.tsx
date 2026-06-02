import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen } from '@/__tests__/setup/test-utils'
import { RouteWallpaper } from '@/components/RouteWallpaper'
import { shouldRenderWallpaper } from '@/components/routeWallpaperRules'

const pathname = vi.fn()

vi.mock('next/navigation', () => ({
  usePathname: () => pathname(),
}))

vi.mock('next/dynamic', () => ({
  default: () => function MockDynamicWallpaper() {
    return <div data-testid="dynamic-wallpaper" />
  },
}))

describe('RouteWallpaper', () => {
  beforeEach(() => {
    pathname.mockReturnValue('/')
  })

  it('matches only routes that use the animated wallpaper surface', () => {
    expect(shouldRenderWallpaper('/')).toBe(true)
    expect(shouldRenderWallpaper('/wizard')).toBe(true)
    expect(shouldRenderWallpaper('/dashboard')).toBe(true)
    expect(shouldRenderWallpaper('/results')).toBe(true)
    expect(shouldRenderWallpaper('/templates')).toBe(true)
    expect(shouldRenderWallpaper('/templates/conditional-access')).toBe(true)
    expect(shouldRenderWallpaper('/templates-old')).toBe(false)
    expect(shouldRenderWallpaper(null)).toBe(false)
  })

  it('renders the lazy wallpaper on the landing page', () => {
    pathname.mockReturnValue('/')

    render(<RouteWallpaper />)

    expect(screen.getByTestId('dynamic-wallpaper')).toBeInTheDocument()
  })

  it('renders the lazy wallpaper on the wizard route', () => {
    pathname.mockReturnValue('/wizard')

    render(<RouteWallpaper />)

    expect(screen.getByTestId('dynamic-wallpaper')).toBeInTheDocument()
  })

  it('renders the lazy wallpaper on dashboard and results routes', () => {
    pathname.mockReturnValue('/dashboard')

    const { rerender } = render(<RouteWallpaper />)

    expect(screen.getByTestId('dynamic-wallpaper')).toBeInTheDocument()

    pathname.mockReturnValue('/results')
    rerender(<RouteWallpaper />)

    expect(screen.getByTestId('dynamic-wallpaper')).toBeInTheDocument()
  })
})
