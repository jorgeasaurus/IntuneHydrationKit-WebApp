import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen } from '@testing-library/react'
import Home from '@/app/page'
import {
  beginExecution,
  finishExecution,
  forceResetExecutionSessionForTests,
  getExecutionState
} from '@/lib/hydration/executionStateStore'
import { EXECUTION_RECORD_STORAGE_KEY } from '@/lib/storageKeys'

const push = vi.fn()
const resetWizard = vi.fn()

vi.mock('@azure/msal-react', () => ({
  useIsAuthenticated: () => true
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push })
}))

vi.mock('@/hooks/useWizardState', () => ({
  useWizardState: () => ({ resetWizard })
}))

vi.mock('@/lib/auth/authUtils', () => ({
  signIn: vi.fn()
}))

vi.mock('@/components/landing/HomeLanding', () => ({
  HomeLanding: ({ onContinue }: { onContinue: () => void }) => (
    <button type="button" onClick={onContinue}>Continue</button>
  )
}))

describe('Home page hydration launch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    forceResetExecutionSessionForTests()
  })

  it('clears a completed run before it opens a new wizard', async () => {
    const user = userEvent.setup()
    const runId = beginExecution({
      tenantId: 'tenant-1',
      homeAccountId: 'account-1',
      operationMode: 'create',
      isPreview: false,
      selectedObjectCount: 1
    })
    if (runId === null) throw new Error('Expected a test run ID')
    finishExecution(runId, {
      endTime: new Date('2026-08-17T04:00:00.000Z'),
      summary: null,
      outcome: 'failed',
      fatalError: 'Test completion'
    })
    sessionStorage.setItem(EXECUTION_RECORD_STORAGE_KEY, '{"outcome":"failed"}')

    render(<Home />)
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(sessionStorage.getItem(EXECUTION_RECORD_STORAGE_KEY)).toBeNull()
    expect(getExecutionState().phase).toBe('idle')
    expect(resetWizard).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith('/wizard')
  })
})
