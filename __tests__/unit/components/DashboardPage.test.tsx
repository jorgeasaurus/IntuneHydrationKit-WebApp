import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen } from '@testing-library/react'
import DashboardPage from '@/app/dashboard/page'
import { SettingsProvider } from '@/hooks/useSettings'

const push = vi.fn()
const startExecution = vi.fn().mockResolvedValue(undefined)
const useWizardStateMock = vi.fn()

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
  useWizardState: () => useWizardStateMock(),
}))

function createWizardState(isPreview = false) {
  return {
    state: {
      confirmed: true,
      operationMode: 'delete',
      isPreview,
      selectedTargets: ['groups'],
      selectedCISCategories: [],
      tenantConfig: {
        tenantId: 'tenant-id',
        homeAccountId: 'home-tenant-id',
        tenantName: 'Delete Test Tenant',
      },
    },
  }
}

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
    useWizardStateMock.mockReturnValue(createWizardState())
  })

  it('renders the preview notice as a high-contrast glass surface', () => {
    useWizardStateMock.mockReturnValue(createWizardState(true))

    renderPage()

    const previewTitle = screen.getByText('Preview Mode')
    const previewNotice = previewTitle.closest('[role="alert"]')

    expect(previewNotice).toHaveClass('glass-panel', 'rounded-2xl', 'text-slate-50')
    expect(previewNotice).not.toHaveClass('bg-blue-500/10')
    expect(previewTitle).toHaveClass('text-white')
    expect(screen.getByText(/No changes will be made/)).toHaveClass('text-slate-200')
  })

  it('renders live delete mode with a filled high-contrast warning banner', () => {
    renderPage()

    const warning = screen.getByRole('alert')

    expect(screen.getByText('Delete Mode Active')).toBeInTheDocument()
    expect(warning).toHaveClass('bg-slate-950/90')
    expect(warning).toHaveClass('text-slate-50')
    expect(warning).not.toHaveClass('text-destructive')
  })

  it('blurs the tenant identity in the execution header when Demo Mode is on', () => {
    localStorage.setItem(
      'app-settings:v1',
      JSON.stringify({ stopOnFirstError: false, demoMode: true })
    )

    renderPage()

    expect(screen.getByText('Delete Test Tenant')).toHaveClass('demo-sensitive-data')
  })
})
