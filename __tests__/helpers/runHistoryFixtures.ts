import { createSummary } from '@/lib/hydration/reporter'
import { createRunHistoryEntry, type RunHistoryEntry } from '@/lib/history/runHistory'
import type { HydrationTask, TaskCategory } from '@/types/hydration'

export const OWNER_A = { homeAccountId: 'home-a.tenant-a', tenantId: 'aaaaaaaa-0000-0000-0000-000000000001' }
export const OWNER_B = { homeAccountId: 'home-b.tenant-b', tenantId: 'bbbbbbbb-0000-0000-0000-000000000002' }

const CATEGORIES: TaskCategory[] = ['baseline', 'cisBaseline', 'groups', 'filters', 'compliance', 'conditionalAccess']

/**
 * Build tasks with realistic evidence: long template names and paths, timestamps, matches with
 * portal URLs, drift differences, and Graph error messages.
 */
export function buildTasks(count: number, start = new Date('2026-11-01T10:00:00.000Z')): HydrationTask[] {
  return Array.from({ length: count }, (_, index): HydrationTask => {
    const category = CATEGORIES[index % CATEGORIES.length]
    const taskStart = new Date(start.getTime() + index * 2000)
    const base = {
      id: `task-${index}`,
      category,
      operation: 'create' as const,
      itemName: `[IHD] Win - OIB - Settings Catalog - Defender Antivirus Configuration Policy Number ${index} - v3.6`,
      templatePath: `OpenIntuneBaseline/WINDOWS/SettingsCatalog/Win - OIB - SC - Defender Antivirus - D - Configuration ${index}.json`,
      startTime: taskStart,
      endTime: new Date(taskStart.getTime() + 1500),
    }
    if (index % 10 === 0) {
      return {
        ...base,
        status: 'skipped',
        skipKind: 'noOp',
        error: 'An object with this name already exists in the tenant.',
        match: {
          id: '0f9e8d7c-6b5a-4f3e-2d1c-0b9a8f7e6d5c',
          name: base.itemName,
          matchType: 'exact',
          portalUrl: 'https://intune.microsoft.com/#view/Microsoft_Intune_Workflows/PolicySummaryBlade/policyId/0f9e8d7c-6b5a-4f3e-2d1c-0b9a8f7e6d5c',
        },
        drift: {
          status: 'different',
          differences: ['settings[3].value: expected "enabled", found "disabled"', 'description changed'],
        },
      }
    }
    if (index % 25 === 1) {
      return {
        ...base,
        status: 'failed',
        error: 'Graph API error 400 - Bad Request: The setting definition id is not valid for this tenant. Request ID: 3f2a1b0c-9d8e-7f6a-5b4c-3d2e1f0a9b8c',
      }
    }
    return { ...base, status: 'success' }
  })
}

export function buildEntry(
  owner = OWNER_A,
  taskCount = 3,
  endTime = new Date('2026-11-01T11:00:00.000Z'),
  runId = `run-${endTime.getTime()}`,
): RunHistoryEntry {
  const startTime = new Date(endTime.getTime() - 60_000)
  const tasks = buildTasks(taskCount, startTime)
  const summary = {
    ...createSummary(owner.tenantId, 'create', startTime, endTime, tasks, undefined, 'Contoso Ltd'),
    provenance: { runId, appVersion: '2.6.67', baselineVersion: '4.0', baselineSourceSha: 'a'.repeat(40) },
  }
  return createRunHistoryEntry({
    configuration: { ...owner, tenantName: 'Contoso Ltd', operationMode: 'create', isPreview: false, selectedObjectCount: taskCount },
    tasks,
    summary,
    outcome: tasks.some((task) => task.status === 'failed') ? 'completedWithIssues' : 'succeeded',
    fatalError: null,
    startTime,
    endTime,
    pausedMs: 0,
  })
}
