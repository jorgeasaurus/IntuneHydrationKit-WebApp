import React, { ReactElement } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  })

interface WrapperProps {
  children: React.ReactNode
}

function AllProviders({ children }: WrapperProps) {
  const queryClient = createTestQueryClient()
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}

function customRender(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { wrapper: AllProviders, ...options })
}

// Re-export everything from testing-library
export * from '@testing-library/react'
export { customRender as render }

// Utility to wait for async operations
export const waitForAsync = () => new Promise((resolve) => setTimeout(resolve, 0))

// Utility to create a mock function that resolves after a delay
export const createDelayedMock = <T,>(value: T, delay = 100) => {
  return vi.fn().mockImplementation(() =>
    new Promise((resolve) => setTimeout(() => resolve(value), delay))
  )
}

// Utility to create a mock function that rejects after a delay
export const createDelayedRejectMock = (error: Error, delay = 100) => {
  return vi.fn().mockImplementation(() =>
    new Promise((_, reject) => setTimeout(() => reject(error), delay))
  )
}
