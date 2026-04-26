import { describe, expect, it, vi } from 'vitest'

import { render, screen } from '@/__tests__/setup/test-utils'
import { ThemeProvider } from '@/components/providers/ThemeProvider'

const { nextThemesProvider } = vi.hoisted(() => ({
  nextThemesProvider: vi.fn(({ children }) => children),
}))

vi.mock('next-themes', () => ({
  ThemeProvider: nextThemesProvider,
}))

describe('ThemeProvider', () => {
  it('passes props through to next-themes and renders children', () => {
    render(
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <span>Theme child</span>
      </ThemeProvider>
    )

    expect(screen.getByText('Theme child')).toBeInTheDocument()
    expect(nextThemesProvider).toHaveBeenCalledTimes(1)

    const [props] = nextThemesProvider.mock.calls[0]

    expect(props).toMatchObject({
      attribute: 'class',
      defaultTheme: 'system',
      enableSystem: true,
    })
  })
})
