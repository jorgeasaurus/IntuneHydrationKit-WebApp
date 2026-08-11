import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DynamicWallpaper } from '@/components/DynamicWallpaper'
import { AnimatedGridBackground } from '@/components/ui/animated-grid-background'

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

type MockGradient = {
  addColorStop: ReturnType<typeof vi.fn>
}

type MockCanvasContext = {
  arc: ReturnType<typeof vi.fn>
  beginPath: ReturnType<typeof vi.fn>
  clearRect: ReturnType<typeof vi.fn>
  createLinearGradient: ReturnType<typeof vi.fn>
  createRadialGradient: ReturnType<typeof vi.fn>
  fill: ReturnType<typeof vi.fn>
  fillRect: ReturnType<typeof vi.fn>
  lineTo: ReturnType<typeof vi.fn>
  moveTo: ReturnType<typeof vi.fn>
  stroke: ReturnType<typeof vi.fn>
  fillStyle?: string | MockGradient
  lineWidth?: number
  strokeStyle?: string | MockGradient
}

const setWindowSize = (width: number, height: number) => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
  })
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: height,
  })
}

const createMockCanvasContext = (): MockCanvasContext => {
  const linearGradient = {
    addColorStop: vi.fn(),
  }
  const radialGradient = {
    addColorStop: vi.fn(),
  }

  return {
    arc: vi.fn(),
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    createLinearGradient: vi.fn(() => linearGradient),
    createRadialGradient: vi.fn(() => radialGradient),
    fill: vi.fn(),
    fillRect: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    stroke: vi.fn(),
  }
}

describe('background canvas components', () => {
  beforeEach(() => {
    setWindowSize(1280, 720)
    vantaMocks.destroy.mockClear()
    vantaMocks.waves.mockImplementation(() => ({
      destroy: vantaMocks.destroy,
    }))
    vantaMocks.waves.mockClear()
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 123))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
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

  it('renders AnimatedGridBackground, resizes with the viewport, and cancels animation on unmount', () => {
    const context = createMockCanvasContext()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D
    )

    const { container, unmount } = render(<AnimatedGridBackground />)
    const canvas = container.querySelector('canvas')

    expect(canvas).toBeTruthy()
    expect(canvas).toHaveAttribute('aria-hidden', 'true')
    expect(canvas).toHaveAttribute('tabindex', '-1')
    expect(canvas?.width).toBe(1280)
    expect(canvas?.height).toBe(720)
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 1280, 720)
    expect(context.createLinearGradient).toHaveBeenCalled()
    expect(context.lineTo).toHaveBeenCalled()

    setWindowSize(1024, 640)
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })

    expect(canvas?.width).toBe(1024)
    expect(canvas?.height).toBe(640)

    unmount()

    expect(cancelAnimationFrame).toHaveBeenCalledWith(123)
  })
})
