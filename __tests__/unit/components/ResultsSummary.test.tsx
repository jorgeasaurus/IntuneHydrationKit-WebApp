import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen } from '@testing-library/react'
import { ResultsSummary } from '@/components/dashboard/ResultsSummary'
import { SettingsProvider } from '@/hooks/useSettings'
import type { HydrationSummary, HydrationTask } from '@/types/hydration'

const generateMarkdownReport = vi.fn()
const generateJSONReport = vi.fn()
const generateCSVReport = vi.fn()
const downloadReport = vi.fn()
const generateReportFilename = vi.fn()

vi.mock('@/lib/hydration/reporter', () => ({
  generateMarkdownReport: (...args: unknown[]) => generateMarkdownReport(...args),
  generateJSONReport: (...args: unknown[]) => generateJSONReport(...args),
  generateCSVReport: (...args: unknown[]) => generateCSVReport(...args),
  downloadReport: (...args: unknown[]) => downloadReport(...args),
  generateReportFilename: (...args: unknown[]) => generateReportFilename(...args),
}))

const tasks: HydrationTask[] = [
  {
    id: 'group-created',
    category: 'groups',
    operation: 'create',
    itemName: 'All Windows Devices',
    status: 'success',
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
    id: 'ca-failed',
    category: 'conditionalAccess',
    operation: 'create',
    itemName: 'Block Legacy Auth',
    status: 'failed',
    error: 'Insufficient privileges',
  },
]

const summary: HydrationSummary = {
  tenantId: 'tenant-123',
  operationMode: 'create',
  startTime: new Date('2026-04-26T09:00:00.000Z'),
  endTime: new Date('2026-04-26T09:03:05.000Z'),
  duration: 185000,
  stats: {
    total: 3,
    created: 1,
    deleted: 0,
    skipped: 1,
    failed: 1,
  },
  categoryBreakdown: {
    groups: { total: 1, success: 1, skipped: 0, failed: 0 },
    filters: { total: 1, success: 0, skipped: 1, failed: 0 },
    conditionalAccess: { total: 1, success: 0, skipped: 0, failed: 1 },
  },
  errors: [
    {
      task: 'Block Legacy Auth',
      message: 'Insufficient privileges',
      timestamp: new Date('2026-04-26T09:03:00.000Z'),
    },
  ],
  warnings: [],
}

