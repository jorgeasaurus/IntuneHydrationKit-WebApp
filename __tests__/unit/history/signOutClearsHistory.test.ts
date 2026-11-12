import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  msalInstance: {
    getAllAccounts: vi.fn(),
    getActiveAccount: vi.fn(),
    logoutPopup: vi.fn(),
    clearCache: vi.fn(),
  },
}))

vi.mock('@/lib/auth/msalConfig', () => ({
  msalInstance: mocks.msalInstance,
  loginRequest: { scopes: [] },
  getAuthorityUrl: vi.fn(),
  initializeMsal: vi.fn(),
}))

import { signOut, signOutForInactivity } from '@/lib/auth/authUtils'
import { addRunHistoryEntry, markPendingRunHistoryId } from '@/lib/history/runHistory'
import { addProfile, writeProfiles } from '@/lib/profiles/scopeProfiles'
import { RUN_HISTORY_PENDING_STORAGE_KEY, RUN_HISTORY_STORAGE_KEY, SCOPE_PROFILES_STORAGE_KEY } from '@/lib/storageKeys'
import { buildEntry } from '../../helpers/runHistoryFixtures'

const account = { homeAccountId: 'home-a.tenant-a', tenantId: 'aaaaaaaa-0000-0000-0000-000000000001' }

function seed(): void {
  addRunHistoryEntry(sessionStorage, buildEntry())
  markPendingRunHistoryId(sessionStorage, `${account.tenantId}:2026-11-01T10:00:00.000Z`)
  writeProfiles(localStorage, addProfile([], 'Keep me', { targets: ['groups'], items: { groups: ['All Windows Devices'] } }))
}

describe('sign-out and run history', () => {
  const originalLocation = window.location

  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    localStorage.clear()
    mocks.msalInstance.getActiveAccount.mockReturnValue(account)
    mocks.msalInstance.logoutPopup.mockResolvedValue(undefined)
    mocks.msalInstance.clearCache.mockResolvedValue(undefined)
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
  })

  it('clears run history on sign-out and keeps scope profiles', async () => {
    seed()
    expect(sessionStorage.getItem(RUN_HISTORY_STORAGE_KEY)).not.toBeNull()

    await signOut()

    expect(sessionStorage.getItem(RUN_HISTORY_STORAGE_KEY)).toBeNull()
    expect(sessionStorage.getItem(RUN_HISTORY_PENDING_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(SCOPE_PROFILES_STORAGE_KEY)).toContain('Keep me')
  })

  it('clears run history when logout fails', async () => {
    seed()
    mocks.msalInstance.logoutPopup.mockRejectedValue(new Error('popup blocked'))
    await expect(signOut()).rejects.toThrow('popup blocked')
    expect(sessionStorage.getItem(RUN_HISTORY_STORAGE_KEY)).toBeNull()
  })

  it('clears run history on inactivity sign-out', async () => {
    Object.defineProperty(window, 'location', { configurable: true, value: { ...originalLocation, replace: vi.fn() } })
    seed()
    await signOutForInactivity()
    expect(sessionStorage.getItem(RUN_HISTORY_STORAGE_KEY)).toBeNull()
    expect(sessionStorage.getItem(RUN_HISTORY_PENDING_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(SCOPE_PROFILES_STORAGE_KEY)).toContain('Keep me')
  })
})
