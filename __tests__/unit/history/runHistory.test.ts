import { beforeEach, describe, expect, it } from 'vitest'
import { RUN_HISTORY_STORAGE_KEY } from '@/lib/storageKeys'
import {
  addRunHistoryEntry,
  clearRunHistory,
  clearRunHistoryEntries,
  createRunHistoryEntry,
  deleteRunHistoryEntry,
  MAX_RUN_HISTORY_CHARS,
  MAX_RUN_HISTORY_ENTRIES,
  markPendingRunHistoryId,
  readPendingRunHistoryId,
  readRunHistory,
} from '@/lib/history/runHistory'
import { generateCSVReport, generateJSONReport, generateMarkdownReport } from '@/lib/hydration/reporter'
import { createSummary } from '@/lib/hydration/reporter'
import { buildEntry, buildTasks, OWNER_A, OWNER_B, withUpdates } from '../../helpers/runHistoryFixtures'

function minutes(count: number): Date {
  return new Date(Date.UTC(2026, 10, 1, 10, count))
}

describe('run history', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('stores a finished run and reads it back with dates and report data', () => {
    const entry = buildEntry(OWNER_A, 12)
    expect(addRunHistoryEntry(sessionStorage, entry)).toEqual({ ok: true, dropped: 0 })

    const [stored] = readRunHistory(sessionStorage, OWNER_A)
    expect(stored.id).toBe(entry.id)
    expect(stored.tenantName).toBe('Contoso Ltd')
    expect(stored.endTime).toEqual(entry.endTime)
    expect(stored.summary?.startTime).toEqual(entry.summary?.startTime)
    expect(stored.tasks[0].startTime).toEqual(entry.tasks[0].startTime)
    expect(stored.counts).toEqual({ ...entry.summary?.stats, updated: 0, wouldCreate: 0, wouldUpdate: 0, wouldDelete: 0 })
    expect(stored.cloudEnvironment).toBe('global')
    expect(stored.tasks.find((task) => task.status === 'success')?.createdObject?.id).toMatch(/^0f9e8d7c-/)

    const outcome = stored.outcome === 'failed' ? 'cancelled' : stored.outcome
    const original = generateJSONReport(entry.summary!, entry.tasks, outcome, false)
    const restored = generateJSONReport(stored.summary!, stored.tasks, outcome, false)
    expect(JSON.parse(restored).tasks).toEqual(JSON.parse(original).tasks)
    expect(generateMarkdownReport(stored.summary!, stored.tasks, outcome, false)).toContain('# Intune Hydration Report')
    expect(generateCSVReport(stored.tasks, outcome, false, stored.summary!).split('\n')).toHaveLength(13)
  })

  it('replaces an entry with the same run ID instead of adding a copy', () => {
    const entry = buildEntry(OWNER_A, 2)
    addRunHistoryEntry(sessionStorage, entry)
    addRunHistoryEntry(sessionStorage, entry)
    expect(readRunHistory(sessionStorage, OWNER_A)).toHaveLength(1)
  })

  it('drops unknown task fields and the activity log', () => {
    const entry = buildEntry(OWNER_A, 2)
    const withExtras = {
      ...entry,
      tasks: entry.tasks.map((task) => ({ ...task, createdObjectId: 'future-field', rawPayload: 'x'.repeat(1000) })),
    }
    addRunHistoryEntry(sessionStorage, createRunHistoryEntry({
      configuration: { ...OWNER_A, operationMode: 'create', isPreview: false, selectedObjectCount: 2, tenantName: 'Contoso Ltd' },
      tasks: withExtras.tasks,
      summary: entry.summary,
      outcome: entry.outcome,
      fatalError: null,
      startTime: entry.startTime,
      endTime: entry.endTime,
      pausedMs: 0,
    }))
    const raw = sessionStorage.getItem(RUN_HISTORY_STORAGE_KEY) ?? ''
    expect(raw).not.toContain('future-field')
    expect(raw).not.toContain('rawPayload')
    expect(raw).not.toContain('activityLog')
    expect(readRunHistory(sessionStorage, OWNER_A)[0].tasks).toHaveLength(2)
  })

  it('records a failed run without a summary and counts its tasks', () => {
    const tasks = buildTasks(5)
    const entry = createRunHistoryEntry({
      configuration: { ...OWNER_A, operationMode: 'delete', isPreview: false, selectedObjectCount: 5 },
      tasks: tasks.map((task) => ({ ...task, operation: 'delete' as const })),
      summary: null,
      outcome: 'failed',
      fatalError: 'Your sign-in session expired.',
      startTime: minutes(0),
      endTime: minutes(3),
      pausedMs: 60_000,
    })
    expect(entry.durationMs).toBe(120_000)
    expect(entry.counts).toEqual({ total: 5, created: 0, deleted: 3, updated: 0, wouldCreate: 0, wouldUpdate: 0, wouldDelete: 0, skipped: 1, failed: 1 })
    expect(addRunHistoryEntry(sessionStorage, entry).ok).toBe(true)
    expect(readRunHistory(sessionStorage, OWNER_A)[0].fatalError).toBe('Your sign-in session expired.')
  })

  it('counts preview successes as would-change counts for every outcome', () => {
    const tasks = buildTasks(5)
    const preview = { ...OWNER_A, operationMode: 'create' as const, isPreview: true, selectedObjectCount: 5 }
    const completed = buildEntry(OWNER_A, 5)
    const finished = createRunHistoryEntry({
      configuration: preview,
      tasks: completed.tasks,
      summary: completed.summary,
      outcome: completed.outcome,
      fatalError: null,
      startTime: completed.startTime,
      endTime: completed.endTime,
      pausedMs: 0,
    })
    const failed = createRunHistoryEntry({
      configuration: preview,
      tasks,
      summary: null,
      outcome: 'failed',
      fatalError: 'Your sign-in session expired.',
      startTime: minutes(0),
      endTime: minutes(1),
      pausedMs: 0,
    })
    const expected = { total: 5, created: 0, deleted: 0, updated: 0, wouldCreate: 3, wouldUpdate: 0, wouldDelete: 0, skipped: 1, failed: 1 }
    expect(finished.counts).toEqual(expected)
    expect(failed.counts).toEqual(expected)
  })

  it('counts updates of existing kit objects and keeps their evidence for the reports', () => {
    for (const isPreview of [false, true]) {
      sessionStorage.clear()
      const tasks = withUpdates(buildTasks(12, minutes(0)), !isPreview)
      const summary = createSummary(OWNER_A.tenantId, 'create', minutes(0), minutes(5), tasks)
      expect(summary.stats.updated).toBe(2)
      addRunHistoryEntry(sessionStorage, createRunHistoryEntry({
        configuration: { ...OWNER_A, operationMode: 'create', isPreview, selectedObjectCount: 12 },
        tasks,
        summary,
        outcome: 'completedWithIssues',
        fatalError: null,
        startTime: minutes(0),
        endTime: minutes(5),
        pausedMs: 0,
      }))
      const [stored] = readRunHistory(sessionStorage, OWNER_A)
      const changes = summary.stats.created
      expect(stored.counts).toMatchObject(isPreview
        ? { created: 0, updated: 0, wouldCreate: changes, wouldUpdate: 2 }
        : { created: changes, updated: 2, wouldCreate: 0, wouldUpdate: 0 })
      expect(stored.summary?.stats.updated).toBe(2)
      const markdown = generateMarkdownReport(stored.summary!, stored.tasks, 'completedWithIssues', isPreview)
      expect(markdown).toContain('Updated object: existing-task-2')
      expect(markdown).toContain('Updated setting: membershipRule')
      expect(markdown).toContain(`- **${isPreview ? 'Would Update' : 'Updated'}**: 2`)
    }
  })

  it('reads entries with unknown optional task fields', () => {
    addRunHistoryEntry(sessionStorage, buildEntry(OWNER_A, 2))
    const raw = JSON.parse(sessionStorage.getItem(RUN_HISTORY_STORAGE_KEY) ?? '{}')
    raw.entries[0].tasks[0].futureEvidence = { anything: true }
    raw.entries[0].tasks[0].createdObject = { id: 'object-1', policyType: 'SettingsCatalog', futureField: 1 }
    sessionStorage.setItem(RUN_HISTORY_STORAGE_KEY, JSON.stringify(raw))
    const [stored] = readRunHistory(sessionStorage, OWNER_A)
    expect(stored.tasks[0]).not.toHaveProperty('futureEvidence')
    expect(stored.tasks[0].createdObject).toEqual({ id: 'object-1', policyType: 'SettingsCatalog' })
  })

  it('shows only the active account and tenant, and removes other owners', () => {
    addRunHistoryEntry(sessionStorage, buildEntry(OWNER_A, 2, minutes(1)))
    expect(readRunHistory(sessionStorage, OWNER_B)).toEqual([])
    // Same account in another tenant (guest profile) is a different owner.
    expect(readRunHistory(sessionStorage, { ...OWNER_A, tenantId: OWNER_B.tenantId })).toEqual([])
    expect(readRunHistory(sessionStorage, OWNER_A)).toEqual([])

    addRunHistoryEntry(sessionStorage, buildEntry(OWNER_A, 2, minutes(2)))
    addRunHistoryEntry(sessionStorage, buildEntry(OWNER_B, 2, minutes(3)))
    expect(readRunHistory(sessionStorage, OWNER_B)).toHaveLength(1)
    expect(sessionStorage.getItem(RUN_HISTORY_STORAGE_KEY)).not.toContain(OWNER_A.tenantId)
  })

  it('keeps the newest runs within the count cap', () => {
    for (let index = 0; index < MAX_RUN_HISTORY_ENTRIES + 3; index += 1) {
      addRunHistoryEntry(sessionStorage, buildEntry(OWNER_A, 1, minutes(index)))
    }
    const entries = readRunHistory(sessionStorage, OWNER_A)
    expect(entries).toHaveLength(MAX_RUN_HISTORY_ENTRIES)
    expect(entries[0].endTime).toEqual(minutes(MAX_RUN_HISTORY_ENTRIES + 2))
    expect(entries.at(-1)?.endTime).toEqual(minutes(3))
  })

  it('fits a realistic 990-task run and drops the oldest runs at the size cap', () => {
    const large = buildEntry(OWNER_A, 990, minutes(0))
    const size = JSON.stringify(large).length
    // Measured: about 515,000 characters (520 per task) for 990 tasks with full evidence and created-object IDs, so 3 such runs fit.
    expect(size).toBeLessThan(MAX_RUN_HISTORY_CHARS / 2)

    for (let index = 0; index < 4; index += 1) {
      const result = addRunHistoryEntry(sessionStorage, buildEntry(OWNER_A, 990, minutes(index)))
      expect(result.ok).toBe(true)
    }
    const entries = readRunHistory(sessionStorage, OWNER_A)
    expect(entries.length).toBeGreaterThan(0)
    expect(entries).toHaveLength(3)
    expect(entries[0].endTime).toEqual(minutes(3))
    expect((sessionStorage.getItem(RUN_HISTORY_STORAGE_KEY) ?? '').length).toBeLessThanOrEqual(MAX_RUN_HISTORY_CHARS)
  })

  it('does not store a run larger than the size cap and keeps older runs', () => {
    addRunHistoryEntry(sessionStorage, buildEntry(OWNER_A, 2, minutes(0)))
    const huge = buildEntry(OWNER_A, 2, minutes(1))
    huge.tasks[0] = { ...huge.tasks[0], error: 'x'.repeat(MAX_RUN_HISTORY_CHARS) }
    expect(addRunHistoryEntry(sessionStorage, huge)).toEqual({ ok: false, reason: 'tooLarge' })
    expect(readRunHistory(sessionStorage, OWNER_A)).toHaveLength(1)
  })

  it('drops the oldest runs when the browser storage is full', () => {
    const quota = 200_000
    const backing = new Map<string, string>()
    const limited: Storage = {
      get length() { return backing.size },
      clear: () => backing.clear(),
      key: (index) => [...backing.keys()][index] ?? null,
      getItem: (key) => backing.get(key) ?? null,
      removeItem: (key) => { backing.delete(key) },
      setItem: (key, value) => {
        if (value.length > quota) throw new DOMException('full', 'QuotaExceededError')
        backing.set(key, value)
      },
    }
    for (let index = 0; index < 5; index += 1) {
      expect(addRunHistoryEntry(limited, buildEntry(OWNER_A, 100, minutes(index))).ok).toBe(true)
    }
    const entries = readRunHistory(limited, OWNER_A)
    expect(entries.length).toBeLessThan(5)
    expect(entries[0].endTime).toEqual(minutes(4))
  })

  it('handles blocked storage and damaged data', () => {
    expect(addRunHistoryEntry(null, buildEntry())).toEqual({ ok: false, reason: 'unavailable' })
    expect(readRunHistory(null, OWNER_A)).toEqual([])
    sessionStorage.setItem(RUN_HISTORY_STORAGE_KEY, 'not json')
    expect(readRunHistory(sessionStorage, OWNER_A)).toEqual([])
    sessionStorage.setItem(RUN_HISTORY_STORAGE_KEY, JSON.stringify({ version: 1, entries: [{ id: 'bad' }] }))
    expect(readRunHistory(sessionStorage, OWNER_A)).toEqual([])
  })

  it('deletes one run and clears all runs', () => {
    const first = buildEntry(OWNER_A, 1, minutes(1))
    addRunHistoryEntry(sessionStorage, first)
    addRunHistoryEntry(sessionStorage, buildEntry(OWNER_A, 1, minutes(2)))
    deleteRunHistoryEntry(sessionStorage, OWNER_A, first.id)
    expect(readRunHistory(sessionStorage, OWNER_A).map((entry) => entry.id)).not.toContain(first.id)

    clearRunHistory(sessionStorage)
    expect(sessionStorage.getItem(RUN_HISTORY_STORAGE_KEY)).toBeNull()
  })

  it('keeps the mark of a run not stored yet on "Clear all", and removes it on sign-out', () => {
    addRunHistoryEntry(sessionStorage, buildEntry(OWNER_A, 1, minutes(1)))
    markPendingRunHistoryId(sessionStorage, 'refused-run')

    clearRunHistoryEntries(sessionStorage)
    expect(readRunHistory(sessionStorage, OWNER_A)).toEqual([])
    expect(readPendingRunHistoryId(sessionStorage)).toBe('refused-run')

    clearRunHistory(sessionStorage)
    expect(readPendingRunHistoryId(sessionStorage)).toBeNull()
  })
})
