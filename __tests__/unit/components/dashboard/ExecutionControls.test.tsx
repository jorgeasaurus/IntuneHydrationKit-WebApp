import { act, fireEvent, render, screen } from '@testing-library/react'
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
    status: 'success'
  },
  {
    id: 'task-2',
    category: 'filters',
    operation: 'create',
    itemName: 'Corporate Devices',
    status: 'failed'
  },
  {
    id: 'task-3',
    category: 'compliance',
    operation: 'create',
    itemName: 'Windows 11 Security Baseline',
    status: 'pending'
  }
]

const batchProgress: BatchProgress = {
  isActive: true,
  currentBatch: 2,
  totalBatches: 4,
  itemsInBatch: 5,
  apiVersion: 'beta'
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
        isCancelling={false}
        isCompleted={false}
        outcome={null}
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
    const batchStatus = screen.getByRole('region', {
      name: 'Batch processing status'
    })
    expect(batchStatus).toHaveClass('bg-slate-950/65', 'backdrop-blur-md')
    expect(batchStatus).not.toHaveClass('bg-blue-50')
    expect(screen.getByText('Batch processing')).toHaveClass('text-white')
    expect(screen.getByText('Active')).toHaveClass('text-emerald-100')
    expect(screen.getByText('2 / 4')).toBeInTheDocument()
    expect(screen.getByText('5 per batch')).toBeInTheDocument()
    expect(screen.getByText('beta')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Batch progress' })).toHaveAttribute('value', '2')
    expect(screen.getByRole('progressbar', { name: 'Batch progress' })).toHaveAttribute('max', '4')
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
        isCancelling={false}
        isCompleted={false}
        outcome={null}
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
        isCancelling={false}
        isCompleted
        outcome="succeeded"
        startTime={startTime}
        endTime={new Date(startTime.getTime() + 5000)}
        onDownloadLog={onDownloadLog}
      />
    )

    expect(screen.getByText('Execution completed')).toBeInTheDocument()
    expect(screen.getByText('5s')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Download Execution Log' }))

    expect(onDownloadLog).toHaveBeenCalledTimes(1)
  })

  it('shows cancellation pending without action controls', () => {
    render(
      <ExecutionControls
        tasks={activeTasks}
        isPaused={false}
        isCancelling
        isCompleted={false}
        outcome={null}
        startTime={startTime}
      />
    )

    expect(screen.getByText('Cancellation pending')).toBeInTheDocument()
    expect(screen.getByText(/Waiting for the active request/)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('No new work will start')
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Resume' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Download Execution Log' })).not.toBeInTheDocument()
  })

  it('preserves cancelled terminal wording', () => {
    render(
      <ExecutionControls
        tasks={activeTasks}
        isPaused={false}
        isCancelling={false}
        isCompleted
        outcome="cancelled"
        startTime={startTime}
        endTime={new Date(startTime.getTime() + 3000)}
      />
    )

    expect(screen.getByText('Execution cancelled')).toBeInTheDocument()
    expect(screen.getByText('3s')).toBeInTheDocument()
  })
})
