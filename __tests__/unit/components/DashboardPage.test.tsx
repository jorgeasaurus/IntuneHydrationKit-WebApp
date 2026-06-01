import { describe, expect, it, vi } from 'vitest'

import { render, screen } from '@/__tests__/setup/test-utils'
import DashboardPage from '@/app/dashboard/page'

const push = vi.fn()
const startExecution = vi.fn().mockResolvedValue(undefined)

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img {...props} alt={props.alt ?? ''} />
  ),
}))

vi.mock('@/components/auth/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/hooks/useWizardState', () => ({
  useWizardState: () => ({
    state: {
      confirmed: true,
      operationMode: 'delete',
      isPreview: false,
      selectedTargets: ['groups'],
      selectedCISCategories: [],
      tenantConfig: {
        tenantId: 'tenant-id',
        tenantName: 'Delete Test Tenant',
      },
    },
  }),
}))

vi.mock('@/hooks/useHydrationExecution', () => ({
  useHydrationExecution: () => ({
    tasks: [],
    isRunning: false,
    isPaused: false,
    isCompleted: false,
    isBuildingQueue: false,
    startTime: null,
    endTime: null,
    summary: null,
    batchProgress: null,
    activityLog: [],
    startExecution,
    pause: vi.fn(),
    resume: vi.fn(),
    cancel: vi.fn(),
  }),
}))

describe('DashboardPage', () => {
  it('renders live delete mode with a filled high-contrast warning banner', () => {
    render(<DashboardPage />)

    const warning = screen.getByRole('alert')

    expect(screen.getByText('Delete Mode Active')).toBeInTheDocument()
    expect(warning).toHaveClass('bg-slate-950/90')
    expect(warning).toHaveClass('text-slate-50')
    expect(warning).not.toHaveClass('text-destructive')
  })
})
