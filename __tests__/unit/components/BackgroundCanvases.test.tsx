import { act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { render } from '@/__tests__/setup/test-utils'
import { IndustrialBackground } from '@/components/IndustrialBackground'
import { AnimatedGridBackground } from '@/components/ui/animated-grid-background'

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
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 123))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('draws and cleans up IndustrialBackground canvas resources', () => {
    const context = createMockCanvasContext()
    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(context as unknown as CanvasRenderingContext2D)
    const observerSpies = {
      disconnect: vi.fn(),
      observe: vi.fn(),
    }

    vi.stubGlobal(
      'MutationObserver',
      class {
        observe = observerSpies.observe
        disconnect = observerSpies.disconnect
      } as unknown as typeof MutationObserver
    )

    document.documentElement.classList.add('dark')

    const { container, unmount } = render(<IndustrialBackground />)
    const canvas = container.querySelector('canvas')

    expect(canvas).toBeTruthy()
    expect(canvas?.width).toBe(1280)
    expect(canvas?.height).toBe(720)
    expect(getContextSpy).toHaveBeenCalledWith('2d')
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 1280, 720)
    expect(context.createLinearGradient).toHaveBeenCalled()
    expect(context.createRadialGradient).toHaveBeenCalled()
    expect(context.arc).toHaveBeenCalled()
    expect(observerSpies.observe).toHaveBeenCalledWith(document.documentElement, {
      attributeFilter: ['class'],
      attributes: true,
    })

    setWindowSize(1440, 900)
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })

    expect(canvas?.width).toBe(1440)
    expect(canvas?.height).toBe(900)

    unmount()

    expect(cancelAnimationFrame).toHaveBeenCalledWith(123)
    expect(observerSpies.disconnect).toHaveBeenCalled()
  })

  it('renders AnimatedGridBackground, resizes with the viewport, and cancels animation on unmount', () => {
    const context = createMockCanvasContext()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D
    )

    const { container, unmount } = render(<AnimatedGridBackground />)
    const canvas = container.querySelector('canvas')

    expect(canvas).toBeTruthy()
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
