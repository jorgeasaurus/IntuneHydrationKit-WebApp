import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Alert, AlertTitle } from '@/components/ui/alert'

describe('Alert', () => {
  it('renders as a non-live note by default', () => {
    render(
      <Alert>
        <AlertTitle>Preview Mode</AlertTitle>
      </Alert>,
    )

    expect(screen.getByRole('note')).toHaveTextContent('Preview Mode')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('lets callers opt into an assertive alert', () => {
    render(
      <Alert role="alert">
        <AlertTitle>Run failed</AlertTitle>
      </Alert>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Run failed')
  })
})
