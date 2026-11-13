import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import HistoryPage from '@/app/history/page'
import { SettingsProvider } from '@/hooks/useSettings'
import { addRunHistoryEntry, clearRunHistory, createRunHistoryEntry } from '@/lib/history/runHistory'
import { notifySignOut } from '@/lib/auth/sessionEvents'
import { RUN_HISTORY_STORAGE_KEY } from '@/lib/storageKeys'
import { createSummary } from '@/lib/hydration/reporter'
import { buildEntry, buildTasks, OWNER_A, OWNER_B, withUpdates } from '../../helpers/runHistoryFixtures'

const activeAccount = vi.hoisted(() => ({ current: null as null | { homeAccountId: string; tenantId: string } }))
const downloadReport = vi.hoisted(() => vi.fn())

vi.mock('@azure/msal-react', () => ({
  useMsal: () => ({
    instance: { getActiveAccount: () => activeAccount.current },
    accounts: activeAccount.current ? [activeAccount.current] : [],
  }),
}))

vi.mock('@/components/auth/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/lib/hydration/reporter', async () => {
  const actual = await vi.importActual<typeof import('@/lib/hydration/reporter')>('@/lib/hydration/reporter')
  return { ...actual, downloadReport }
})

function renderPage() {
  return render(
    <SettingsProvider>
      <HistoryPage />
    </SettingsProvider>,
  )
}

