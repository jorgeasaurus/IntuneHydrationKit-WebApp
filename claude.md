# IntuneHydrationKit Web Application

Build a web-based version of the IntuneHydrationKit PowerShell tool that enables IT administrators to bootstrap Microsoft Intune tenants with best-practice configurations through a browser interface.

## Project Context

**Source Project**: https://github.com/jorgeasaurus/IntuneHydrationKit
- PowerShell module that automates Intune tenant configuration
- Deploys OpenIntuneBaseline policies, compliance policies, dynamic groups, device filters, conditional access policies
- Supports both create and delete operations with safety markers
- Uses Microsoft Graph API via `Invoke-MgGraphRequest`

**Reference Architecture**: https://github.com/ugurkocde/intuneassignments-website
- Next.js 15 (App Router) web application
- MSAL React authentication with Entra ID
- Microsoft Graph API integration
- TypeScript, Tailwind CSS, Radix UI components
- TanStack Query for state management
- Recharts for visualizations

## Core Requirements

### 1. Authentication & Authorization

**MSAL React Configuration**:
- Single-page application (SPA) flow
- Delegated permissions (no application/daemon auth)
- Support for multiple cloud environments:
  - Global (Commercial)
  - USGov (GCC High)
  - USGovDoD
  - Germany
  - China (21Vianet)

**Required Microsoft Graph Scopes**:
```typescript
const REQUIRED_SCOPES = [
  'DeviceManagementConfiguration.ReadWrite.All',
  'DeviceManagementServiceConfig.ReadWrite.All',
  'DeviceManagementManagedDevices.ReadWrite.All',
  'DeviceManagementScripts.ReadWrite.All',
  'DeviceManagementApps.ReadWrite.All',
  'Group.ReadWrite.All',
  'Policy.Read.All',
  'Policy.ReadWrite.ConditionalAccess',
  'Application.Read.All',
  'Directory.ReadWrite.All',
  'LicenseAssignment.Read.All',
  'Organization.Read.All'
];
```

**Session Management**:
- Store tenant context (tenantId, tenantName) in session
- Implement token refresh logic
- Handle authentication errors gracefully
- Support sign-out with session cleanup

### 2. Pre-flight Validation

**Tenant Health Checks** (run before any operations):
- Validate Graph API connectivity
- Check for active Intune license (INTUNE_A, INTUNE_EDU, EMS, Microsoft 365 E3/E5, Business Premium)
- Verify Windows E3/E5 license for driver update profiles
- Confirm user has required permissions (Global Admin or Intune Admin role)
- Display validation results with clear pass/fail indicators

**License Validation**:
```typescript
interface LicenseCheck {
  hasIntuneLicense: boolean;
  hasWindowsE3OrHigher: boolean;
  assignedLicenses: string[];
  validationTime: Date;
}
```

### 3. Configuration Wizard

**Step 1: Tenant Configuration**
- Input: Tenant ID (GUID format validation)
- Input: Tenant display name (optional, for UI display)
- Cloud environment selector (dropdown)
- "Connect to Tenant" button triggers MSAL login

**Step 2: Operation Mode Selection**
- Radio buttons: Create | Delete | Preview (WhatIf)
- Warning banner for Delete mode:
  ```
  ⚠️ Delete mode will remove configurations created by this tool.
  Only objects with "Imported by Intune Hydration Kit" marker will be deleted.
  Conditional Access policies must be disabled to be deleted.
  ```

**Step 3: Target Selection**
- Checkbox group for configuration types:
  - [ ] OpenIntuneBaseline (70+ policies)
  - [ ] Compliance Templates (10 policies)
  - [ ] App Protection (4 policies)
  - [ ] Notification Templates
  - [ ] Enrollment Profiles (2 profiles)
  - [ ] Dynamic Groups (12 groups)
  - [ ] Device Filters (12 filters)
  - [ ] Conditional Access (13 policies)
- "Select All" / "Deselect All" buttons
- Display estimated object count for each category

