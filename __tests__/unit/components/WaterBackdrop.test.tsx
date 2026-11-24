import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { WaterBackdrop } from '@/components/WaterBackdrop'

function stubBrowser(reducedMotion: boolean) {
  const putImageData = vi.fn()
  const context = {
    createImageData: (width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
    }),
    putImageData,
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D
  )
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1200)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(800)

  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe() {
        this.callback([], this as unknown as ResizeObserver)
      }
      disconnect() {}
    }
  )
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: reducedMotion,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  )
  const requestAnimationFrame = vi.fn().mockReturnValue(7)
  const cancelAnimationFrame = vi.fn()
  vi.stubGlobal('requestAnimationFrame', requestAnimationFrame)
  vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame)

  return { putImageData, requestAnimationFrame, cancelAnimationFrame }
}

describe('WaterBackdrop', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders one decorative canvas with no focusable content', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const { container } = render(<WaterBackdrop />)

    const root = container.firstElementChild
    expect(root).toHaveClass('water-backdrop')
    expect(root).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelectorAll('canvas')).toHaveLength(1)
    expect(container.querySelector('a, button, input, [tabindex]')).toBeNull()
  })

  it('does nothing when the browser gives no 2D context', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)

    expect(() => render(<WaterBackdrop />)).not.toThrow()
    expect(requestAnimationFrame).not.toHaveBeenCalled()
  })

  it('draws the first frame, starts the animation, and stops it on unmount', () => {
    const browser = stubBrowser(false)
    const { container, unmount } = render(<WaterBackdrop />)

    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    expect(browser.putImageData).toHaveBeenCalledTimes(1)
    expect(canvas.dataset.ready).toBe('true')
    expect(canvas.width).toBe(200)
    expect(canvas.style.width).toBe('1200px')
    expect(browser.requestAnimationFrame).toHaveBeenCalled()

    unmount()
    expect(browser.cancelAnimationFrame).toHaveBeenCalledWith(7)
  })

  it('draws one static frame when the user asks for reduced motion', () => {
    const browser = stubBrowser(true)
    render(<WaterBackdrop />)

    expect(browser.putImageData).toHaveBeenCalledTimes(1)
    expect(browser.requestAnimationFrame).not.toHaveBeenCalled()
  })
})
