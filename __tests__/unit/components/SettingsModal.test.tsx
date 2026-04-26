import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen, waitFor } from '@/__tests__/setup/test-utils'
import { SettingsModal } from '@/components/SettingsModal'
import { SettingsProvider } from '@/hooks/useSettings'

const DEFAULT_SETTINGS = {
  stopOnFirstError: false,
  theme: 'system',
} as const

describe('SettingsModal', () => {
  let storage = new Map<string, string>()

  beforeEach(() => {
    storage = new Map<string, string>()

    Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
      configurable: true,
      value: vi.fn(() => false),
    })
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    })
    Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
      configurable: true,
      value: vi.fn(),
    })
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })

    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
      removeItem: (key: string) => {
        storage.delete(key)
      },
      clear: () => {
        storage.clear()
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('persists updated settings when saved', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()

    render(
      <SettingsProvider>
        <SettingsModal open onOpenChange={onOpenChange} />
      </SettingsProvider>
    )

    await user.click(screen.getByRole('switch', { name: /stop on first error/i }))
    await user.click(screen.getByRole('combobox', { name: /theme/i }))
    await user.click(await screen.findByRole('option', { name: 'Dark' }))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(JSON.parse(window.localStorage.getItem('app-settings') ?? 'null')).toEqual({
      stopOnFirstError: true,
      theme: 'dark',
    })
  })

  it('discards unsaved changes when cancelled', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()

    window.localStorage.setItem('app-settings', JSON.stringify(DEFAULT_SETTINGS))

    render(
      <SettingsProvider>
        <SettingsModal open onOpenChange={onOpenChange} />
      </SettingsProvider>
    )

    await user.click(screen.getByRole('switch', { name: /stop on first error/i }))
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(JSON.parse(window.localStorage.getItem('app-settings') ?? 'null')).toEqual(DEFAULT_SETTINGS)
  })

  it('resets settings back to defaults immediately', async () => {
    const user = userEvent.setup()

    window.localStorage.setItem(
      'app-settings',
      JSON.stringify({
        stopOnFirstError: false,
        theme: 'dark',
      })
    )

    render(
      <SettingsProvider>
        <SettingsModal open onOpenChange={vi.fn()} />
      </SettingsProvider>
    )

    await user.click(screen.getByRole('button', { name: /reset to defaults/i }))

    await waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem('app-settings') ?? 'null')).toEqual(DEFAULT_SETTINGS)
    })
  })
})
