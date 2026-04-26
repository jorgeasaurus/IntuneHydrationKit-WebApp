import { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import userEvent from '@testing-library/user-event'

import { render, waitFor, screen } from '@/__tests__/setup/test-utils'
import { SettingsThemeSync } from '@/components/providers/SettingsThemeSync'
import { SettingsProvider, useSettings } from '@/hooks/useSettings'

const setTheme = vi.fn()
let store: Record<string, string> = {}

vi.mock('next-themes', () => ({
  useTheme: () => ({
    setTheme,
  }),
}))

function Wrapper({ children }: { children: ReactNode }) {
  return <SettingsProvider>{children}</SettingsProvider>
}

function ThemeUpdater() {
  const { updateSettings } = useSettings()

  return (
    <button onClick={() => updateSettings({ theme: 'corporate-1999' })}>
      Set corporate theme
    </button>
  )
}

describe('SettingsThemeSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    store = {}

    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn((key: string) => store[key] ?? null),
        setItem: vi.fn((key: string, value: string) => {
          store[key] = value
        }),
        removeItem: vi.fn((key: string) => {
          delete store[key]
        }),
        clear: vi.fn(() => {
          store = {}
        }),
      },
      configurable: true,
    })
  })

  it('applies the current settings theme on mount and update', async () => {
    const user = userEvent.setup()

    render(
      <Wrapper>
        <SettingsThemeSync />
        <ThemeUpdater />
      </Wrapper>
    )

    await waitFor(() => {
      expect(setTheme).toHaveBeenCalledWith('system')
    })

    await user.click(screen.getByRole('button', { name: /set corporate theme/i }))

    await waitFor(() => {
      expect(setTheme).toHaveBeenLastCalledWith('corporate-1999')
    })
  })

  it('applies the persisted theme first instead of flashing the default theme', async () => {
    window.localStorage.setItem(
      'app-settings',
      JSON.stringify({
        stopOnFirstError: false,
        theme: 'dark',
      })
    )

    render(
      <Wrapper>
        <SettingsThemeSync />
      </Wrapper>
    )

    await waitFor(() => {
      expect(setTheme).toHaveBeenCalledTimes(1)
      expect(setTheme).toHaveBeenCalledWith('dark')
    })
  })
})
