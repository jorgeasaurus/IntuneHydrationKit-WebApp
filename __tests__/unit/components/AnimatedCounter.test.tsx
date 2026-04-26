import React from 'react'
import { describe, expect, it, vi } from 'vitest'

import { render, screen } from '@/__tests__/setup/test-utils'
import { AnimatedCounter } from '@/components/ui/animated-counter'

let isInView = true

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
    useInView: () => isInView,
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
})
