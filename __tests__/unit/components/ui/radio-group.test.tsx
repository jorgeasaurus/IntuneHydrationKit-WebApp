import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { render, screen } from '@/__tests__/setup/test-utils'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

describe('radio-group', () => {
  it('applies classes and emits value changes', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()

    render(
      <RadioGroup
        defaultValue="global"
        onValueChange={onValueChange}
        className="custom-grid"
        aria-label="Cloud environment"
      >
        <label className="flex items-center gap-2">
          <RadioGroupItem value="global" className="custom-item" />
          <span>Global</span>
        </label>
        <label className="flex items-center gap-2">
          <RadioGroupItem value="usgov" />
          <span>USGov</span>
        </label>
      </RadioGroup>
    )

    const group = screen.getByRole('radiogroup', { name: 'Cloud environment' })
    const radios = screen.getAllByRole('radio')

    expect(group).toHaveClass('grid', 'gap-2', 'custom-grid')
    expect(radios[0]).toHaveAttribute('data-state', 'checked')
    expect(radios[0]).toHaveClass('custom-item')

    await user.click(radios[1])

    expect(onValueChange).toHaveBeenCalledWith('usgov')
    expect(radios[1]).toHaveAttribute('data-state', 'checked')
  })
})
