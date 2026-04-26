import { describe, expect, it } from 'vitest'
import { format } from 'date-fns'

import { render, screen, waitFor } from '@/__tests__/setup/test-utils'
import { ActivityLog } from '@/components/dashboard/ActivityLog'
import type { ActivityMessage } from '@/lib/hydration/types'

const messages: ActivityMessage[] = [
  {
    id: 'msg-1',
    type: 'info',
    message: 'Connecting to Microsoft Graph',
    timestamp: new Date('2026-04-26T09:10:11.000Z'),
  },
  {
    id: 'msg-2',
    type: 'success',
    message: 'Created dynamic group',
    timestamp: new Date('2026-04-26T09:10:12.000Z'),
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
    expect(screen.getByText(`[${format(messages[0].timestamp, 'HH:mm:ss')}]`)).toBeInTheDocument()
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
})
