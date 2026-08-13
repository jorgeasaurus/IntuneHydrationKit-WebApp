import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ResultsPage from '@/app/results/page'
import { SettingsProvider } from '@/hooks/useSettings'
import { EXECUTION_RESULT_STORAGE_KEYS } from '@/lib/storageKeys'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/components/auth/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/hooks/useWizardState', () => ({
  useWizardState: () => ({
    state: { selectedTargets: [] },
    resetWizard: vi.fn(),
  }),
}))

describe('ResultsPage', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('blurs the persisted tenant identity when Demo Mode is on', async () => {
    localStorage.setItem(
      'app-settings:v1',
      JSON.stringify({ stopOnFirstError: false, demoMode: true })
    )
    sessionStorage.setItem(
      EXECUTION_RESULT_STORAGE_KEYS.summary,
      JSON.stringify({
        tenantId: 'tenant-123',
        tenantName: 'Contoso Results',
        operationMode: 'create',
        startTime: '2026-04-26T09:00:00.000Z',
        endTime: '2026-04-26T09:00:01.000Z',
        duration: 1000,
        stats: { total: 1, created: 1, deleted: 0, skipped: 0, failed: 0 },
        categoryBreakdown: {
          groups: { total: 1, success: 1, skipped: 0, failed: 0 },
        },
        errors: [],
        warnings: [],
      })
    )
    sessionStorage.setItem(
      EXECUTION_RESULT_STORAGE_KEYS.tasks,
      JSON.stringify([
        {
          id: 'group-1',
          category: 'groups',
          operation: 'create',
          itemName: 'All Windows Devices',
          status: 'success',
        },
      ])
    )
    sessionStorage.setItem(EXECUTION_RESULT_STORAGE_KEYS.isPreview, 'false')

    render(
      <SettingsProvider>
        <ResultsPage />
      </SettingsProvider>
    )

    expect(await screen.findByText('Contoso Results')).toHaveClass('demo-sensitive-data')
  })
})
