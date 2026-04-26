import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it } from 'vitest'

import { render, screen, within } from '@/__tests__/setup/test-utils'
import { TaskList } from '@/components/dashboard/TaskList'
import type { HydrationTask } from '@/types/hydration'

const tasks: HydrationTask[] = [
  {
    id: 'group-success',
    category: 'groups',
    operation: 'create',
    itemName: 'All Windows Devices',
    status: 'success',
    startTime: new Date('2026-04-26T09:00:00.000Z'),
    endTime: new Date('2026-04-26T09:00:04.000Z'),
  },
  {
    id: 'filter-skipped',
    category: 'filters',
    operation: 'create',
    itemName: 'Corporate Devices',
    status: 'skipped',
    error: 'Already exists',
  },
  {
    id: 'compliance-failed',
    category: 'compliance',
    operation: 'create',
    itemName: 'Windows 11 Baseline',
    status: 'failed',
    error: 'Insufficient permissions',
  },
]

describe('TaskList', () => {
  beforeAll(() => {
    Object.defineProperty(Element.prototype, 'hasPointerCapture', {
      configurable: true,
      value: () => false,
    })
    Object.defineProperty(Element.prototype, 'setPointerCapture', {
      configurable: true,
      value: () => {},
    })
    Object.defineProperty(Element.prototype, 'releasePointerCapture', {
      configurable: true,
      value: () => {},
    })
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: () => {},
    })
  })

  it('filters tasks by search term and renders task metadata', async () => {
    const user = userEvent.setup()
    render(<TaskList tasks={tasks} />)

    await user.type(screen.getByPlaceholderText('Search tasks...'), 'windows')

    expect(screen.getByText('All Windows Devices')).toBeInTheDocument()
    expect(screen.getByText('Duration: 4s')).toBeInTheDocument()
    expect(screen.queryByText('Corporate Devices')).not.toBeInTheDocument()
  })

  it('supports filtering by status and category and shows an empty state when nothing matches', async () => {
    const user = userEvent.setup()
    render(<TaskList tasks={tasks} />)

    const filters = screen.getAllByRole('combobox')

    await user.click(filters[0])
    await user.click(await screen.findByRole('option', { name: 'Failed' }))

    expect(screen.getByText('Windows 11 Baseline')).toBeInTheDocument()
    expect(screen.getByText('Insufficient permissions')).toBeInTheDocument()
    expect(screen.queryByText('Corporate Devices')).not.toBeInTheDocument()

    await user.click(filters[1])
    await user.click(await screen.findByRole('option', { name: 'Filters' }))

    expect(screen.getByText('No tasks match your filters')).toBeInTheDocument()
  })

  it('renders skipped task errors with their contextual message', () => {
    render(<TaskList tasks={tasks} />)

    const skippedTask = screen.getByText('Corporate Devices').closest('div')
    expect(skippedTask).not.toBeNull()
    expect(within(skippedTask as HTMLElement).getByText('Skipped')).toBeInTheDocument()
    expect(screen.getByText('Already exists')).toBeInTheDocument()
  })
})