describe('HistoryPage', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
    downloadReport.mockReset()
    activeAccount.current = OWNER_A
  })

  it('shows an empty state', () => {
    renderPage()
    expect(screen.getByText('No runs yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open the wizard' })).toHaveAttribute('href', '/wizard')
  })

  it('lists runs of the active account and tenant only', () => {
    addRunHistoryEntry(sessionStorage, buildEntry(OWNER_A, 4, new Date('2026-11-01T11:00:00.000Z')))
    renderPage()

    const list = screen.getByRole('list', { name: 'Past runs' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    expect(within(list).getByText('Contoso Ltd')).toBeInTheDocument()
    expect(within(list).getByText(OWNER_A.tenantId)).toBeInTheDocument()
    expect(within(list).getByText('Create')).toBeInTheDocument()
  })

  it('does not show the history of another tenant', () => {
    addRunHistoryEntry(sessionStorage, buildEntry(OWNER_A, 4))
    activeAccount.current = OWNER_B
    renderPage()
    expect(screen.getByText('No runs yet')).toBeInTheDocument()
    expect(screen.queryByText('Contoso Ltd')).not.toBeInTheDocument()
    expect(sessionStorage.getItem(RUN_HISTORY_STORAGE_KEY) ?? '').not.toContain(OWNER_A.tenantId)
  })

  it('blurs tenant identities in Demo Mode', () => {
    localStorage.setItem('app-settings:v1', JSON.stringify({ stopOnFirstError: false, demoMode: true }))
    addRunHistoryEntry(sessionStorage, buildEntry(OWNER_A, 2))
    renderPage()

    expect(screen.getByText('Contoso Ltd')).toHaveClass('demo-sensitive-data')
    expect(screen.getByText(OWNER_A.tenantId)).toHaveClass('demo-sensitive-data')
    expect(screen.getAllByText(/sensitive data hidden while demo mode is on/i).length).toBeGreaterThan(0)
  })

  it('opens a past run and downloads its reports', async () => {
    const user = userEvent.setup()
    addRunHistoryEntry(sessionStorage, buildEntry(OWNER_A, 4))
    renderPage()

    await user.click(screen.getByRole('button', { name: /Open results of the run/ }))
    expect(screen.getByRole('heading', { name: 'Run results' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: /Markdown/ }))
    await user.click(screen.getByRole('button', { name: /JSON/ }))
    await user.click(screen.getByRole('button', { name: /CSV/ }))
    expect(downloadReport).toHaveBeenCalledTimes(3)
    expect(downloadReport.mock.calls[0][0]).toContain('# Intune Hydration Report')
    expect(downloadReport.mock.calls[0][0]).toContain(OWNER_A.tenantId)
    expect(JSON.parse(downloadReport.mock.calls[1][0]).tasks).toHaveLength(4)
    // Created-object portal links come back from history, as on the dashboard.
    expect(downloadReport.mock.calls[0][0]).toMatch(/- (Created object in portal|Portal list \(.*\)): https:\/\//)
    expect(JSON.parse(downloadReport.mock.calls[1][0]).tasks.some((task: { portalLink?: unknown }) => task.portalLink)).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Back to run history' }))
    expect(screen.getByRole('list', { name: 'Past runs' })).toBeInTheDocument()
  })

  it('labels preview counts as would-change counts for every outcome', () => {
    const preview = { ...OWNER_A, operationMode: 'create' as const, isPreview: true, selectedObjectCount: 5 }
    const live = buildEntry(OWNER_A, 5, new Date('2026-11-01T11:00:00.000Z'))
    addRunHistoryEntry(sessionStorage, createRunHistoryEntry({
      configuration: preview,
      tasks: live.tasks,
      summary: live.summary,
      outcome: live.outcome,
      fatalError: null,
      startTime: live.startTime,
      endTime: live.endTime,
      pausedMs: 0,
    }))
    addRunHistoryEntry(sessionStorage, createRunHistoryEntry({
      configuration: preview,
      tasks: buildTasks(5),
      summary: null,
      outcome: 'failed',
      fatalError: 'Your sign-in session expired.',
      startTime: new Date('2026-11-01T12:00:00.000Z'),
      endTime: new Date('2026-11-01T12:01:00.000Z'),
      pausedMs: 0,
    }))
    renderPage()

    const items = within(screen.getByRole('list', { name: 'Past runs' })).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    for (const item of items) {
      expect(within(item).getByText('Preview (create)')).toBeInTheDocument()
      expect(within(item).getByText('Would create:').nextElementSibling).toHaveTextContent('3')
      expect(within(item).getByText('Would delete:')).toBeInTheDocument()
      expect(within(item).queryByText('Created:')).not.toBeInTheDocument()
      expect(within(item).queryByText('Deleted:')).not.toBeInTheDocument()
    }
  })

  it('shows the update count only for a run that updated objects', () => {
    const start = new Date('2026-11-01T10:00:00.000Z')
    const end = new Date('2026-11-01T10:05:00.000Z')
    const tasks = withUpdates(buildTasks(12, start), true)
    addRunHistoryEntry(sessionStorage, createRunHistoryEntry({
      configuration: { ...OWNER_A, operationMode: 'create', isPreview: false, selectedObjectCount: 12 },
      tasks,
      summary: createSummary(OWNER_A.tenantId, 'create', start, end, tasks),
      outcome: 'completedWithIssues',
      fatalError: null,
      startTime: start,
      endTime: end,
      pausedMs: 0,
    }))
    addRunHistoryEntry(sessionStorage, buildEntry(OWNER_A, 4, new Date('2026-11-01T09:00:00.000Z')))
    renderPage()

    const [withUpdate, withoutUpdate] = within(screen.getByRole('list', { name: 'Past runs' })).getAllByRole('listitem')
    expect(within(withUpdate).getByText('Updated:').nextElementSibling).toHaveTextContent('2')
    expect(within(withoutUpdate).queryByText('Updated:')).not.toBeInTheDocument()
  })

  it('shows a failed run without reports', async () => {
    const user = userEvent.setup()
    addRunHistoryEntry(sessionStorage, createRunHistoryEntry({
      configuration: { ...OWNER_A, operationMode: 'delete', isPreview: false, selectedObjectCount: 2 },
      tasks: buildTasks(2).map((task) => ({ ...task, operation: 'delete' as const })),
      summary: null,
      outcome: 'failed',
      fatalError: 'Your sign-in session expired.',
      startTime: new Date('2026-11-01T10:00:00.000Z'),
      endTime: new Date('2026-11-01T10:01:00.000Z'),
      pausedMs: 0,
    }))
    renderPage()
    expect(screen.getByText('Run failed')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Open results of the run/ }))
    expect(screen.getByText('Your sign-in session expired.')).toBeInTheDocument()
    expect(screen.getByText(/Reports are not available/)).toBeInTheDocument()
  })

  it('deletes one run and clears all runs after confirmation', async () => {
    const user = userEvent.setup()
    addRunHistoryEntry(sessionStorage, buildEntry(OWNER_A, 1, new Date('2026-11-01T11:00:00.000Z')))
    addRunHistoryEntry(sessionStorage, buildEntry(OWNER_A, 1, new Date('2026-11-01T12:00:00.000Z')))
    addRunHistoryEntry(sessionStorage, buildEntry(OWNER_A, 1, new Date('2026-11-01T13:00:00.000Z')))
    renderPage()
    const list = () => screen.getByRole('list', { name: 'Past runs' })
    expect(within(list()).getAllByRole('listitem')).toHaveLength(3)

    const [firstDelete] = screen.getAllByRole('button', { name: /Delete the run on/ })
    await user.click(firstDelete)
    const dialog = await screen.findByRole('dialog', { name: 'Delete this run from history?' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(within(list()).getAllByRole('listitem')).toHaveLength(3)

    await user.click(screen.getAllByRole('button', { name: /Delete the run on/ })[0])
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete run' }))
    expect(within(list()).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('status')).toHaveTextContent(/Deleted the run on/)

    await user.click(screen.getByRole('button', { name: 'Clear all' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Delete all runs from history?' })).getByRole('button', { name: 'Delete all runs' }))
    expect(screen.getByText('No runs yet')).toBeInTheDocument()
    expect(sessionStorage.getItem(RUN_HISTORY_STORAGE_KEY)).toBeNull()
  })

  it('empties the view on sign-out', () => {
    addRunHistoryEntry(sessionStorage, buildEntry(OWNER_A, 1))
    renderPage()
    expect(screen.getByRole('list', { name: 'Past runs' })).toBeInTheDocument()
    clearRunHistory(sessionStorage)
    act(() => notifySignOut())
    expect(screen.getByText('No runs yet')).toBeInTheDocument()
  })
})
