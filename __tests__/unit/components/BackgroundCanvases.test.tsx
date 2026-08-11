import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DynamicWallpaper } from '@/components/DynamicWallpaper'

const vantaMocks = vi.hoisted(() => ({
  destroy: vi.fn(),
  waves: vi.fn(() => ({
    destroy: vi.fn(),
  })),
}))

vi.mock('vanta/dist/vanta.waves.min', () => ({
  default: vantaMocks.waves,
}))

vi.mock('three', () => ({
  WebGLRenderer: vi.fn(),
}))

describe('background canvas components', () => {
  beforeEach(() => {
    vantaMocks.destroy.mockClear()
    vantaMocks.waves.mockImplementation(() => ({
      destroy: vantaMocks.destroy,
    }))
    vantaMocks.waves.mockClear()
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 123))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('initializes and cleans up the configured Vanta Waves wallpaper', () => {
    const { container, unmount } = render(<DynamicWallpaper />)
    const wallpaper = container.querySelector('div[aria-hidden="true"]')

    expect(wallpaper).toBeTruthy()
    expect(wallpaper).toHaveAttribute('aria-hidden', 'true')
    expect(wallpaper).toHaveAttribute('tabindex', '-1')
    expect(wallpaper).toHaveClass('dynamic-wallpaper')
    expect(wallpaper?.querySelector('.dynamic-wallpaper__scrim')).toBeTruthy()
    expect(vantaMocks.waves).toHaveBeenCalledWith(
      expect.objectContaining({
        backgroundAlpha: 1,
        backgroundColor: 0x005588,
        color: 0x005588,
        el: wallpaper,
        gyroControls: false,
        minHeight: 200,
        minWidth: 200,
        mouseControls: true,
        scale: 1,
        scaleMobile: 1,
        shininess: 30,
        touchControls: true,
        waveHeight: 15,
        waveSpeed: 1,
        zoom: 1,
      })
    )

    unmount()

    expect(vantaMocks.destroy).toHaveBeenCalled()
  })

  it('starts Vanta Waves without mouse, touch, or wave speed when reduced motion is requested', () => {
    const motionSpies = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: true,
        media: '(prefers-reduced-motion: reduce)',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: motionSpies.addEventListener,
        removeEventListener: motionSpies.removeEventListener,
        dispatchEvent: vi.fn(),
      }))
    )
    const { unmount } = render(<DynamicWallpaper />)

    expect(vantaMocks.waves).toHaveBeenCalledWith(
      expect.objectContaining({
        mouseControls: false,
        touchControls: false,
        waveSpeed: 0,
      })
    )
    expect(motionSpies.addEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function)
    )

    unmount()

    expect(motionSpies.removeEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function)
    )
  })
})
