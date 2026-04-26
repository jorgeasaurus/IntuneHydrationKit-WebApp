import { describe, expect, it } from 'vitest'

import { render } from '@/__tests__/setup/test-utils'
import { Skeleton, SkeletonCard, SkeletonList } from '@/components/ui/skeleton'

describe('skeleton', () => {
  it('renders the requested skeleton variants and custom classes', () => {
    const { getByTestId } = render(
      <Skeleton data-testid="skeleton" variant="text" className="custom-skeleton" />
    )

    expect(getByTestId('skeleton')).toHaveClass('skeleton', 'h-4', 'rounded', 'custom-skeleton')
  })

  it('renders the card and list helpers with the expected placeholders', () => {
    const { container } = render(
      <>
        <SkeletonCard className="card-shell" />
        <SkeletonList count={2} className="list-shell" />
      </>
    )

    expect(container.querySelector('.card-shell')).toBeTruthy()
    expect(container.querySelector('.list-shell')).toBeTruthy()
    expect(container.querySelectorAll('.skeleton')).toHaveLength(9)
    expect(container.querySelectorAll('.rounded-full')).toHaveLength(2)
  })
})
