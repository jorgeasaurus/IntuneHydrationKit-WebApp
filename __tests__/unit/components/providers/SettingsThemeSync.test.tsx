import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, waitFor } from '@/__tests__/setup/test-utils'
import { SettingsThemeSync } from '@/components/providers/SettingsThemeSync'
import type { AppSettings } from '@/types/hydration'

const setTheme = vi.fn()
const settingsState: { theme: AppSettings['theme'] } = {
  theme: 'system',
}

vi.mock('next-themes', () => ({
  useTheme: () => ({
    setTheme,
  }),
}))

vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({
    settings: {
      stopOnFirstError: true,
      theme: settingsState.theme,
    },
    updateSettings: vi.fn(),
    resetSettings: vi.fn(),
  }),
}))

describe('SettingsThemeSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    settingsState.theme = 'system'
  })

  it('applies the current settings theme on mount and update', async () => {
    const { rerender } = render(<SettingsThemeSync />)

    await waitFor(() => {
      expect(setTheme).toHaveBeenCalledWith('system')
    })

    settingsState.theme = 'corporate-1999'
    rerender(<SettingsThemeSync />)

    await waitFor(() => {
      expect(setTheme).toHaveBeenLastCalledWith('corporate-1999')
    })
  })
})