describe('ResultsSummary', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    generateMarkdownReport.mockReturnValue('# report')
    generateJSONReport.mockReturnValue('{"ok":true}')
    generateCSVReport.mockReturnValue('id,status')
    generateReportFilename.mockImplementation((mode: string, extension: string) => `${mode}.${extension}`)
  })

  function renderSummary(isPreview = false) {
    return render(
      <SettingsProvider>
        <ResultsSummary summary={summary} tasks={tasks} isPreview={isPreview} />
      </SettingsProvider>
    )
  }

  it('renders one mode-aware category list for preview results', () => {
    renderSummary(true)

    const previewTitle = screen.getByText('Preview Mode')
    const previewDescription = screen.getByText(/Review the simulated outcomes below/i)
    const previewAlert = previewTitle.closest('[role="alert"]')
    expect(previewAlert).toHaveClass('glass-panel', 'rounded-2xl', 'text-slate-50')
    expect(previewAlert).not.toHaveClass('bg-slate-950/95')
    expect(previewTitle).toHaveClass('text-white')
    expect(previewDescription).toHaveClass('text-slate-200')
    expect(previewAlert).toHaveClass('[&>svg]:text-sky-100')
    expect(screen.getByText('Changes')).toBeInTheDocument()
    expect(screen.getAllByText('No change').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Blocked').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Items That Would Be Created/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Successfully Created/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Errors \(/i)).not.toBeInTheDocument()
    expect(screen.getAllByText('Dynamic Groups')).toHaveLength(1)
    expect(screen.getAllByText('Device Filters')).toHaveLength(1)
    expect(screen.getAllByText('Conditional Access')).toHaveLength(1)
  })

  it('keeps clean categories collapsed and opens categories that need attention', () => {
    renderSummary()

    expect(screen.getByRole('button', { name: /Dynamic Groups/i })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: /Device Filters/i })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /Conditional Access/i })).toHaveAttribute('aria-expanded', 'true')
  })

  it('shows each category once and keeps task details inside it', async () => {
    const user = userEvent.setup()
    renderSummary()

    expect(screen.getAllByText('Dynamic Groups')).toHaveLength(1)
    expect(screen.queryByText(/Successfully Created/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Errors \(/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Dynamic Groups/i }))
    const completedItem = screen.getByText('All Windows Devices').closest('li')

    expect(completedItem).toHaveTextContent('Success')
    expect(completedItem).toHaveClass('bg-slate-950/55', 'border-emerald-300/15')
  })

  it('separates no-op skips from prerequisite-blocked preview items', () => {
    render(
      <SettingsProvider>
        <ResultsSummary
          summary={{
            ...summary,
            stats: { total: 2, created: 0, deleted: 0, skipped: 2, failed: 0 },
            categoryBreakdown: {
              groups: { total: 1, success: 0, skipped: 1, failed: 0 },
              conditionalAccess: { total: 1, success: 0, skipped: 1, failed: 0 },
            },
            errors: [],
          }}
          isPreview
          tasks={[
          {
            id: 'existing',
            category: 'groups',
            operation: 'create',
            itemName: 'Existing group',
            status: 'skipped',
            error: 'Group already exists',
          },
          {
            id: 'missing-license',
            category: 'conditionalAccess',
            operation: 'create',
            itemName: 'Risk policy',
            status: 'skipped',
            error: 'Missing Premium P2 license',
          },
          ]}
        />
      </SettingsProvider>
    )

    const noChangeMetric = screen.getAllByText('No change').find((element) => element.tagName === 'P')
    const attentionMetric = screen.getByText('Needs attention')
    expect(noChangeMetric?.nextElementSibling).toHaveTextContent('1')
    expect(attentionMetric.nextElementSibling).toHaveTextContent('1')
  })

  it('filters the category list to tasks that need attention', async () => {
    const user = userEvent.setup()
    renderSummary()

    await user.click(screen.getByRole('button', { name: /Issues only/i }))

    expect(screen.queryByText('Dynamic Groups')).not.toBeInTheDocument()
    expect(screen.getByText('Device Filters')).toBeInTheDocument()
    expect(screen.getByText('Conditional Access')).toBeInTheDocument()
  })

  it('opens and filters categories with warnings or unfinished tasks', async () => {
    const user = userEvent.setup()
    const attentionTasks: HydrationTask[] = [
      {
        id: 'group-pending',
        category: 'groups',
        operation: 'create',
        itemName: 'Pending group',
        status: 'pending',
      },
      {
        id: 'filter-warning',
        category: 'filters',
        operation: 'create',
        itemName: 'Warning filter',
        status: 'success',
        warning: 'The assignment needs manual review',
      },
    ]

    render(
      <SettingsProvider>
        <ResultsSummary
          summary={{
            ...summary,
            stats: { total: 2, created: 1, deleted: 0, skipped: 0, failed: 0 },
            categoryBreakdown: {
              groups: { total: 1, success: 0, skipped: 0, failed: 0 },
              filters: { total: 1, success: 1, skipped: 0, failed: 0 },
            },
            errors: [],
          }}
          tasks={attentionTasks}
        />
      </SettingsProvider>
    )

    expect(screen.getByRole('button', { name: /Dynamic Groups/i })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /Device Filters/i })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Pending group').closest('li')).toHaveTextContent('Unfinished')
    expect(screen.getByText('Warning filter').closest('li')).toHaveTextContent('Warning')

    await user.click(screen.getByRole('button', { name: /Issues only/i }))
    expect(screen.getByText('Dynamic Groups')).toBeInTheDocument()
    expect(screen.getByText('Device Filters')).toBeInTheDocument()
  })

  it('does not classify unfinished preview tasks as changes', () => {
    render(
      <SettingsProvider>
        <ResultsSummary
          summary={{
            ...summary,
            stats: { total: 1, created: 0, deleted: 0, skipped: 0, failed: 0 },
            categoryBreakdown: {
              groups: { total: 1, success: 0, skipped: 0, failed: 0 },
            },
            errors: [],
          }}
          isPreview
          tasks={[
            {
              id: 'group-running',
              category: 'groups',
              operation: 'create',
              itemName: 'Running group',
              status: 'running',
            },
          ]}
        />
      </SettingsProvider>
    )

    const changesMetric = screen.getByText('Changes')
    const attentionMetric = screen.getByText('Needs attention')
    expect(changesMetric.nextElementSibling).toHaveTextContent('0')
    expect(attentionMetric.nextElementSibling).toHaveTextContent('1')
    expect(screen.getByText('Running group').closest('li')).toHaveTextContent('Unfinished')
  })

  it('limits long categories until the user asks to show every task', async () => {
    const user = userEvent.setup()
    const longTasks: HydrationTask[] = Array.from({ length: 26 }, (_, index) => ({
      id: `group-${index}`,
      category: 'groups',
      operation: 'create',
      itemName: `Group ${index + 1}`,
      status: 'success',
    }))

    render(
      <SettingsProvider>
        <ResultsSummary
          summary={{
            ...summary,
            stats: { total: 26, created: 26, deleted: 0, skipped: 0, failed: 0 },
            categoryBreakdown: {
              groups: { total: 26, success: 26, skipped: 0, failed: 0 },
            },
            errors: [],
          }}
          tasks={longTasks}
        />
      </SettingsProvider>
    )

    await user.click(screen.getByRole('button', { name: /Dynamic Groups/i }))
    expect(screen.getByText('Group 25')).toBeInTheDocument()
    expect(screen.queryByText('Group 26')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show all 26' }))
    expect(screen.getByText('Group 26')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show fewer' })).toBeInTheDocument()
  })

  it('downloads markdown, json, and csv reports with generated filenames', async () => {
    const user = userEvent.setup()
    renderSummary()

    await user.click(screen.getByRole('button', { name: /markdown/i }))
    await user.click(screen.getByRole('button', { name: /json/i }))
    await user.click(screen.getByRole('button', { name: /csv/i }))

    expect(generateMarkdownReport).toHaveBeenCalledWith(summary, tasks)
    expect(generateJSONReport).toHaveBeenCalledWith(summary, tasks)
    expect(generateCSVReport).toHaveBeenCalledWith(tasks)
    expect(downloadReport).toHaveBeenNthCalledWith(1, '# report', 'create.md')
    expect(downloadReport).toHaveBeenNthCalledWith(2, '{"ok":true}', 'create.json')
    expect(downloadReport).toHaveBeenNthCalledWith(3, 'id,status', 'create.csv')
  })
})
