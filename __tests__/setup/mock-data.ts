import type { HydrationTask, HydrationSummary, TenantConfig } from '@/types/hydration'

// Organization mock
export const mockOrganization = {
  id: '00000000-0000-0000-0000-000000000001',
  displayName: 'Contoso',
  verifiedDomains: [
    { name: 'contoso.onmicrosoft.com', isDefault: true, isInitial: true },
    { name: 'contoso.com', isDefault: false, isInitial: false },
  ],
  tenantType: 'AAD',
}

// License SKUs mock
export const mockLicenses = [
  {
    skuId: '00000000-0000-0000-0000-000000000002',
    skuPartNumber: 'INTUNE_A',
    servicePlans: [{ servicePlanName: 'INTUNE_A' }],
  },
  {
    skuId: '00000000-0000-0000-0000-000000000003',
    skuPartNumber: 'WIN_ENT_E3',
    servicePlans: [{ servicePlanName: 'WINDOWS_STORE' }],
  },
]

export const mockLicensesNoIntune = [
  {
    skuId: '00000000-0000-0000-0000-000000000004',
    skuPartNumber: 'EXCHANGESTANDARD',
    servicePlans: [{ servicePlanName: 'EXCHANGE_S_STANDARD' }],
  },
]

export const mockLicensesWithPremiumP2 = [
  ...mockLicenses,
  {
    skuId: '00000000-0000-0000-0000-000000000005',
    skuPartNumber: 'AAD_PREMIUM_P2',
    servicePlans: [{ servicePlanName: 'AAD_PREMIUM_P2' }],
  },
]

// User mock
export const mockUser = {
  id: '00000000-0000-0000-0000-000000000010',
  displayName: 'Test User',
  userPrincipalName: 'testuser@contoso.onmicrosoft.com',
  mail: 'testuser@contoso.com',
}

// User roles mock
export const mockUserRoles = [
  {
    '@odata.type': '#microsoft.graph.directoryRole',
    id: '00000000-0000-0000-0000-000000000020',
    displayName: 'Global Administrator',
    roleTemplateId: '62e90394-69f5-4237-9190-012177145e10',
  },
]

export const mockUserRolesIntuneAdmin = [
  {
    '@odata.type': '#microsoft.graph.directoryRole',
    id: '00000000-0000-0000-0000-000000000021',
    displayName: 'Intune Administrator',
    roleTemplateId: '3a2c62db-5318-420d-8d74-23affee5d9d5',
  },
]

export const mockUserRolesNoAdmin = [
  {
    '@odata.type': '#microsoft.graph.directoryRole',
    id: '00000000-0000-0000-0000-000000000022',
    displayName: 'User',
    roleTemplateId: 'some-other-role-id',
  },
]

// Tenant config mock
export const mockTenantConfig: TenantConfig = {
  tenantId: '00000000-0000-0000-0000-000000000001',
  tenantName: 'Contoso',
  cloudEnvironment: 'global',
}

// Task mocks
export const createMockTask = (overrides: Partial<HydrationTask> = {}): HydrationTask => ({
  id: crypto.randomUUID(),
  category: 'groups',
  operation: 'create',
  itemName: 'Test Group',
  status: 'pending',
  ...overrides,
})

export const createMockTaskList = (count: number, category = 'groups'): HydrationTask[] => {
  return Array.from({ length: count }, (_, i) => createMockTask({
    id: `task-${i}`,
    category,
    itemName: `Test Item ${i + 1}`,
  }))
}

export const mockCompletedTask: HydrationTask = {
  id: 'task-completed-1',
  category: 'groups',
  operation: 'create',
  itemName: 'Completed Group',
  status: 'completed',
  startTime: new Date('2024-01-01T10:00:00Z'),
  endTime: new Date('2024-01-01T10:00:02Z'),
}

export const mockFailedTask: HydrationTask = {
  id: 'task-failed-1',
  category: 'filters',
  operation: 'create',
  itemName: 'Failed Filter',
  status: 'failed',
  error: 'Insufficient permissions',
  startTime: new Date('2024-01-01T10:00:03Z'),
  endTime: new Date('2024-01-01T10:00:04Z'),
}

export const mockSkippedTask: HydrationTask = {
  id: 'task-skipped-1',
  category: 'compliance',
  operation: 'create',
  itemName: 'Skipped Policy',
  status: 'skipped',
  startTime: new Date('2024-01-01T10:00:05Z'),
  endTime: new Date('2024-01-01T10:00:05Z'),
}

// Summary mock
export const mockSummary: HydrationSummary = {
  tenantId: '00000000-0000-0000-0000-000000000001',
  tenantName: 'Contoso',
  operationMode: 'create',
  startTime: new Date('2024-01-01T10:00:00Z'),
  endTime: new Date('2024-01-01T10:10:00Z'),
  duration: 600000,
  stats: {
    total: 100,
    created: 90,
    deleted: 0,
    skipped: 8,
    failed: 2,
  },
  categoryBreakdown: {
    groups: { total: 12, success: 12, failed: 0 },
    filters: { total: 12, success: 10, failed: 2 },
    compliance: { total: 76, success: 68, failed: 0, skipped: 8 },
  },
  errors: [
    {
      task: 'Device Filter - Corporate iOS',
      message: 'Insufficient permissions',
      timestamp: new Date('2024-01-01T10:02:00Z'),
    },
    {
      task: 'Device Filter - Corporate Android',
      message: 'Insufficient permissions',
      timestamp: new Date('2024-01-01T10:02:30Z'),
    },
  ],
}

// Template mocks
export const mockGroupTemplate = {
  displayName: 'Intune - All Windows Devices',
  description: 'Dynamic group for all Windows devices. Imported by Intune Hydration Kit',
  groupTypes: ['DynamicMembership'],
  membershipRule: '(device.operatingSystem -eq "Windows")',
  membershipRuleProcessingState: 'On',
  mailEnabled: false,
  mailNickname: 'intune-all-windows',
  securityEnabled: true,
}

export const mockFilterTemplate = {
  displayName: 'Windows 11 Corporate Devices',
  description: 'Filter for Windows 11 corporate devices. Imported by Intune Hydration Kit',
  platform: 'windows10AndLater',
  rule: '(device.operatingSystemVersion -startsWith "10.0.22000")',
}

export const mockComplianceTemplate = {
  '@odata.type': '#microsoft.graph.windows10CompliancePolicy',
  displayName: 'Windows 11 - Security Baseline',
  description: 'Windows 11 compliance policy. Imported by Intune Hydration Kit',
  passwordRequired: true,
  passwordMinimumLength: 14,
}

export const mockConditionalAccessTemplate = {
  displayName: 'CA001 - Require MFA for Admins',
  description: 'Require MFA for admin roles. Imported by Intune Hydration Kit',
  state: 'disabled',
  conditions: {
    users: {
      includeRoles: ['62e90394-69f5-4237-9190-012177145e10'],
    },
    applications: {
      includeApplications: ['All'],
    },
  },
  grantControls: {
    operator: 'OR',
    builtInControls: ['mfa'],
  },
}
