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

const { sonnerToaster } = vi.hoisted(() => ({
  sonnerToaster: vi.fn((_props: SonnerMockProps) => <div data-testid="sonner-root" />),
}))

vi.mock('sonner', () => ({
  Toaster: sonnerToaster,
}))

describe('Toaster', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the fixed glass-theme toast palette', () => {
    render(<Toaster richColors />)

    const props = sonnerToaster.mock.calls[0]?.[0]
    if (!props) {
      throw new Error('Expected Sonner Toaster to be rendered')
    }

    expect(props.theme).toBe('dark')
    expect(props.richColors).toBe(true)
    expect(props.className).toBe('toaster group')
    expect(props.toastOptions?.classNames.toast).toContain('group toast')
  })

  it('passes standard props through to Sonner', () => {
    render(<Toaster closeButton />)

    const props = sonnerToaster.mock.calls[0]?.[0]
    if (!props) {
      throw new Error('Expected Sonner Toaster to be rendered')
    }

    expect(props.theme).toBe('dark')
    expect(props.closeButton).toBe(true)
  })
})
