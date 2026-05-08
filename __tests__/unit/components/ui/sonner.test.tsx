import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render } from '@/__tests__/setup/test-utils'
import { Toaster } from '@/components/ui/sonner'

interface SonnerMockProps {
  theme?: string
  richColors?: boolean
  closeButton?: boolean
  className?: string
  toastOptions?: {
    classNames: {
      toast: string
    }
  }
}

const { useTheme, sonnerToaster } = vi.hoisted(() => ({
  useTheme: vi.fn(),
  sonnerToaster: vi.fn((_props: SonnerMockProps) => <div data-testid="sonner-root" />),
}))

vi.mock('next-themes', () => ({
  useTheme: () => useTheme(),
}))

vi.mock('sonner', () => ({
  Toaster: sonnerToaster,
}))

describe('Toaster', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps the corporate theme back to Sonner light mode', () => {
    useTheme.mockReturnValue({ theme: 'corporate-1999' })

    render(<Toaster richColors />)

    const props = sonnerToaster.mock.calls[0]?.[0]
    if (!props) {
      throw new Error('Expected Sonner Toaster to be rendered')
    }

    expect(props.theme).toBe('light')
    expect(props.richColors).toBe(true)
    expect(props.className).toBe('toaster group')
    expect(props.toastOptions?.classNames.toast).toContain('group toast')
  })

  it('passes through standard themes unchanged', () => {
    useTheme.mockReturnValue({ theme: 'dark' })

    render(<Toaster closeButton />)

    const props = sonnerToaster.mock.calls[0]?.[0]
    if (!props) {
      throw new Error('Expected Sonner Toaster to be rendered')
    }

    expect(props.theme).toBe('dark')
    expect(props.closeButton).toBe(true)
  })
})
