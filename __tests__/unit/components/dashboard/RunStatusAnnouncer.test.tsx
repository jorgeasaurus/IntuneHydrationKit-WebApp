import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RunStatusAnnouncer } from '@/components/dashboard/RunStatusAnnouncer'
import {
  INITIAL_ANNOUNCEMENT_CURSOR,
  buildOutcomeAnnouncement,
  buildProgressAnnouncement,
  getProgressStep,
} from '@/components/dashboard/runAnnouncements'
import type { HydrationTask, TaskStatus } from '@/types/hydration'

function makeTasks(total: number, statuses: Partial<Record<number, TaskStatus>> = {}): HydrationTask[] {
  return Array.from({ length: total }, (_, index) => ({
    id: `task-${index}`,
    category: 'groups',
    operation: 'create',
    itemName: `Group ${index}`,
    status: statuses[index] ?? 'pending',
  })) as HydrationTask[]
}

function completeFirst(total: number, count: number, extra: Partial<Record<number, TaskStatus>> = {}) {
  const statuses: Partial<Record<number, TaskStatus>> = {}
  for (let i = 0; i < count; i += 1) statuses[i] = 'success'
  return makeTasks(total, { ...statuses, ...extra })
}

describe('runAnnouncements', () => {
  it('scales the progress step with the queue size', () => {
    expect(getProgressStep(20)).toBe(10)
    expect(getProgressStep(1000)).toBe(100)
  })

  it('stays silent until enough tasks finish', () => {
    expect(buildProgressAnnouncement(completeFirst(20, 9), INITIAL_ANNOUNCEMENT_CURSOR)).toBeNull()
    expect(buildProgressAnnouncement(completeFirst(20, 10), INITIAL_ANNOUNCEMENT_CURSOR)?.message)
      .toBe('10 of 20 tasks complete.')
  })

  it('announces each failure once', () => {
    const tasks = completeFirst(20, 2, { 2: 'failed' })
    const first = buildProgressAnnouncement(tasks, INITIAL_ANNOUNCEMENT_CURSOR)
    expect(first?.message).toBe('Failed: Group 2. 3 of 20 tasks complete.')
    expect(buildProgressAnnouncement(tasks, first!.cursor)).toBeNull()
  })

  it('summarises several new failures', () => {
    const tasks = makeTasks(20, { 0: 'failed', 1: 'failed' })
    expect(buildProgressAnnouncement(tasks, INITIAL_ANNOUNCEMENT_CURSOR)?.message)
      .toBe('2 tasks failed. Latest: Group 1. 2 of 20 tasks complete.')
  })

  it('describes the final outcome', () => {
    expect(buildOutcomeAnnouncement(completeFirst(3, 3), 'succeeded')).toBe('Run finished: 3 succeeded.')
    expect(buildOutcomeAnnouncement(completeFirst(3, 2, { 2: 'failed' }), 'completedWithIssues'))
      .toBe('Run finished: Completed with issues. 1 failed.')
  })
})

describe('RunStatusAnnouncer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('mounts an empty polite region and throttles progress messages', () => {
    const { rerender } = render(
      <RunStatusAnnouncer tasks={makeTasks(20)} isCompleted={false} outcome={null} announceOutcome />,
    )

    const region = screen.getByRole('status')
    expect(region).toHaveAttribute('aria-live', 'polite')
    expect(region).toBeEmptyDOMElement()

    rerender(
      <RunStatusAnnouncer tasks={completeFirst(20, 1, { 1: 'failed' })} isCompleted={false} outcome={null} announceOutcome />,
    )
    act(() => {
      vi.advanceTimersByTime(0)
    })
    expect(region).toHaveTextContent('Failed: Group 1. 2 of 20 tasks complete.')

    rerender(
      <RunStatusAnnouncer tasks={completeFirst(20, 2, { 2: 'failed' })} isCompleted={false} outcome={null} announceOutcome />,
    )
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(region).toHaveTextContent('Failed: Group 1.')

    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(region).toHaveTextContent('Failed: Group 2. 3 of 20 tasks complete.')
  })

  it('inserts the outcome after the region is mounted empty', () => {
    render(
      <RunStatusAnnouncer tasks={completeFirst(2, 2)} isCompleted outcome="succeeded" announceOutcome />,
    )

    const region = screen.getByRole('status')
    expect(region).toBeEmptyDOMElement()

    act(() => {
      vi.advanceTimersByTime(0)
    })
    expect(region).toHaveTextContent('Run finished: 2 succeeded.')
  })

  it('does not announce the outcome when another region covers it', () => {
    render(
      <RunStatusAnnouncer tasks={completeFirst(2, 2)} isCompleted outcome="failed" announceOutcome={false} />,
    )

    act(() => {
      vi.advanceTimersByTime(10)
    })
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })
})
