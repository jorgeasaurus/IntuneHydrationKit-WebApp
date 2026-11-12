import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it } from 'vitest'

import { render, screen, within } from '@testing-library/react'
import { TaskList } from '@/components/dashboard/TaskList'
import type { HydrationTask } from '@/types/hydration'
import type { PortalLink } from '@/lib/utils/portalLinks'

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
    skipKind: 'noOp',
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

    await user.type(screen.getByRole('textbox', { name: 'Search tasks' }), 'windows')

    expect(screen.getByText('All Windows Devices')).toBeInTheDocument()
    expect(screen.getByText('Duration 4s')).toBeInTheDocument()
    expect(screen.queryByText('Corporate Devices')).not.toBeInTheDocument()
  })

  it('gives every task filter an accessible name', () => {
    render(<TaskList tasks={tasks} />)

    expect(screen.getByRole('textbox', { name: 'Search tasks' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Filter tasks by status' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All: 3 tasks' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Failed: 1 task' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('combobox', { name: 'Filter tasks by category' })).toBeInTheDocument()
  })

  it('supports filtering by status and category and shows an empty state when nothing matches', async () => {
    const user = userEvent.setup()
    render(<TaskList tasks={tasks} />)

    await user.click(screen.getByRole('button', { name: 'Failed: 1 task' }))

    expect(screen.getByText('Windows 11 Baseline')).toBeInTheDocument()
    expect(screen.getByText('Insufficient permissions')).toBeInTheDocument()
    expect(screen.queryByText('Corporate Devices')).not.toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: 'Filter tasks by category' }))
    await user.click(await screen.findByRole('option', { name: 'Device Filters' }))

    expect(screen.getByText('No tasks match your filters')).toBeInTheDocument()
  })

  it('renders skipped task errors with their contextual message', () => {
    render(<TaskList tasks={tasks} />)

    const skippedTask = screen.getByRole('article', { name: 'Corporate Devices: Skipped' })
    expect(within(skippedTask).getByText('Skipped')).toBeInTheDocument()
    expect(within(skippedTask).getByText('Already exists')).toBeInTheDocument()
    expect(within(skippedTask).getByText('Device Filters')).toBeInTheDocument()
  })

  it('shows a portal link only on the task that has one', () => {
    const link: PortalLink = {
      href: 'https://entra.microsoft.com/#view/Microsoft_AAD_IAM/GroupDetailsMenuBlade/~/Overview/groupId/abc',
      label: 'Open in Entra admin center',
      accessibleName: 'Open in Entra admin center: All Windows Devices',
      target: 'object',
    }
    render(<TaskList tasks={tasks} portalLinks={new Map([['group-success', link]])} />)

    const anchor = screen.getByRole('link', { name: 'Open in Entra admin center: All Windows Devices' })
    expect(anchor).toHaveAttribute('href', link.href)
    expect(anchor).toHaveAttribute('target', '_blank')
    expect(anchor).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(within(screen.getByRole('article', { name: 'Windows 11 Baseline: Failed' })).queryByRole('link')).toBeNull()
  })
})
