import React from 'react'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WebAppDemo } from '@/components/WebAppDemo'

vi.mock('framer-motion', async () => {
  const React = await import('react')

  const stripMotionProps = ({
    animate,
    exit,
    initial,
    transition,
    whileHover,
    whileTap,
    variants,
    ...props
  }: Record<string, unknown>) => props

  const motion = new Proxy(
    {},
    {
      get: (_, tag: string) => {
        const Component = React.forwardRef<
          HTMLElement,
          React.PropsWithChildren<Record<string, unknown>>
        >(
          ({ children, ...props }, ref) =>
            React.createElement(tag, { ref, ...stripMotionProps(props) }, children as React.ReactNode)
        )
        Component.displayName = `motion.${tag}`
        return Component
      },
    }
  )

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    LazyMotion: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    domAnimation: {},
    m: motion,
    motion,
  }
})

describe('demo showcase components', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    act(() => {
      vi.runOnlyPendingTimers()
    })
    vi.useRealTimers()
  })

  it('moves WebAppDemo through deploying, completion, and reset states', () => {
    render(<WebAppDemo />)

    expect(screen.getByText('Select Categories')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(4200)
    })

    expect(screen.getByText('Deploying')).toBeInTheDocument()
    expect(screen.getByText('Creating Dynamic Groups...')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(4080)
    })

    expect(screen.getByText('Deployment Complete')).toBeInTheDocument()
    expect(screen.getByText('All configurations deployed successfully')).toBeInTheDocument()
    expect(screen.getByText('888')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(4000)
    })

    expect(screen.getByText('Select Categories')).toBeInTheDocument()
  })
})
