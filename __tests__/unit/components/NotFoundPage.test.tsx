import React from 'react'
import { describe, expect, it, vi } from 'vitest'

import { render, screen } from '@testing-library/react'
import NotFound, { metadata } from '@/app/not-found'

vi.mock('@/components/Navigation', () => ({
  Navigation: () => <nav data-testid="navigation" />,
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

describe('NotFound page', () => {
  it('shows a branded page with links home and to the template catalog', () => {
    render(<NotFound />)

    expect(screen.getByTestId('navigation')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Browse templates' })).toHaveAttribute(
      'href',
      '/templates'
    )
    expect(metadata.title).toBe('Page not found')
  })
})
