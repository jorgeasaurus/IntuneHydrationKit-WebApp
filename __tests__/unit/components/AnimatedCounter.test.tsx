import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { act, render, screen } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { AnimatedCounter } from '@/components/ui/animated-counter'

let isInView = true
let prefersReducedMotion: boolean | null = false
const inViewOptions: unknown[] = []

vi.mock('framer-motion', async () => {
  const React = await import('react')

  const createMotionValue = (initial: number) => {
    let current = initial
    const listeners = new Set<(value: number) => void>()

    return {
      get: () => current,
      set: (value: number) => {
        current = value
        listeners.forEach((listener) => listener(value))
      },
      subscribe: (listener: (value: number) => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    }
  }

  return {
    useInView: (_ref: unknown, options: unknown) => {
      inViewOptions.push(options)
      return isInView
    },
    useReducedMotion: () => prefersReducedMotion,
    useMotionValue: (initial: number) => createMotionValue(initial),
    useSpring: (motionValue: ReturnType<typeof createMotionValue>) => ({
      on: (_event: string, listener: (value: number) => void) => {
        listener(motionValue.get())
        return motionValue.subscribe(listener)
      },
    }),
    motion: {
      span: React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
        ({ children, ...props }, ref) => (
          <span ref={ref} {...props}>
            {children}
          </span>
        )
      ),
    },
  }
})

describe('AnimatedCounter', () => {
  beforeEach(() => {
    isInView = true
    prefersReducedMotion = false
    inViewOptions.length = 0
  })

  it('renders the formatted target value once it is in view', () => {
    isInView = true

    render(<AnimatedCounter value={1234} />)

    expect(screen.getByText('1,234')).toBeInTheDocument()
  })

  it('keeps the starting value for downward counters until they enter view', () => {
    isInView = false

    render(<AnimatedCounter value={2500} direction="down" className="metric" />)

    const counter = screen.getByText('2,500')
    expect(counter).toBeInTheDocument()
    expect(counter).toHaveClass('metric')
  })

  it('insets the in-view root only vertically so edge counters still start', () => {
    render(<AnimatedCounter value={10} />)

    expect(inViewOptions.at(-1)).toEqual({
      once: true,
      margin: '-100px 0px -100px 0px',
    })
  })

  it('shows the final value at once when the user prefers reduced motion', () => {
    isInView = false
    prefersReducedMotion = true

    render(<AnimatedCounter value={798} />)

    expect(screen.getByText('798')).toBeInTheDocument()
  })

  it('shows zero at once for downward counters when the user prefers reduced motion', () => {
    isInView = false
    prefersReducedMotion = true

    render(<AnimatedCounter value={2500} direction="down" />)

    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('hydrates server HTML without a mismatch when the user prefers reduced motion', async () => {
    // The server cannot read the preference, so it renders the start value.
    prefersReducedMotion = null
    const serverHtml = renderToString(<AnimatedCounter value={798} />)
    expect(serverHtml).toContain('>0<')

    const container = document.createElement('div')
    container.innerHTML = serverHtml
    document.body.appendChild(container)

    prefersReducedMotion = true
    const onRecoverableError = vi.fn()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    let root: ReturnType<typeof hydrateRoot> | undefined
    await act(async () => {
      root = hydrateRoot(container, <AnimatedCounter value={798} />, {
        onRecoverableError,
      })
    })

    expect(onRecoverableError).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
    expect(container.textContent).toBe('798')

    act(() => root?.unmount())
    container.remove()
    consoleError.mockRestore()
  })
})