**Step 4: OpenIntuneBaseline Configuration** (conditional, if selected)
- GitHub repository URL (default: https://github.com/SkipToTheEndpoint/OpenIntuneBaseline)
- Branch selector (default: main)
- "Download Latest" button with progress indicator
- Display current baseline version after download

**Step 5: Review & Confirm**
- Summary table showing:
  - Tenant name and ID
  - Cloud environment
  - Operation mode
  - Selected targets with object counts
  - Estimated total objects to create/delete
- Checkbox: "I understand this will modify my Intune tenant"
- "Start Hydration" / "Start Deletion" / "Preview Changes" button

### 4. Execution Engine

**Task Queue System**:
```typescript
interface HydrationTask {
  id: string;
  category: string;  // 'groups', 'filters', 'compliance', etc.
  operation: 'create' | 'delete';
  itemName: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  error?: string;
  startTime?: Date;
  endTime?: Date;
}
```

**Execution Flow**:
1. Create task queue from selected targets
2. Execute tasks sequentially (no parallel execution to avoid API throttling)
3. For each task:
   - Check if object already exists (create mode) or needs deletion (delete mode)
   - Apply operation via Microsoft Graph API
   - Update task status in real-time
   - Log detailed results

**Safety Checks** (enforce in code):
- Create mode: Skip if object already exists (case-insensitive name match)
- Delete mode: Only delete objects with "Imported by Intune Hydration Kit" in description
- Conditional Access: Only delete if policy is in `disabled` state
- Preview mode: No Graph API mutations, only GET requests

**Graph API Implementation**:
```typescript
// Use direct Graph API calls, not SDK higher-level abstractions
async function createDeviceFilter(filter: DeviceFilter): Promise<void> {
  const endpoint = 'https://graph.microsoft.com/beta/deviceManagement/assignmentFilters';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(filter)
  });
  
  if (!response.ok) {
    throw new Error(`Failed to create filter: ${response.statusText}`);
  }
}
```

**Rate Limiting & Retries**:
- Implement exponential backoff for 429 (Too Many Requests) responses
- Respect `Retry-After` header
- Max 3 retry attempts per request
- 2-second delay between tasks to avoid throttling

### 5. Real-time Progress Dashboard

**Live Progress View**:
- Overall progress bar (percentage of total tasks completed)
- Category-level progress bars (e.g., "Dynamic Groups: 8/12 created")
- Task list with real-time status updates:
  ```
  ✓ Created: Device Filter - Windows 11 Corporate Devices
  ⏳ Running: Compliance Policy - Windows 10 Security Baseline
  ⊗ Skipped: Dynamic Group - All Windows Devices (already exists)
  ✗ Failed: App Protection - iOS MAM Policy (insufficient permissions)
  ```

**Status Icons**:
- ✓ Success (green)
- ⏳ Running (blue, animated)
- ○ Pending (gray)
- ⊗ Skipped (yellow)
- ✗ Failed (red)

**Error Handling**:
- Display errors inline with affected task
- Provide actionable error messages (e.g., "Missing permission: Group.ReadWrite.All")
- "Continue on error" vs "Stop on first error" toggle
- Download error log as JSON

**Execution Controls**:
- Pause/Resume buttons (pause after current task completes)
- Cancel button (stops execution, does not rollback completed tasks)
- Real-time timer showing elapsed time

### 6. Results & Reporting

**Summary View** (after completion):
```typescript
interface HydrationSummary {
  tenantId: string;
  operationMode: 'create' | 'delete' | 'preview';
  startTime: Date;
  endTime: Date;
  duration: number;  // milliseconds
  stats: {
    total: number;
    created: number;
    deleted: number;
    skipped: number;
    failed: number;
  };
  categoryBreakdown: {
    [category: string]: {
      total: number;
      success: number;
      failed: number;
    };
  };
  errors: Array<{
    task: string;
    message: string;
    timestamp: Date;
  }>;
}
```

**Report Exports**:
- Markdown report (mimics PowerShell module output)
- JSON report (machine-readable)
- CSV report (for Excel analysis)
- Include all task details, timestamps, errors

**Report Content**:
```markdown
# Intune Hydration Report
**Tenant**: contoso.onmicrosoft.com (00000000-0000-0000-0000-000000000000)
**Operation**: Create
**Date**: 2024-01-15 14:32:05 UTC
**Duration**: 8m 42s

## Summary
- Total Tasks: 127
- Created: 119
- Skipped: 7
- Failed: 1

## Category Breakdown
### Dynamic Groups (12)
- ✓ All Windows Devices
- ✓ All macOS Devices
...

### Failed Tasks
- ✗ App Protection - iOS MAM Policy: Graph API error 403 - Insufficient privileges
```

**Post-execution Actions**:
- "View in Intune Portal" links for created objects
- "Download Report" button (multi-format)
- "Start New Hydration" button (resets wizard)
- Display conditional access reminder: "Remember to review and enable CA policies manually"

### 7. Object Templates

**Template Storage**:
- Embed templates as TypeScript constants (mirrors PowerShell `Templates/` folder)
- Separate files per category:
  - `templates/compliance.ts`
  - `templates/groups.ts`
  - `templates/filters.ts`
  - `templates/conditionalAccess.ts`
  - `templates/appProtection.ts`
  - `templates/enrollment.ts`

**Template Structure**:
```typescript
interface PolicyTemplate {
  '@odata.type': string;
  displayName: string;
  description: string;  // Must include: "Imported by Intune Hydration Kit"
  [key: string]: any;  // Policy-specific properties
}

// Example: Compliance Policy Template
export const WINDOWS_11_COMPLIANCE: PolicyTemplate = {
  '@odata.type': '#microsoft.graph.windows10CompliancePolicy',
  displayName: 'Windows 11 - Security Baseline',
  description: 'Windows 11 compliance policy with security baseline requirements. Imported by Intune Hydration Kit',
  passwordRequired: true,
  passwordMinimumLength: 14,
  osMinimumVersion: '10.0.22000.0',
  // ... additional settings
};
```

**OpenIntuneBaseline Integration**:
- Fetch latest baseline JSON from GitHub:
  ```
  https://raw.githubusercontent.com/SkipToTheEndpoint/OpenIntuneBaseline/main/Windows/
  https://raw.githubusercontent.com/SkipToTheEndpoint/OpenIntuneBaseline/main/macOS/
  ```
- Parse JSON and inject hydration kit marker into descriptions
- Display baseline version/commit hash in UI
- Cache downloaded baselines in browser localStorage

### 8. Differential & Drift Detection

**Conflict Detection** (before create operations):
- Query existing Intune objects by display name
- Compare properties (case-insensitive name, same odata.type)
- Display conflicts in wizard:
  ```
  ⚠️ Conflicts Detected (3)
  - "Windows 11 - Security Baseline" (Compliance Policy) already exists
  - "All Windows Devices" (Dynamic Group) already exists
  - "Corporate iOS Devices" (Device Filter) already exists
  
  Options:
  ( ) Skip conflicting items
  ( ) Update existing items (overwrites settings)
  ( ) Cancel operation
  ```

**Drift Detection** (informational):
- Compare existing objects created by this tool against current templates
- Display drift report showing:
  - Objects created by tool that no longer match templates
  - Settings that have been manually modified
  - Missing objects that were previously created
- "Reconcile Drift" button to update to latest templates

### 9. UI/UX Specifications

**Layout**:
- Left sidebar: Navigation (Wizard steps, Settings, About)
- Main content area: Current wizard step or dashboard
- Header: Tenant info, sign-out button
- Footer: Version, GitHub link, documentation link

**Design System**:
- Use shadcn/ui components (same as reference project)
- Tailwind CSS for styling
- Dark mode support
- Responsive design (desktop-first, mobile-friendly)

**Color Coding**:
- Success: Green (#10b981)
- Warning: Amber (#f59e0b)
- Error: Red (#ef4444)
- Info: Blue (#3b82f6)
- Pending: Gray (#6b7280)

**Accessibility**:
- ARIA labels for all interactive elements
- Keyboard navigation support
- Screen reader announcements for status changes
- Color contrast ratio ≥ 4.5:1

**Performance**:
- Lazy load templates (don't load all 127 templates upfront)
- Virtualize long task lists (>50 items)
- Debounce search inputs
- Optimize re-renders with React.memo and useMemo

### 10. Settings & Configuration

**Persistent Settings** (localStorage):
```typescript
interface AppSettings {
  defaultCloudEnvironment: string;
  defaultBaselineRepo: string;
  defaultBaselineBranch: string;
  stopOnFirstError: boolean;
  enableVerboseLogging: boolean;
  autoDownloadReports: boolean;
  theme: 'light' | 'dark' | 'system';
}
```

**Settings UI**:
- Modal dialog accessible from sidebar
- Form with validation
- "Reset to Defaults" button
- Immediate save (no "Apply" button needed)

### 11. Security Considerations

**Data Handling**:
- Never store access tokens in localStorage (use MSAL in-memory cache only)
- Never log sensitive data (tokens, secrets)
- All Graph API calls over HTTPS
- Sanitize user inputs to prevent XSS

**Tenant Isolation**:
- Clear all cached data on sign-out
- Prevent cross-tenant data leakage
- Session timeout after 1 hour of inactivity

**Content Security Policy**:
```typescript
// next.config.js
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' https://graph.microsoft.com https://login.microsoftonline.com;"
  }
];
```

## Technical Stack

**Framework**: Next.js 15 (App Router)
- TypeScript (strict mode)
- Server Components for static content
- Client Components for interactive features

**Authentication**: MSAL React (@azure/msal-react, @azure/msal-browser)
- PublicClientApplication configuration
- MsalProvider wrapper for app
- useMsal hook for auth state
- useMsalAuthentication for protected routes

**State Management**:
- TanStack Query (React Query) for server state
- React Context for app-level state (wizard progress, settings)
- useState/useReducer for component state

**UI Libraries**:
- shadcn/ui (Radix UI primitives + Tailwind)
- Lucide React (icons)
- Recharts (progress visualization)
- Sonner (toast notifications)

**Utilities**:
- date-fns (date formatting)
- zod (schema validation)
- clsx + tailwind-merge (className utilities)

## Project Structure

```
src/
├── app/
│   ├── layout.tsx                 # Root layout with providers
│   ├── page.tsx                   # Landing page
│   ├── wizard/
│   │   └── page.tsx              # Multi-step wizard
│   ├── dashboard/
│   │   └── page.tsx              # Execution dashboard
│   └── results/
│       └── page.tsx              # Results & reports
├── components/
│   ├── auth/
│   │   ├── MsalProvider.tsx
│   │   └── ProtectedRoute.tsx
│   ├── wizard/
│   │   ├── TenantConfig.tsx
│   │   ├── OperationMode.tsx
│   │   ├── TargetSelection.tsx
│   │   └── ReviewConfirm.tsx
│   ├── dashboard/
│   │   ├── ProgressBar.tsx
│   │   ├── TaskList.tsx
│   │   └── ExecutionControls.tsx
│   └── ui/                        # shadcn components
├── lib/
│   ├── auth/
│   │   ├── msalConfig.ts         # MSAL configuration
│   │   └── authUtils.ts
│   ├── graph/
│   │   ├── client.ts             # Graph API client
│   │   ├── groups.ts             # Group operations
│   │   ├── compliance.ts         # Compliance operations
│   │   ├── filters.ts            # Filter operations
│   │   └── conditionalAccess.ts
│   ├── hydration/
│   │   ├── engine.ts             # Task execution engine
│   │   ├── validator.ts          # Pre-flight checks
│   │   └── reporter.ts           # Report generation
│   └── utils/
│       ├── retry.ts              # Exponential backoff
│       └── format.ts
├── templates/
│   ├── compliance.ts
│   ├── groups.ts
│   ├── filters.ts
│   ├── conditionalAccess.ts
│   ├── appProtection.ts
│   └── enrollment.ts
├── types/
│   ├── graph.ts                  # Graph API types
│   ├── hydration.ts              # App-specific types
│   └── templates.ts
└── hooks/
    ├── useHydration.ts
    ├── useGraphQuery.ts
    └── useWizardState.ts
```

## Implementation Phases

### Phase 1: Foundation (Week 1)
- Set up Next.js project with TypeScript
- Implement MSAL authentication flow
- Create basic wizard shell (5 steps, no functionality)
- Set up shadcn/ui components
- Create Graph API client wrapper

### Phase 2: Core Hydration (Week 2-3)
- Implement all template TypeScript files
- Build execution engine with task queue
- Create Graph API service functions (CRUD for each object type)
- Implement pre-flight validation
- Add error handling and retry logic

### Phase 3: UI & UX (Week 4)
- Build complete wizard flow with validation
- Create real-time progress dashboard
- Implement results view with report generation
- Add settings modal
- Implement dark mode

### Phase 4: Advanced Features (Week 5)
- OpenIntuneBaseline GitHub integration
- Conflict detection and drift analysis
- Export functionality (MD, JSON, CSV)
- Comprehensive error logging
- Performance optimizations

### Phase 5: Testing & Polish (Week 6)
- End-to-end testing with test tenant
- Cross-browser compatibility testing
- Accessibility audit
- Documentation (README, inline comments)
- Deployment to production

## Testing Strategy

**Unit Tests**:
- All utility functions (formatting, validation, retry logic)
- Template validation (ensure all have hydration marker)
- Graph API response parsing

**Integration Tests**:
- MSAL authentication flow (mocked)
- Graph API calls (mocked with MSW)
- Wizard state transitions
- Task execution engine

**E2E Tests** (Playwright):
- Complete hydration flow (create mode)
- Delete flow with safety checks
- Preview mode (no mutations)
- Error scenarios (network failure, permission denied)

**Manual Testing Checklist**:
- [ ] Test in dev tenant before production use
- [ ] Verify all 127 objects created successfully
- [ ] Confirm delete mode only removes kit-created objects
- [ ] Test with different cloud environments (Global, USGov)
- [ ] Validate CA policies are created disabled
- [ ] Check report accuracy (counts match actual objects)

## Deployment

**Environment Variables**:
```env
# .env.local (development)
NEXT_PUBLIC_MSAL_CLIENT_ID=your-client-id
NEXT_PUBLIC_MSAL_AUTHORITY=https://login.microsoftonline.com/common
NEXT_PUBLIC_MSAL_REDIRECT_URI=http://localhost:3000

# .env.production
NEXT_PUBLIC_MSAL_CLIENT_ID=your-prod-client-id
NEXT_PUBLIC_MSAL_AUTHORITY=https://login.microsoftonline.com/common
NEXT_PUBLIC_MSAL_REDIRECT_URI=https://intunehydrationkit.com
```

**Hosting Options**:
- Vercel (recommended, easy Next.js deployment)
- Azure Static Web Apps (integrates with Entra ID)
- Netlify
- Self-hosted (Docker container)

**Entra ID App Registration** (production):
1. Create new app registration in Azure Portal
2. Set redirect URI to production URL
3. Add all required Graph API delegated permissions
4. Grant admin consent
5. Configure token claims if needed

## Documentation Requirements

**README.md**:
- Project overview and features
- Prerequisites (Node.js version, Entra ID setup)
- Local development setup
- Environment variable configuration
- Deployment instructions
- Security considerations
- License (MIT, matching PowerShell module)

**In-app Help**:
- Tooltip on each wizard step
- "What is this?" buttons with detailed explanations
- Link to Microsoft Graph API documentation
- FAQ section addressing common issues

**Code Documentation**:
- TSDoc comments for all exported functions
- README in each major folder explaining structure
- Inline comments for complex logic

## Success Criteria

**Functional**:
- Successfully creates all 127 Intune objects in test tenant
- Delete mode safely removes only kit-created objects
- Preview mode shows accurate diff without mutations
- Handles Graph API throttling gracefully
- Generates accurate reports in all formats

**Non-Functional**:
- Initial page load < 2 seconds
- Wizard step transitions < 500ms
- Support 100+ concurrent tasks without UI freeze
- Works on latest Chrome, Firefox, Safari, Edge
- Accessible (WCAG 2.1 AA compliant)
- Mobile-responsive (although desktop-optimized)

**User Experience**:
- Clear error messages with actionable next steps
- Progress is visible and accurate
- No unexpected behavior or data loss
- Consistent with Intune admin center UX patterns

## Open Questions / Decisions

1. **Baseline Updates**: How to handle new OpenIntuneBaseline versions after initial hydration?
   - Recommended: Add "Update Baseline" wizard that detects and applies diffs

2. **Multi-tenant Support**: Allow switching between tenants in same session?
   - Recommended: Yes, but require explicit tenant switch with confirmation

3. **Undo/Rollback**: Should there be a built-in rollback feature?
   - Recommended: No, use delete mode instead (less complexity)

4. **Batch Operations**: Support hydrating multiple tenants sequentially?
   - Recommended: No, keep scope to single tenant (avoid complexity)

5. **Audit Logging**: Store execution history server-side?
   - Recommended: No, client-side only (reports are sufficient)

## Risk Mitigation

**Risk**: User accidentally deletes production policies
- **Mitigation**: Require explicit confirmation for delete mode, show list of objects to be deleted, only delete kit-created objects

**Risk**: Graph API throttling breaks execution
- **Mitigation**: Implement exponential backoff, respect Retry-After headers, sequential execution (no parallelism)

**Risk**: User lacks required permissions
- **Mitigation**: Pre-flight permission check, clear error messages, link to permission documentation

**Risk**: OpenIntuneBaseline repo changes structure
- **Mitigation**: Pin to specific commit hash by default, allow user override, handle parse errors gracefully

**Risk**: Browser compatibility issues
- **Mitigation**: Use polyfills for modern APIs, test on all major browsers, provide browser support matrix in docs

## Performance Targets

- First contentful paint: < 1.5s
- Time to interactive: < 3s
- Task execution rate: 1 task per 2-3 seconds (avg)
- Total hydration time (127 objects): < 10 minutes
- Report generation: < 2 seconds
- Memory usage: < 100MB (excluding browser baseline)

---

## Final Notes

This specification provides a complete blueprint for building a production-ready web version of IntuneHydrationKit. The implementation should prioritize:

1. **Safety**: Never delete objects without explicit markers and confirmation
2. **Transparency**: Always show what will happen before it happens (preview mode)
3. **Reliability**: Handle errors gracefully, provide detailed logs
4. **Usability**: Make complex operations simple through a clear wizard flow
5. **Maintainability**: Write clean, documented code that matches PowerShell module logic

The web version should feel like a natural extension of the PowerShell module, not a replacement. Power users will continue using PowerShell for automation, while the web UI serves those who prefer a graphical interface for one-time or occasional hydrations.
