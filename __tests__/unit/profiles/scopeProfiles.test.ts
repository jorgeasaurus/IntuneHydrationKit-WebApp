import { beforeEach, describe, expect, it } from 'vitest'
import { SCOPE_PROFILES_STORAGE_KEY } from '@/lib/storageKeys'
import {
  addProfile,
  deleteProfile,
  MAX_IMPORT_FILE_BYTES,
  mergeImportedProfiles,
  parseProfilesExport,
  ProfileError,
  readProfiles,
  renameProfile,
  resolveSelection,
  serializeProfilesExport,
  validateProfileFile,
  writeProfiles,
  type ScopeSelection,
} from '@/lib/profiles/scopeProfiles'

const selection: ScopeSelection = {
  targets: ['baseline', 'compliance', 'groups'],
  items: {
    baseline: ['windows/b.json', 'windows/a.json', 'windows/a.json'],
    compliance: ['Windows Compliance'],
    groups: ['All Windows Devices', 'All macOS Devices'],
    conditionalAccess: ['Not selected category'],
  },
}

const NOW = new Date('2026-11-01T10:00:00.000Z')

function storageThatThrows(name: string): Storage {
  return {
    length: 0,
    clear: () => undefined,
    key: () => null,
    getItem: () => null,
    removeItem: () => undefined,
    setItem: () => {
      throw new DOMException('blocked', name)
    },
  }
}

