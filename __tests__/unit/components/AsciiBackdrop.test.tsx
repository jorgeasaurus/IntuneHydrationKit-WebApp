import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { AsciiBackdrop } from '@/components/AsciiBackdrop'

function stubBrowser(reducedMotion: boolean) {
  const context = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillText: vi.fn(),
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
  let tick: FrameRequestCallback = () => undefined
  const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
    tick = callback
    return 7
  })
  const cancelAnimationFrame = vi.fn()
  vi.stubGlobal('requestAnimationFrame', requestAnimationFrame)
  vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame)

  return {
    context,
    requestAnimationFrame,
    cancelAnimationFrame,
    tick: (nowMs: number) => tick(nowMs),
  }
}

describe('AsciiBackdrop', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders one decorative canvas with no focusable content', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const { container } = render(<AsciiBackdrop />)

    const root = container.firstElementChild
    expect(root).toHaveClass('ascii-backdrop')
    expect(root).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelectorAll('canvas')).toHaveLength(1)
    expect(container.querySelector('a, button, input, [tabindex]')).toBeNull()
  })

  it('does nothing when the browser gives no 2D context', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)

    expect(() => render(<AsciiBackdrop />)).not.toThrow()
    expect(requestAnimationFrame).not.toHaveBeenCalled()
  })

  it('draws the first frame, starts the animation, and stops it on unmount', () => {
    const browser = stubBrowser(false)
    const { container, unmount } = render(<AsciiBackdrop />)

    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    expect(browser.context.clearRect).toHaveBeenCalledTimes(1)
    expect(browser.context.drawImage.mock.calls.length).toBeGreaterThan(0)
    expect(canvas.dataset.ready).toBe('true')
    expect(canvas.width).toBe(1200)
    expect(browser.requestAnimationFrame).toHaveBeenCalled()

    unmount()
    expect(browser.cancelAnimationFrame).toHaveBeenCalledWith(7)
  })

  it('draws the next frame when the frame interval has passed', () => {
    const browser = stubBrowser(false)
    render(<AsciiBackdrop />)
    const firstDraw = performance.now()

    browser.tick(firstDraw + 40)
    expect(browser.context.clearRect).toHaveBeenCalledTimes(2)
  })

  it('keeps a static frame for reduced motion and redraws only when a quiet zone moves', () => {
    const browser = stubBrowser(true)
    const { container } = render(
      <>
        <AsciiBackdrop />
        <div data-quiet>Text</div>
      </>
    )
    expect(browser.context.clearRect).toHaveBeenCalledTimes(1)

    browser.tick(performance.now() + 1000)
    expect(browser.context.clearRect).toHaveBeenCalledTimes(1)

    const quiet = container.querySelector('[data-quiet]') as HTMLElement
    vi.spyOn(quiet, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({ x: 100, y: 100, width: 300, height: 60 }))
    browser.tick(performance.now() + 2000)
    expect(browser.context.clearRect).toHaveBeenCalledTimes(2)
  })
})
