import { describe, expect, it } from 'vitest'

import { render, screen, waitFor, within } from '@testing-library/react'
import { ActivityLog } from '@/components/dashboard/ActivityLog'
import type { ActivityMessage } from '@/lib/hydration/types'
import { formatClockTime } from '@/lib/utils/dateFormat'

const messages: ActivityMessage[] = [
  {
    id: 'msg-1',
    type: 'info',
    message: 'Connecting to Microsoft Graph',
    timestamp: new Date('2026-04-26T09:10:11.000Z'),
  },
  {
    id: 'msg-2',
    type: 'progress',
    message: 'Building task queue',
    timestamp: new Date('2026-04-26T09:10:12.000Z'),
  },
  {
    id: 'msg-3',
    type: 'success',
    message: 'Created dynamic group',
    timestamp: new Date('2026-04-26T09:10:13.000Z'),
  },
  {
    id: 'msg-4',
    type: 'warning',
    message: 'Skipped existing policy',
    timestamp: new Date('2026-04-26T09:10:14.000Z'),
  },
  {
    id: 'msg-5',
    type: 'error',
    message: 'Failed to create filter',
    timestamp: new Date('2026-04-26T09:10:15.000Z'),
  },
]

describe('ActivityLog', () => {
  it('renders nothing when there are no messages', () => {
    const { container } = render(<ActivityLog messages={[]} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders messages and scrolls to the latest entry when updates arrive', async () => {
    const { container, rerender } = render(
      <ActivityLog messages={[messages[0]]} className="activity-shell" />
    )

    expect(screen.getByText('Activity Log')).toBeInTheDocument()
    expect(screen.getByText('Connecting to Microsoft Graph')).toBeInTheDocument()
    expect(screen.getByText(`[${formatClockTime(messages[0].timestamp)}]`)).toBeInTheDocument()
    expect(container.querySelector('.activity-shell')).toBeTruthy()

    const scroller = container.querySelector('.overflow-y-auto') as HTMLDivElement
    Object.defineProperty(scroller, 'scrollHeight', {
      configurable: true,
      value: 240,
    })
    scroller.scrollTop = 0

    rerender(<ActivityLog messages={messages} className="activity-shell" />)

    await waitFor(() => {
      expect(scroller.scrollTop).toBe(240)
    })

    expect(screen.getByText('Created dynamic group')).toBeInTheDocument()
  })

  it('uses readable text, timestamps, and status icons on the dark log surface', () => {
    const { container } = render(<ActivityLog messages={messages} />)

    const scroller = container.querySelector('.overflow-y-auto')
    expect(scroller).toHaveClass('bg-slate-950/80')

    const expectedStyles = [
      ['Connecting to Microsoft Graph', 'text-slate-100', 'text-slate-200'],
      ['Building task queue', 'text-sky-200', 'text-sky-200'],
      ['Created dynamic group', 'text-emerald-200', 'text-emerald-200'],
      ['Skipped existing policy', 'text-amber-200', 'text-amber-200'],
      ['Failed to create filter', 'text-red-200', 'text-red-200'],
    ] as const

    expectedStyles.forEach(([message, textClass, iconClass], index) => {
      const messageElement = screen.getByText(message)
      const row = messageElement.parentElement

      if (!row) {
        throw new Error(`Missing activity row for ${message}`)
      }

      expect(row).toHaveClass(textClass)
      expect(row.querySelector('svg')).toHaveClass(iconClass)

      const timestamp = within(row).getByText(
        `[${formatClockTime(messages[index].timestamp)}]`
      )
      expect(timestamp).toHaveClass('text-slate-300')
      expect(timestamp).not.toHaveClass('opacity-60')
    })
  })
})
