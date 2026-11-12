import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { TaskList } from '@/components/dashboard/TaskList'
import { TASK_ROW_HEIGHT } from '@/components/dashboard/TaskRow'
import { buildRowOffsets, getRowWindow, WINDOW_OVERSCAN } from '@/components/dashboard/taskWindow'
import * as categoryLabels from '@/lib/hydration/categoryLabels'
import type { HydrationTask } from '@/types/hydration'

function makeTasks(count: number): HydrationTask[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `task-${index}`,
    category: 'groups',
    operation: 'create',
    itemName: `Group ${index}`,
    status: index === 3 ? 'failed' : 'pending',
    error: index === 3 ? 'Insufficient permissions' : undefined,
  })) as HydrationTask[]
}

describe('taskWindow', () => {
  it('builds prefix offsets from row heights', () => {
    expect(buildRowOffsets([10, 20, 30])).toEqual([0, 10, 30, 60])
  })

  it('returns the visible rows plus overscan and clamps at the ends', () => {
    const offsets = buildRowOffsets(new Array(100).fill(10))

    expect(getRowWindow(offsets, 0, 50, 2)).toEqual({ start: 0, end: 8 })
    expect(getRowWindow(offsets, 500, 50, 2)).toEqual({ start: 48, end: 58 })
    expect(getRowWindow(offsets, 99999, 50, 2)).toEqual({ start: 93, end: 100 })
    expect(getRowWindow([0], 0, 50, 2)).toEqual({ start: 0, end: 0 })
  })
})

describe('TaskList windowing', () => {
  it('renders small lists in full', () => {
    render(<TaskList tasks={makeTasks(50)} />)

    const list = screen.getByRole('list', { name: 'Hydration tasks' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(50)
  })

  it('renders only the visible window of a long list with full-size semantics', () => {
    render(<TaskList tasks={makeTasks(1200)} />)

    const list = screen.getByRole('list', { name: 'Hydration tasks' })
    const items = within(list).getAllByRole('listitem')

    expect(items.length).toBeLessThan(40)
    expect(items[0]).toHaveAttribute('aria-posinset', '1')
    expect(items[0]).toHaveAttribute('aria-setsize', '1200')
    expect(screen.getByRole('region', { name: 'Task list, 1200 tasks' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByText('Group 0')).toBeInTheDocument()
    expect(screen.queryByText('Group 1199')).not.toBeInTheDocument()
  })

  it('moves the window when the list scrolls', async () => {
    render(<TaskList tasks={makeTasks(1200)} />)

    const region = screen.getByRole('region', { name: 'Task list, 1200 tasks' })
    region.scrollTop = 600 * TASK_ROW_HEIGHT
    fireEvent.scroll(region)

    await waitFor(() => expect(screen.getByText('Group 600')).toBeInTheDocument())
    expect(screen.queryByText('Group 0')).not.toBeInTheDocument()

    const list = screen.getByRole('list', { name: 'Hydration tasks' })
    const first = within(list).getAllByRole('listitem')[0]
    expect(Number(first.getAttribute('aria-posinset'))).toBeGreaterThanOrEqual(600 - WINDOW_OVERSCAN - 1)
  })

  it('keeps search filtering on a windowed list', async () => {
    render(<TaskList tasks={makeTasks(1200)} />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Search tasks' }), {
      target: { value: 'Group 1199' },
    })

    await waitFor(() => expect(screen.getByText('Group 1199')).toBeInTheDocument())
    expect(screen.getByText('1 of 1200 tasks shown')).toBeInTheDocument()
  })

  it('does not re-render unchanged rows when one task updates', () => {
    const tasks = makeTasks(1200)
    const { rerender } = render(<TaskList tasks={tasks} />)
    const labelSpy = vi.spyOn(categoryLabels, 'getTaskCategoryLabel')

    const updated = tasks.slice()
    updated[0] = { ...tasks[0], status: 'running' }
    rerender(<TaskList tasks={updated} />)

    // Each rendered row calls getTaskCategoryLabel once. About 20 rows are in
    // the window, so a small count shows that only the changed row rendered.
    expect(labelSpy).toHaveBeenCalled()
    expect(labelSpy.mock.calls.length).toBeLessThanOrEqual(3)
    expect(screen.getByRole('article', { name: 'Group 0: Running' })).toBeInTheDocument()
    labelSpy.mockRestore()
  })
})
