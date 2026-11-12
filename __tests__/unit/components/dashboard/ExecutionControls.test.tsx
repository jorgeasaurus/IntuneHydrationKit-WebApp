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

  it('excludes the recorded engine pause from elapsed time and the estimate', async () => {
    const props = {
      tasks: activeTasks,
      isCancelling: false,
      isCompleted: false,
      outcome: null,
      startTime,
    }
    const { rerender } = render(<ExecutionControls {...props} isPaused={false} />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    // 8s active, 2 of 3 tasks done -> 4s remaining.
    expect(screen.getByText('8s')).toBeInTheDocument()
    expect(screen.getByText('4s')).toBeInTheDocument()

    // The engine starts to wait.
    const pauseStartedAt = new Date(Date.now())
    rerender(<ExecutionControls {...props} isPaused pauseStartedAt={pauseStartedAt} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    })
    expect(screen.getByText('8s')).toBeInTheDocument()

    // The engine wait ends: the store closes the interval into pausedMs.
    rerender(<ExecutionControls {...props} isPaused={false} pausedMs={5 * 60 * 1000} />)
    // Right after resume, before the next tick, the elapsed time must not drop to 0s.
    expect(screen.getByText('8s')).toBeInTheDocument()
    expect(screen.queryByText('0s')).not.toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(screen.getByText('10s')).toBeInTheDocument()
    expect(screen.getByText('5s')).toBeInTheDocument()

    rerender(
      <ExecutionControls
        {...props}
        isPaused={false}
        isCompleted
        outcome="succeeded"
        endTime={new Date(Date.now())}
        pausedMs={5 * 60 * 1000}
      />
    )
    expect(screen.getByText('10s')).toBeInTheDocument()
  })

  it('subtracts nothing when Pause is clicked during the last task and the engine never waits', async () => {
    const props = {
      tasks: activeTasks,
      isCancelling: false,
      outcome: null,
      startTime,
    }
    const { rerender } = render(<ExecutionControls {...props} isPaused={false} isCompleted={false} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(screen.getByText('8s')).toBeInTheDocument()

    // Phase is "paused", but the engine still runs the last task (no pause wait).
    rerender(<ExecutionControls {...props} isPaused isCompleted={false} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30 * 1000)
    })
    expect(screen.getByText('38s')).toBeInTheDocument()

    rerender(
      <ExecutionControls {...props} isPaused={false} isCompleted endTime={new Date(Date.now())} />
    )
    expect(screen.getByText('38s')).toBeInTheDocument()
  })

  it('shows the same active duration after a remount', () => {
    const props = {
      tasks: activeTasks,
      isPaused: false,
      isCancelling: false,
      isCompleted: true,
      outcome: 'succeeded' as const,
      startTime,
      endTime: new Date(startTime.getTime() + 70 * 1000),
      pausedMs: 60 * 1000,
    }
    const { unmount } = render(<ExecutionControls {...props} />)
    expect(screen.getByText('10s')).toBeInTheDocument()
    unmount()

    render(<ExecutionControls {...props} />)
    expect(screen.getByText('10s')).toBeInTheDocument()
    expect(screen.queryByText('1m 10s')).not.toBeInTheDocument()
  })

  it('freezes elapsed time during an open engine pause after a remount', async () => {
    // The pause wait started 60s ago, 7s after the start, before this component mounted.
    render(
      <ExecutionControls
        tasks={activeTasks}
        isPaused
        isCancelling={false}
        isCompleted={false}
        outcome={null}
        startTime={new Date(startTime.getTime() - 60 * 1000)}
        pauseStartedAt={new Date(startTime.getTime() - 53 * 1000)}
      />
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(screen.getByText('7s')).toBeInTheDocument()
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
