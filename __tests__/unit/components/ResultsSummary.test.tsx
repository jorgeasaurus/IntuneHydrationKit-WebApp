import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen } from '@testing-library/react'
import { ResultsSummary } from '@/components/dashboard/ResultsSummary'
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

  it('renders preview-specific labels, successful items, and errors', () => {
    render(<ResultsSummary summary={summary} tasks={tasks} isPreview />)

    const previewTitle = screen.getByText('Preview Mode')
    const previewDescription = screen.getByText(/This is a preview of what would happen/i)
    const previewAlert = previewTitle.closest('[role="alert"]')
    expect(previewAlert).toHaveClass('bg-slate-950/95', 'border-sky-300/60', 'text-slate-100')
    expect(previewTitle).toHaveClass('text-slate-50')
    expect(previewDescription).toHaveClass('text-slate-200')
    expect(previewAlert?.querySelector('svg')).toHaveClass('!text-sky-200')
    expect(screen.getByText('Would Create')).toBeInTheDocument()
    expect(screen.getByText('33%')).toBeInTheDocument()
    expect(screen.getByText('Tenant change review')).toBeInTheDocument()
    expect(screen.getByText('1 change')).toBeInTheDocument()
    expect(screen.getByText('1 unchanged')).toBeInTheDocument()
    expect(screen.getByText('1 blocked')).toBeInTheDocument()
    expect(screen.getByText('Create')).toBeInTheDocument()
    expect(screen.getAllByText('No change').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Blocked').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Items That Would Be Created/i)).not.toBeInTheDocument()
    expect(screen.getAllByText('All Windows Devices').length).toBeGreaterThan(0)
    expect(screen.getByText('Errors (1)')).toBeInTheDocument()
    expect(screen.getAllByText('Insufficient privileges').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Dynamic Groups').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Device Filters').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Conditional Access').length).toBeGreaterThan(0)
  })

  it('uses high-contrast status colors in the category breakdown', () => {
    render(<ResultsSummary summary={summary} tasks={tasks} />)

    const getCategoryTaskRow = (itemName: string): HTMLElement | undefined =>
      screen
        .getAllByText(itemName)
        .map((element) => element.parentElement?.parentElement)
        .find((element): element is HTMLElement => element?.classList.contains('items-start') ?? false)

    expect(getCategoryTaskRow('All Windows Devices')).toHaveClass(
      'font-medium',
      'text-emerald-100'
    )
    expect(getCategoryTaskRow('Corporate Devices')).toHaveClass('text-amber-100')
    expect(getCategoryTaskRow('Block Legacy Auth')).toHaveClass('text-red-100')
  })

  it('downloads markdown, json, and csv reports with generated filenames', async () => {
    const user = userEvent.setup()
    render(<ResultsSummary summary={summary} tasks={tasks} />)

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
