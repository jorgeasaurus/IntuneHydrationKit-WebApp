import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildCreatedObjectLinks,
  clearCreatedObjectsForTests,
  recordCreatedObjects,
  useCreatedObjectLinks,
} from '@/hooks/useCreatedObjectLinks'
import { beginExecution, forceResetExecutionSessionForTests, resetExecutionSession } from '@/lib/hydration/executionStateStore'
import type { ExecutionResult } from '@/lib/hydration/types'
import type { HydrationTask } from '@/types/hydration'

const groupTask: HydrationTask = { id: 'group', category: 'groups', operation: 'create', itemName: 'All Windows Devices', status: 'success' }
const failedTask: HydrationTask = { id: 'failed', category: 'groups', operation: 'create', itemName: 'Failed group', status: 'failed', error: 'Forbidden' }
const skippedTask: HydrationTask = { id: 'skipped', category: 'filters', operation: 'create', itemName: 'Existing filter', status: 'skipped', skipKind: 'noOp' }
const deleteTask: HydrationTask = { id: 'deleted', category: 'groups', operation: 'delete', itemName: 'Deleted group', status: 'success' }

function startRun(): number {
  const runId = beginExecution({
    tenantId: 'tenant', homeAccountId: 'account', operationMode: 'create', isPreview: false, selectedObjectCount: 1,
  })
  if (runId === null) throw new Error('Run did not start')
  return runId
}

const results: ExecutionResult[] = [
  { task: groupTask, success: true, skipped: false, createdId: 'group-id' },
  { task: failedTask, success: false, skipped: false, error: 'Forbidden' },
  { task: skippedTask, success: true, skipped: true, skipKind: 'noOp', createdId: 'not-created' },
  { task: deleteTask, success: true, skipped: false, createdId: 'deleted-id' },
]

describe('useCreatedObjectLinks', () => {
  afterEach(() => {
    clearCreatedObjectsForTests()
    forceResetExecutionSessionForTests()
  })

  it('links only successful create tasks with a created ID', () => {
    const runId = startRun()
    recordCreatedObjects(runId, 'global', results)
    const tasks = [groupTask, failedTask, skippedTask, deleteTask]

    const { result } = renderHook(() => useCreatedObjectLinks(tasks, false))

    expect([...result.current.keys()]).toEqual(['group'])
    expect(result.current.get('group')).toMatchObject({
      href: 'https://entra.microsoft.com/#view/Microsoft_AAD_IAM/GroupDetailsMenuBlade/~/Overview/groupId/group-id',
      accessibleName: 'Open in Entra admin center: All Windows Devices',
    })
  })

  it('gives no links in preview mode', () => {
    const runId = startRun()
    recordCreatedObjects(runId, 'global', results)
    const { result } = renderHook(() => useCreatedObjectLinks([groupTask], true))
    expect(result.current.size).toBe(0)
  })

  it('drops the links when the session resets, as after a page refresh', () => {
    const runId = startRun()
    recordCreatedObjects(runId, 'global', results)
    const { result } = renderHook(() => useCreatedObjectLinks([groupTask], false))
    expect(result.current.size).toBe(1)

    act(() => {
      forceResetExecutionSessionForTests()
      resetExecutionSession()
    })

    expect(result.current.size).toBe(0)
  })

  it('does not link a task that has no recorded ID', () => {
    expect(buildCreatedObjectLinks([groupTask], null, false).size).toBe(0)
  })
})
