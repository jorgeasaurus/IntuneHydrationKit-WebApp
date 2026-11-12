import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { render, screen } from '@testing-library/react'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

describe('radio-group', () => {
  it('applies classes and emits value changes', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()

    render(
      <RadioGroup
        defaultValue="create"
        onValueChange={onValueChange}
        className="custom-grid"
        aria-label="Operation"
      >
        <label className="flex items-center gap-2">
          <RadioGroupItem value="create" className="custom-item" />
          <span>Create</span>
        </label>
        <label className="flex items-center gap-2">
          <RadioGroupItem value="delete" />
          <span>Delete</span>
        </label>
      </RadioGroup>
    )

    const group = screen.getByRole('radiogroup', { name: 'Operation' })
    const radios = screen.getAllByRole('radio')

    expect(group).toHaveClass('grid', 'gap-2', 'custom-grid')
    expect(radios[0]).toHaveAttribute('data-state', 'checked')
    expect(radios[0]).toHaveClass('custom-item')

    await user.click(radios[1])

    expect(onValueChange).toHaveBeenCalledWith('delete')
    expect(radios[1]).toHaveAttribute('data-state', 'checked')
  })
})
