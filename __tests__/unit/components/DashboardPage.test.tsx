import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen } from '@testing-library/react'
import DashboardPage from '@/app/dashboard/page'
import { SettingsProvider } from '@/hooks/useSettings'

const push = vi.fn()
const startExecution = vi.fn().mockResolvedValue(undefined)

function renderPage() {
  return render(
    <SettingsProvider>
      <DashboardPage />
    </SettingsProvider>
  )
}

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
        homeAccountId: 'home-tenant-id',
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
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders live delete mode with a filled high-contrast warning banner', () => {
    renderPage()

    const warning = screen.getByRole('alert')

    expect(screen.getByText('Delete Mode Active')).toBeInTheDocument()
    expect(warning).toHaveClass('bg-slate-950/90')
    expect(warning).toHaveClass('text-slate-50')
    expect(warning).not.toHaveClass('text-destructive')
  })

  it('blurs the tenant identity in the live execution header when Demo Mode is on', () => {
    localStorage.setItem(
      'app-settings:v1',
      JSON.stringify({ stopOnFirstError: false, demoMode: true })
    )

    renderPage()

    expect(screen.getByText('Delete Test Tenant')).toHaveClass('demo-sensitive-data')
  })
})
