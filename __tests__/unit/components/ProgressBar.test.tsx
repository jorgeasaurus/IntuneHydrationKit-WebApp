import { describe, expect, it } from 'vitest'

import { render, screen } from '@/__tests__/setup/test-utils'
import { ProgressBar } from '@/components/dashboard/ProgressBar'
import type { HydrationTask } from '@/types/hydration'

const mixedTasks: HydrationTask[] = [
  {
    id: 'group-success',
    category: 'groups',
    operation: 'create',
    itemName: 'All Windows Devices',
    status: 'success',
  },
  {
    id: 'group-running',
    category: 'groups',
    operation: 'create',
    itemName: 'All macOS Devices',
    status: 'running',
  },
  {
    id: 'filter-failed',
    category: 'filters',
    operation: 'create',
    itemName: 'Corporate Devices',
    status: 'failed',
  },
  {
    id: 'filter-skipped',
    category: 'filters',
    operation: 'create',
    itemName: 'BYOD Devices',
    status: 'skipped',
  },
]

describe('ProgressBar', () => {
  it('shows overall and category progress details for mixed task states', () => {
    const { container } = render(<ProgressBar tasks={mixedTasks} description="Live status" />)

    expect(screen.getAllByText('Overall Progress')).toHaveLength(2)
    expect(screen.getByText('Live status')).toBeInTheDocument()
    expect(screen.getByText('75%')).toBeInTheDocument()
    expect(screen.getByText('Succeeded').previousElementSibling).toHaveTextContent('1')
    expect(screen.getByText('Failed').previousElementSibling).toHaveTextContent('1')
    expect(screen.getByText('Skipped').previousElementSibling).toHaveTextContent('1')
    expect(screen.getByText('Remaining').previousElementSibling).toHaveTextContent('1')
    expect(screen.getByText('Category Progress')).toBeInTheDocument()
    expect(screen.getByText('Dynamic Groups')).toBeInTheDocument()
    expect(screen.getByText('Device Filters')).toBeInTheDocument()
    expect(screen.getByText('(1 failed)')).toBeInTheDocument()
    expect(container.querySelector('[style="width: 75%;"]')).toBeTruthy()
  })

  it('hides category breakdown when all tasks belong to one category', () => {
    render(
      <ProgressBar
        tasks={[
          {
            id: 'complete-task',
            category: 'groups',
            operation: 'create',
            itemName: 'All Devices',
            status: 'success',
          },
        ]}
        title="Batch progress"
      />
    )

    expect(screen.getByText('Batch progress')).toBeInTheDocument()
    expect(screen.getByText('100%')).toBeInTheDocument()
    expect(screen.queryByText('Category Progress')).not.toBeInTheDocument()
  })
})
