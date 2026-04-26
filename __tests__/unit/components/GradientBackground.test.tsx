import { describe, expect, it } from 'vitest'

import { render } from '@/__tests__/setup/test-utils'
import { GradientBackground } from '@/components/GradientBackground'

describe('GradientBackground', () => {
  it('renders the decorative gradient layers as hidden content', () => {
    const { container } = render(<GradientBackground />)

    const root = container.firstElementChild as HTMLElement

    expect(root).toHaveAttribute('aria-hidden', 'true')
    expect(root).toHaveClass('gradient-bg')
    expect(container.querySelectorAll('.gradient-orb')).toHaveLength(3)
    expect(container.querySelector('.gradient-mesh')).toBeTruthy()
    expect(container.querySelector('.noise-overlay')).toBeTruthy()
  })
})
