import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen } from '@/__tests__/setup/test-utils'
import { RouteWallpaper } from '@/components/RouteWallpaper'
import { shouldRenderWallpaper } from '@/components/routeWallpaperRules'

const pathname = vi.fn()

vi.mock('next/navigation', () => ({
  usePathname: () => pathname(),
}))

vi.mock('next/dynamic', () => ({
  default: () => function MockDynamicWallpaper({ landing }: { landing?: boolean }) {
    return <div className={landing ? 'dynamic-wallpaper--landing' : undefined} data-testid="dynamic-wallpaper" />
  },
}))

const stubMatchMedia = (matches: boolean) => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  )
}

describe('RouteWallpaper', () => {
  beforeEach(() => {
    pathname.mockReturnValue('/')
    // Run the deferred (idle) load synchronously so the animated wallpaper
    // mounts within the test instead of waiting for browser idle time.
    vi.stubGlobal('requestIdleCallback', vi.fn((cb: () => void) => {
      cb()
      return 1
    }))
    vi.stubGlobal('cancelIdleCallback', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
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

  it('lazily mounts the animated wallpaper once the browser is idle', () => {
    pathname.mockReturnValue('/')

    render(<RouteWallpaper />)

    // The deferred (idle) load has resolved, swapping the static surface for
    // the animated wallpaper.
    expect(screen.getByTestId('dynamic-wallpaper')).toHaveClass(
      'dynamic-wallpaper--landing'
    )
  })

  it('mounts the animated wallpaper on the wizard route', () => {
    pathname.mockReturnValue('/wizard')

    render(<RouteWallpaper />)

    expect(screen.getByTestId('dynamic-wallpaper')).not.toHaveClass(
      'dynamic-wallpaper--landing'
    )
  })

  it('mounts the animated wallpaper on dashboard and results routes', () => {
    pathname.mockReturnValue('/dashboard')

    const { rerender } = render(<RouteWallpaper />)

    expect(screen.getByTestId('dynamic-wallpaper')).toBeInTheDocument()

    pathname.mockReturnValue('/results')
    rerender(<RouteWallpaper />)

    expect(screen.getByTestId('dynamic-wallpaper')).toBeInTheDocument()
  })

  it('renders nothing on routes without a wallpaper surface', () => {
    pathname.mockReturnValue('/some-other-route')

    const { container } = render(<RouteWallpaper />)

    expect(container).toBeEmptyDOMElement()
  })

  it('never loads three.js/Vanta when the user prefers reduced motion', () => {
    stubMatchMedia(true)
    pathname.mockReturnValue('/')

    const { container } = render(<RouteWallpaper />)

    // The static gradient surface is the permanent state — the heavy animated
    // wallpaper chunk is never mounted.
    expect(container.querySelector('.dynamic-wallpaper')).toHaveClass(
      'dynamic-wallpaper--landing'
    )
    expect(screen.queryByTestId('dynamic-wallpaper')).not.toBeInTheDocument()
  })
})
