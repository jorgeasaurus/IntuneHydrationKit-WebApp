import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen } from '@/__tests__/setup/test-utils'
import { LIGHT_DARK_THEME_CYCLE, ThemeToggle } from '@/components/ThemeToggle'
import type { AppSettings } from '@/types/hydration'

const setTheme = vi.fn()
const updateSettings = vi.fn()

const themeState: {
  theme: AppSettings['theme'] | undefined
  resolvedTheme: string | undefined
} = {
  theme: 'system',
  resolvedTheme: 'light',
}

const settingsState: { theme: AppSettings['theme'] } = {
  theme: 'system',
}

vi.mock('next-themes', () => ({
  useTheme: () => ({
    theme: themeState.theme,
    resolvedTheme: themeState.resolvedTheme,
    setTheme,
  }),
}))

vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({
    settings: {
      stopOnFirstError: true,
      theme: settingsState.theme,
    },
    updateSettings,
    resetSettings: vi.fn(),
  }),
}))

describe('ThemeToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    themeState.theme = 'system'
    themeState.resolvedTheme = 'light'
    settingsState.theme = 'system'
  })

  it('cycles from the resolved light theme to dark', async () => {
    const user = userEvent.setup()

    render(<ThemeToggle />)

    await user.click(await screen.findByRole('button', { name: /cycle theme/i }))

    expect(setTheme).toHaveBeenCalledWith('dark')
    expect(updateSettings).toHaveBeenCalledWith({ theme: 'dark' })
  })

  it('honors a restricted light/dark cycle', async () => {
    const user = userEvent.setup()
    themeState.theme = 'light'
    settingsState.theme = 'light'

    render(<ThemeToggle themes={LIGHT_DARK_THEME_CYCLE} />)

    await user.click(await screen.findByRole('button', { name: /cycle theme/i }))

    expect(setTheme).toHaveBeenCalledWith('dark')
    expect(updateSettings).toHaveBeenCalledWith({ theme: 'dark' })
  })
})
