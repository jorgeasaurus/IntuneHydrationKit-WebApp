import userEvent from '@testing-library/user-event'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CompletionNotificationToggle } from '@/components/dashboard/CompletionNotificationToggle'
import { SettingsModal } from '@/components/SettingsModal'
import { SettingsProvider } from '@/hooks/useSettings'

let permission: NotificationPermission = 'default'
let nextPermission: NotificationPermission = 'granted'
const requestPermission = vi.fn(async () => {
  permission = nextPermission
  return permission
})

class FakeNotification {
  static get permission(): NotificationPermission {
    return permission
  }
  static requestPermission = requestPermission
}

function storedSettings(): Record<string, unknown> {
  return JSON.parse(localStorage.getItem('app-settings:v1') ?? '{}')
}

function renderToggle() {
  return render(<SettingsProvider><CompletionNotificationToggle /></SettingsProvider>)
}

describe('CompletionNotificationToggle', () => {
  beforeEach(() => {
    localStorage.clear()
    permission = 'default'
    nextPermission = 'granted'
    requestPermission.mockClear()
    vi.stubGlobal('Notification', FakeNotification)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is off by default and does not ask for permission on load', () => {
    renderToggle()
    expect(screen.getByRole('switch', { name: 'Notify me when this finishes' })).not.toBeChecked()
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('asks for permission when turned on and saves the setting when granted', async () => {
    const user = userEvent.setup()
    renderToggle()

    await user.click(screen.getByRole('switch', { name: 'Notify me when this finishes' }))

    expect(requestPermission).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Notify me when this finishes' })).toBeChecked())
    expect(storedSettings()).toMatchObject({ notifyOnCompletion: true })
    expect(screen.getByText(/Completion notification is on/)).toBeInTheDocument()

    await user.click(screen.getByRole('switch', { name: 'Notify me when this finishes' }))
    await waitFor(() => expect(storedSettings()).toMatchObject({ notifyOnCompletion: false }))
  })

  it('stays off and explains why when permission is denied', async () => {
    const user = userEvent.setup()
    nextPermission = 'denied'
    renderToggle()

    await user.click(screen.getByRole('switch', { name: 'Notify me when this finishes' }))

    const toggle = await screen.findByRole('switch', { name: 'Notify me when this finishes' })
    await waitFor(() => expect(toggle).toBeDisabled())
    expect(toggle).not.toBeChecked()
    expect(storedSettings()).toMatchObject({ notifyOnCompletion: false })
    expect(screen.getAllByText(/Notifications are blocked for this site/).length).toBeGreaterThan(0)
  })

  it('is disabled when the browser has no Notification API', () => {
    vi.unstubAllGlobals()
    Reflect.deleteProperty(window, 'Notification')
    renderToggle()
    expect(screen.getByRole('switch', { name: 'Notify me when this finishes' })).toBeDisabled()
    expect(screen.getByText('This browser cannot show notifications.')).toBeInTheDocument()
  })
})

describe('SettingsModal completion notification', () => {
  beforeEach(() => {
    localStorage.clear()
    permission = 'default'
    nextPermission = 'granted'
    requestPermission.mockClear()
    vi.stubGlobal('Notification', FakeNotification)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('asks for permission from the switch and saves the setting with the dialog', async () => {
    const user = userEvent.setup()
    render(<SettingsProvider><SettingsModal open onOpenChange={vi.fn()} /></SettingsProvider>)
    expect(requestPermission).not.toHaveBeenCalled()

    await user.click(screen.getByRole('switch', { name: 'Notify When a Run Finishes' }))
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Notify When a Run Finishes' })).toBeChecked())
    expect(requestPermission).toHaveBeenCalledTimes(1)
    expect(storedSettings()).toMatchObject({ notifyOnCompletion: false })

    await user.click(screen.getByRole('button', { name: /save changes/i }))
    expect(storedSettings()).toMatchObject({ notifyOnCompletion: true })
  })
})
