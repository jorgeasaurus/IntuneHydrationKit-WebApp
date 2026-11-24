import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AuroraBackdrop } from '@/components/AuroraBackdrop'

describe('AuroraBackdrop', () => {
  it('renders a hidden decorative backdrop', () => {
    const { container } = render(<AuroraBackdrop />)
    const root = container.firstElementChild

    expect(root).toHaveClass('aurora-backdrop')
    expect(root).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders the blob, caustics, waves, and grain layers', () => {
    const { container } = render(<AuroraBackdrop />)

    expect(container.querySelectorAll('.aurora-backdrop__blob')).toHaveLength(4)
    expect(container.querySelector('.aurora-backdrop__caustics')).not.toBeNull()
    expect(container.querySelector('.aurora-backdrop__waves')).not.toBeNull()
    expect(container.querySelector('.aurora-backdrop__grain')).not.toBeNull()
  })

  it('does not render a canvas or focusable elements', () => {
    const { container } = render(<AuroraBackdrop />)

    expect(container.querySelector('canvas')).toBeNull()
    expect(container.querySelector('[tabindex], a, button, input, select, textarea')).toBeNull()
  })
})
