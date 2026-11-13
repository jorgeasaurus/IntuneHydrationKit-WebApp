import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildCompletionNotification,
  useRunCompletionNotification,
} from '@/hooks/useRunCompletionNotification'
import {
  beginExecution,
  finishExecution,
  forceResetExecutionSessionForTests,
  updateExecutionStateForRun,
} from '@/lib/hydration/executionStateStore'
import type { HydrationTask } from '@/types/hydration'

const TENANT_NAME = 'Contoso Secret Tenant'
const TENANT_ID = '11111111-2222-3333-4444-555555555555'

const notifications: Array<{ title: string; options?: NotificationOptions }> = []
const requestPermission = vi.fn(async () => 'granted' as NotificationPermission)
let permission: NotificationPermission = 'granted'
let visibility: DocumentVisibilityState = 'hidden'

class FakeNotification {
  static get permission(): NotificationPermission {
    return permission
  }
  static requestPermission = requestPermission
  constructor(title: string, options?: NotificationOptions) {
    notifications.push({ title, options })
  }
}

const tasks: HydrationTask[] = [
  { id: '1', category: 'groups', operation: 'create', itemName: 'All Windows Devices', status: 'success' },
  { id: '2', category: 'groups', operation: 'create', itemName: 'Existing group', status: 'skipped', skipKind: 'noOp' },
  { id: '3', category: 'filters', operation: 'create', itemName: 'Broken filter', status: 'failed', error: 'Forbidden' },
]

function runToCompletion(isPreview = false): void {
  act(() => {
    const runId = beginExecution({
      tenantId: TENANT_ID, homeAccountId: 'account', tenantName: TENANT_NAME,
      operationMode: 'create', isPreview, selectedObjectCount: 3,
    })
    if (runId === null) throw new Error('Run did not start')
    updateExecutionStateForRun(runId, (state) => ({ ...state, phase: 'running', tasks }))
    finishExecution(runId, { endTime: new Date(), summary: null, outcome: 'completedWithIssues', fatalError: null })
  })
}

describe('useRunCompletionNotification', () => {
  beforeEach(() => {
    notifications.length = 0
    permission = 'granted'
    visibility = 'hidden'
    requestPermission.mockClear()
    vi.stubGlobal('Notification', FakeNotification)
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
  })

  afterEach(() => {
    act(() => forceResetExecutionSessionForTests())
    vi.unstubAllGlobals()
    Reflect.deleteProperty(document, 'visibilityState')
  })

  it('notifies once when the run finishes while the tab is hidden', () => {
    const { rerender } = renderHook(() => useRunCompletionNotification(true))
    runToCompletion()
    rerender()

    expect(notifications).toEqual([
      {
        title: 'Hydration run finished with issues',
        options: { body: 'Created: 1. Skipped: 1. Failed: 1.', tag: 'hydration-run-complete' },
      },
    ])
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('does not include tenant or object names in the notification', () => {
    renderHook(() => useRunCompletionNotification(true))
    runToCompletion()

    const text = JSON.stringify(notifications)
    expect(notifications).toHaveLength(1)
    for (const secret of [TENANT_NAME, TENANT_ID, ...tasks.map((task) => task.itemName)]) {
      expect(text).not.toContain(secret)
    }
  })

  it('does not notify while the tab is visible', () => {
    visibility = 'visible'
    renderHook(() => useRunCompletionNotification(true))
    runToCompletion()
    expect(notifications).toHaveLength(0)
  })

  it.each<NotificationPermission>(['default', 'denied'])('does not notify or ask when permission is %s', (state) => {
    permission = state
    renderHook(() => useRunCompletionNotification(true))
    runToCompletion()
    expect(notifications).toHaveLength(0)
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('does not notify when the setting is off', () => {
    renderHook(() => useRunCompletionNotification(false))
    runToCompletion()
    expect(notifications).toHaveLength(0)
  })

  it('does not notify for a run that was already complete when the page mounted', () => {
    runToCompletion()
    renderHook(() => useRunCompletionNotification(true))
    expect(notifications).toHaveLength(0)
  })

  it('does nothing when the browser has no Notification API', () => {
    vi.unstubAllGlobals()
    Reflect.deleteProperty(window, 'Notification')
    renderHook(() => useRunCompletionNotification(true))
    expect(() => runToCompletion()).not.toThrow()
  })
})

describe('buildCompletionNotification', () => {
  const configuration = {
    tenantId: TENANT_ID, homeAccountId: 'account', tenantName: TENANT_NAME, selectedObjectCount: 3,
  }

  it('uses preview wording for a preview run', () => {
    expect(buildCompletionNotification({
      configuration: { ...configuration, operationMode: 'create', isPreview: true },
      outcome: 'succeeded',
      tasks,
    })).toEqual({ title: 'Hydration preview finished', body: 'Would be created: 1. Skipped: 1. Failed: 1.' })
  })

  it('counts deletes for a delete run', () => {
    const deleteTasks = tasks.map((task) => ({ ...task, operation: 'delete' as const }))
    expect(buildCompletionNotification({
      configuration: { ...configuration, operationMode: 'delete', isPreview: false },
      outcome: 'failed',
      tasks: deleteTasks,
    })).toEqual({ title: 'Hydration run failed', body: 'Deleted: 1. Skipped: 1. Failed: 1.' })
  })

  it('returns null without an outcome', () => {
    expect(buildCompletionNotification({ configuration: null, outcome: null, tasks: [] })).toBeNull()
  })
})