describe('scope profiles', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('saves a normalized selection and reads it back', () => {
    const profiles = addProfile([], '  Windows baseline + compliance, no CA ', selection, NOW)
    expect(writeProfiles(localStorage, profiles)).toEqual({ ok: true })

    const [profile] = readProfiles(localStorage)
    expect(profile.name).toBe('Windows baseline + compliance, no CA')
    expect(profile.createdAt).toBe(NOW.toISOString())
    expect(profile.selection).toEqual({
      targets: ['baseline', 'compliance', 'groups'],
      items: {
        baseline: ['windows/a.json', 'windows/b.json'],
        compliance: ['Windows Compliance'],
        groups: ['All macOS Devices', 'All Windows Devices'],
      },
    })
  })

  it('stores only the selection and no tenant or account data', () => {
    const tainted = {
      ...selection,
      tenantId: '11111111-1111-1111-1111-111111111111',
      homeAccountId: 'account-1',
    } as ScopeSelection
    writeProfiles(localStorage, addProfile([], 'Tenant free', tainted, NOW))

    const raw = localStorage.getItem(SCOPE_PROFILES_STORAGE_KEY) ?? ''
    expect(raw).not.toContain('11111111-1111-1111-1111-111111111111')
    expect(raw).not.toContain('account-1')
    const stored = JSON.parse(raw)
    expect(Object.keys(stored)).toEqual(['version', 'profiles'])
    expect(Object.keys(stored.profiles[0]).sort()).toEqual(['createdAt', 'id', 'name', 'selection', 'updatedAt'])
    expect(Object.keys(stored.profiles[0].selection).sort()).toEqual(['items', 'targets'])
  })

  it('rejects empty, duplicate, and too long names, and empty selections', () => {
    const profiles = addProfile([], 'Baseline', selection, NOW)
    expect(() => addProfile(profiles, '   ', selection)).toThrow(ProfileError)
    expect(() => addProfile(profiles, 'baseline', selection)).toThrow(/exists/)
    expect(() => addProfile(profiles, 'x'.repeat(81), selection)).toThrow(/80 characters/)
    expect(() => addProfile([], 'Empty', { targets: [], items: {} })).toThrow(/at least one category/)
  })

  it('renames and deletes profiles', () => {
    const profiles = addProfile(addProfile([], 'One', selection, NOW), 'Two', selection, NOW)
    const renamed = renameProfile(profiles, profiles[0].id, 'Renamed', new Date('2026-11-02T00:00:00.000Z'))
    expect(renamed[0].name).toBe('Renamed')
    expect(renamed[0].updatedAt).toBe('2026-11-02T00:00:00.000Z')
    expect(renamed[0].createdAt).toBe(NOW.toISOString())
    expect(() => renameProfile(renamed, renamed[0].id, 'two')).toThrow(/exists/)
    expect(renameProfile(renamed, renamed[0].id, 'renamed')[0].name).toBe('renamed')

    expect(deleteProfile(renamed, renamed[0].id).map((profile) => profile.name)).toEqual(['Two'])
  })

  it('exports and imports profiles with new IDs and unique names', () => {
    const profiles = addProfile([], 'Baseline', selection, NOW)
    const text = serializeProfilesExport(profiles, NOW)
    const imported = parseProfilesExport(text)
    expect(imported).toHaveLength(1)

    const merged = mergeImportedProfiles(profiles, imported, NOW)
    expect(merged.added).toBe(1)
    expect(merged.profiles.map((profile) => profile.name)).toEqual(['Baseline', 'Baseline (2)'])
    expect(merged.profiles[1].id).not.toBe(profiles[0].id)
    expect(merged.profiles[1].selection).toEqual(profiles[0].selection)
  })

  it('rejects bad import files with a clear message', () => {
    expect(() => parseProfilesExport('{not json')).toThrow('The file is not valid JSON.')
    expect(() => parseProfilesExport(JSON.stringify({ hello: 'world' }))).toThrow(/not a scope profile export/)

    const valid = JSON.parse(serializeProfilesExport(addProfile([], 'Baseline', selection, NOW), NOW))
    valid.profiles[0].tenantId = '11111111-1111-1111-1111-111111111111'
    expect(() => parseProfilesExport(JSON.stringify(valid))).toThrow(/unknown fields/)

    const wrongVersion = JSON.parse(serializeProfilesExport(addProfile([], 'Baseline', selection, NOW), NOW))
    wrongVersion.version = 2
    expect(() => parseProfilesExport(JSON.stringify(wrongVersion))).toThrow(ProfileError)

    expect(() => parseProfilesExport(' '.repeat(MAX_IMPORT_FILE_BYTES + 1))).toThrow(/too large/)
    expect(() => validateProfileFile({ name: 'profiles.json', size: MAX_IMPORT_FILE_BYTES + 1 })).toThrow(/too large/)
    expect(() => validateProfileFile({ name: 'profiles.txt', size: 10 })).toThrow(/JSON profile file/)
    expect(() => validateProfileFile({ name: 'profiles.JSON', size: 10 })).not.toThrow()
  })

  it('ignores a damaged store', () => {
    localStorage.setItem(SCOPE_PROFILES_STORAGE_KEY, '{"version":1,"profiles":[{"id":1}]}')
    expect(readProfiles(localStorage)).toEqual([])
    localStorage.setItem(SCOPE_PROFILES_STORAGE_KEY, 'not json')
    expect(readProfiles(localStorage)).toEqual([])
  })

  it('reports blocked and full storage without throwing', () => {
    const profiles = addProfile([], 'Baseline', selection, NOW)
    expect(writeProfiles(null, profiles)).toEqual({ ok: false, reason: 'unavailable' })
    expect(readProfiles(null)).toEqual([])
    expect(writeProfiles(storageThatThrows('QuotaExceededError'), profiles)).toEqual({ ok: false, reason: 'full' })
    expect(writeProfiles(storageThatThrows('SecurityError'), profiles)).toEqual({ ok: false, reason: 'unavailable' })
  })

  it('keeps items that exist and reports each dropped item and category', () => {
    const result = resolveSelection(
      {
        targets: ['groups', 'filters', 'retiredCategory'],
        items: {
          groups: ['All Windows Devices', 'Removed Group'],
          filters: ['Removed Filter'],
          retiredCategory: ['Anything'],
        },
      },
      {
        groups: new Set(['All Windows Devices']),
        filters: new Set(['Windows Filter']),
      },
    )

    expect(result.selection).toEqual({ targets: ['groups'], items: { groups: ['All Windows Devices'] } })
    expect(result.dropped).toEqual([
      { category: 'groups', item: 'Removed Group' },
      { category: 'filters', item: 'Removed Filter' },
      { category: 'filters', item: null },
      { category: 'retiredCategory', item: null },
    ])
  })
})
