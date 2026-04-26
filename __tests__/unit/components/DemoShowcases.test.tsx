import React from 'react'
import { act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen } from '@/__tests__/setup/test-utils'
import { TerminalDemo } from '@/components/TerminalDemo'
import { WebAppDemo } from '@/components/WebAppDemo'
import { WizardDemo } from '@/components/WizardDemo'

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
        const Component = React.forwardRef<HTMLElement, Record<string, unknown>>(
          ({ children, ...props }, ref) =>
            React.createElement(tag, { ref, ...stripMotionProps(props) }, children)
        )
        Component.displayName = `motion.${tag}`
        return Component
      },
    }
  )

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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

  it('cycles TerminalDemo from running logs to the completion summary and back to running', () => {
    render(<TerminalDemo />)

    expect(screen.getByText('Processing...')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(400)
    })

    expect(screen.getByText('$ hydrate --mode create --all')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(6400)
    })

    expect(screen.getByText('Hydration Complete')).toBeInTheDocument()
    expect(screen.getByText('Duration: 8m 42s')).toBeInTheDocument()
    expect(screen.getByText('927')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(5400)
    })

    expect(screen.queryByText('Hydration Complete')).not.toBeInTheDocument()
    expect(screen.getByText('$ hydrate --mode create --all')).toBeInTheDocument()
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

  it('advances WizardDemo through each step and then loops back to the first step', () => {
    render(<WizardDemo />)

    expect(screen.getByText('contoso.onmicrosoft.com')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(3000)
    })

    expect(screen.getByText('Configuration Profiles')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(3000)
    })

    expect(screen.getByText('Progress')).toBeInTheDocument()
    expect(screen.getByText('Creating Dynamic Groups...')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(screen.getByText('8%')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(2800)
    })

    expect(screen.getByText('Deployment Complete')).toBeInTheDocument()
    expect(screen.getByText('927 objects created successfully')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(3000)
    })

    expect(screen.getByText('contoso.onmicrosoft.com')).toBeInTheDocument()
  })
})
