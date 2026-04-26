import { act, fireEvent, render, screen } from '@/__tests__/setup/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExecutionControls } from '@/components/dashboard/ExecutionControls'
import type { BatchProgress, HydrationTask } from '@/types/hydration'

const startTime = new Date('2026-04-26T09:00:00.000Z')

const activeTasks: HydrationTask[] = [
  {
    id: 'task-1',
    category: 'groups',
    operation: 'create',
    itemName: 'All Windows Devices',
    status: 'success',
  },
  {
    id: 'task-2',
    category: 'filters',
    operation: 'create',
    itemName: 'Corporate Devices',
    status: 'failed',
  },
  {
    id: 'task-3',
    category: 'compliance',
    operation: 'create',
    itemName: 'Windows 11 Security Baseline',
    status: 'pending',
  },
]

const batchProgress: BatchProgress = {
  isActive: true,
  currentBatch: 2,
  totalBatches: 4,
  itemsInBatch: 5,
  apiVersion: 'beta',
}

describe('ExecutionControls', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-26T09:00:07.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows live execution progress, timing estimates, and batch status', async () => {
    const onPause = vi.fn()
    const onCancel = vi.fn()

    render(
      <ExecutionControls
        tasks={activeTasks}
        isPaused={false}
        isCompleted={false}
        startTime={startTime}
        batchProgress={batchProgress}
        onPause={onPause}
        onCancel={onCancel}
      />
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(screen.getByText('Execution in progress')).toBeInTheDocument()
    expect(screen.getByText('Batch Processing Active')).toBeInTheDocument()
    expect(screen.getByText(/Batch 2 of 4/i)).toBeInTheDocument()
    expect(screen.getByText(/5 items\/batch \(beta\)/i)).toBeInTheDocument()
    expect(screen.getByText('8s')).toBeInTheDocument()
    expect(screen.getByText('4s')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onPause).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('shows resume controls when execution is paused', () => {
    const onResume = vi.fn()

    render(
      <ExecutionControls
        tasks={activeTasks}
        isPaused
        isCompleted={false}
        startTime={startTime}
        onResume={onResume}
      />
    )

    expect(screen.getByText('Execution paused')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))

    expect(onResume).toHaveBeenCalledTimes(1)
  })

  it('offers log download controls after completion', () => {
    const onDownloadLog = vi.fn()

    render(
      <ExecutionControls
        tasks={activeTasks}
        isPaused={false}
        isCompleted
        startTime={startTime}
        onDownloadLog={onDownloadLog}
      />
    )

    expect(screen.getByText('Execution completed')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Download Execution Log' }))

    expect(onDownloadLog).toHaveBeenCalledTimes(1)
  })
})
