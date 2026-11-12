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
- This app does not use TanStack Query or Recharts. It uses React Context and plain components.

## Core Requirements

### 1. Authentication & Authorization

**MSAL React Configuration**:
- Single-page application (SPA) flow
- Delegated permissions (no application/daemon auth)
- Interactive sign-in and token renewal use MSAL popups (`loginPopup`, `acquireTokenPopup`)
- Global (Commercial) cloud only. The web app has no cloud selector.
  - Sovereign clouds (USGov GCC High, USGovDoD, China 21Vianet) are supported only by the PowerShell module.

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
- Get tenant context (tenantId, tenantName) from the signed-in account. The user does not type a tenant ID.
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

The wizard has four steps: Tenant checkpoint, Execution mode, Deployment scope, and Launch review.

**Step 1: Tenant Checkpoint**
- Sign-in button starts the MSAL popup login
- Tenant ID and display name come from the signed-in account (no tenant ID input)
- Cloud environment is shown as fixed text: "Global (Commercial)" (no selector)
- Run pre-flight validation and show the results

**Step 2: Execution Mode**
- Choose Preview (WhatIf) or Live, and Create or Delete
- Warning banner for Delete mode:
  ```
  ⚠️ Delete mode will remove configurations created by this tool.
  Only objects with "Imported by Intune Hydration Kit" marker will be deleted.
  Conditional Access policies must be disabled to be deleted.
  ```

**Step 3: Deployment Scope**
- Checkbox group for configuration types:
  - OpenIntuneBaseline policies
  - CIS baselines (with sub-selection by benchmark family)
  - Compliance templates
  - App protection policies
  - Win32 apps
  - Notification templates
  - Enrollment profiles
  - Dynamic and static groups
  - Device filters
  - Conditional Access policies
- Per-item selection inside each category
- "Select All" / "Deselect All" buttons
- Display estimated object count for each category
- The OpenIntuneBaseline and CIS templates are bundled with the app. There is no repository URL, branch selector, or "Download Latest" step.

**Step 4: Launch Review**
- Summary table showing:
  - Tenant name and ID
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
2. Execute batchable tasks through Graph `$batch` requests (`lib/graph/batch.ts`, `lib/config/batchConfig.ts`): 20 requests per batch (15 for OpenIntuneBaseline and CIS), 1 second between batches. Delete mode sends batchable deletes with limited parallelism (3 concurrent requests, 500 ms between groups). Tasks that cannot be batched run one at a time.
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
- Bounded retry attempts per request (`lib/utils/retry.ts`)
- Fixed delays between batches (see Execution Flow) instead of a delay between each task

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
- "View matched object" Intune portal links for matched Settings Catalog policies (links for all object types are not yet implemented)
- "Download Report" button (multi-format)
- "Start New Hydration" button (resets wizard)
- Display conditional access reminder: "Remember to review and enable CA policies manually"

### 7. Object Templates

**Template Storage**:
- Store policy templates as JSON in `public/IntuneTemplates`.
- Load templates through `lib/templates/loader.ts` before execution.
- Keep shared types in their Graph domain modules. Do not add TypeScript mirrors for policy templates in `public/IntuneTemplates`. Other template types can use TypeScript when needed.

**Template Structure**:
```json
{
  "@odata.type": "#microsoft.graph.windows10CompliancePolicy",
  "displayName": "Windows 11 - Security Baseline",
  "description": "Imported by Intune Hydration Kit"
}
```

**OpenIntuneBaseline Integration**:
- The OpenIntuneBaseline templates are bundled in `public/IntuneTemplates/OpenIntuneBaseline`. The app does not download them from GitHub at runtime and does not cache them in localStorage.
- `.github/workflows/sync-oib-templates.yml` runs `scripts/sync-oib-templates.js` every week (and on demand). When upstream changes, it opens a pull request against `dev` with the new templates and a version increment.
- Inject the hydration kit marker into descriptions at execution time
- Display the bundled baseline version in the UI

**CIS Baselines**:
- The CIS templates are bundled in `public/CISIntuneBaselines` with a `manifest.json`.
- Regenerate the manifest with `npm run generate-cis-manifest`. The sync workflow does not update CIS templates.

**Win32 Apps**:
- Win32 app definitions are in `templates/win32Apps.ts`. The `.intunewin` packages are bundled in `public/win32-apps`.
- The browser cannot write to the Intune Azure Storage upload URL because that storage does not send CORS headers. The `/api/win32-upload` server route relays the encrypted package to the signed Azure Blob URL.

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
  ( ) Cancel operation
  ```
- As built, create mode always skips conflicting items. The "Update existing items" option is not yet implemented.
- The Launch review step shows an OpenIntuneBaseline change review (new, existing, and older-version policies by name).

**Drift Detection** (informational):
- Compare existing objects created by this tool against current templates
- As built, the results view shows drift evidence (differences) for existing objects that the run skipped
- A drift report for settings that were manually modified, and for missing objects that were previously created, is not yet implemented
- The "Reconcile Drift" button is not yet implemented

### 9. UI/UX Specifications

**Layout**:
- Left sidebar: Navigation (Wizard steps, Settings, About)
- Main content area: Current wizard step or dashboard
- Header: Tenant info, sign-out button
- Footer: Version, GitHub link, documentation link

**Design System**:
- Use shadcn/ui components (same as reference project)
- Tailwind CSS for styling
- Fixed glass theme over an animated wallpaper (three.js + Vanta). There is no light/dark toggle.
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
- Lazy load templates per category (don't load the full catalog upfront)
- Virtualize long task lists (>50 items)
- Debounce search inputs
- Optimize re-renders with React.memo and useMemo

### 10. Settings & Configuration

**Persistent Settings** (localStorage):
```typescript
interface AppSettings {
  stopOnFirstError: boolean;
  demoMode: boolean;
}
```

**Settings UI**:
- Modal dialog accessible from navigation
- "Save Changes" and "Cancel" buttons (changes apply only on save)

### 11. Security Considerations

**Data Handling**:
- Never store access tokens in localStorage. MSAL keeps its token cache in sessionStorage (`cacheLocation: "sessionStorage"` in `lib/auth/msalConfig.ts`), so tokens are cleared when the browser tab closes.
- Send the Graph token to this app's own server only for `/api/win32-upload`, which uses it to confirm the upload target with Graph
- Never log sensitive data (tokens, secrets)
- All Graph API calls over HTTPS
- Sanitize user inputs to prevent XSS

**Tenant Isolation**:
- Clear all cached data on sign-out
- Prevent cross-tenant data leakage
- Session timeout after 1 hour of inactivity

**Content Security Policy**:
- `next.config.ts` builds the policy and sets it with `headers()`.
- All app pages use one policy. No third-party script host is allowed except Vercel Analytics.
- `'unsafe-eval'` is allowed only for the development server. Scripts keep `'unsafe-inline'` because statically generated pages contain inline Next.js bootstrap scripts.
- `frame-src` allows the MSAL authority for hidden-iframe token renewal. `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, and `frame-ancestors 'none'` are set.
- Silent token renewal ends on `/auth/redirect` (`app/auth/redirect/route.ts`), a blank page with no scripts. It is the only path that can be framed, and only by the same origin (`frame-ancestors 'self'`, `X-Frame-Options: SAMEORIGIN`). Its policy is `default-src 'none'`. All other routes send `frame-ancestors 'none'` and `X-Frame-Options: DENY`.
- The app also sends `Strict-Transport-Security`, `Permissions-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, and `Referrer-Policy`.

## Technical Stack

**Framework**: Next.js 15 (App Router)
- TypeScript (strict mode)
- Server Components for static content
- Client Components for interactive features

**Authentication**: MSAL React (@azure/msal-react, @azure/msal-browser)
- PublicClientApplication configuration
- MsalProvider wrapper for app
- useMsal hook for auth state
- useIsAuthenticated in `ProtectedRoute` for protected routes

**State Management**:
- React Context for app-level state (wizard progress, settings)
- useState/useReducer for component state

**UI Libraries**:
- shadcn/ui (Radix UI primitives + Tailwind)
- Lucide React (icons)
- Sonner (toast notifications)
- Framer Motion (animation)
- three.js + Vanta (animated wallpaper)
- Progress bars are plain components. Recharts is not used.

**Utilities**:
- `lib/utils/dateFormat.ts` (date formatting; date-fns is not used)
- zod (schema validation)
- clsx + tailwind-merge (className utilities)

## Project Structure

The source folders are at the repository root (there is no `src/` folder). Main files:

```
├── app/
│   ├── layout.tsx                 # Root layout with providers
│   ├── page.tsx                   # Landing page
│   ├── templates/page.tsx         # Template catalog
│   ├── wizard/                    # Four-step wizard (layout sets noindex)
│   ├── dashboard/                 # Live execution, results, and reports (layout sets noindex)
│   ├── api/win32-upload/route.ts  # Server relay for Win32 package upload to Azure Blob
│   ├── auth/redirect/route.ts     # Blank redirect page for MSAL silent token renewal
│   ├── robots.ts, sitemap.ts, manifest.ts
├── components/
│   ├── auth/                      # MsalProvider.tsx, ProtectedRoute.tsx
│   ├── wizard/                    # TenantConfig, OperationMode, TargetSelection*, ReviewConfirm, BaselineChangeReview, ...
│   ├── dashboard/                 # DashboardRunView, ProgressBar, TaskList, TaskRow, ExecutionControls, ResultsSummary, ReportComparison, ...
│   ├── landing/                   # HomeLanding
│   ├── templates/                 # TemplateCatalogPage
│   ├── SettingsModal.tsx, Navigation.tsx, DynamicWallpaper.tsx, ...
│   └── ui/                        # shadcn components
├── lib/
│   ├── auth/                      # msalConfig.ts, authUtils.ts
│   ├── config/batchConfig.ts      # Graph $batch sizes and delays
│   ├── graph/                     # client.ts, batch.ts, endpoints.ts, prerequisites.ts, and one module per object type
│   ├── hydration/                 # engine.ts, batchExecutor.ts, taskQueue.ts, reporter.ts, taskExecutors/, ...
│   ├── templates/                 # loader.ts, catalog.ts
│   ├── win32/intuneWinPackage.ts  # .intunewin parsing
│   └── utils/                     # retry.ts, dateFormat.ts, hydrationMarker.ts, base64.ts
├── templates/                     # TypeScript manifests: groupManifest.ts, filterManifest.ts, win32Apps.ts
├── types/                         # graph.ts, hydration.ts, prerequisites.ts
├── hooks/                         # useWizardState, useHydrationExecution, useDashboardRun, useSettings
├── public/
│   ├── IntuneTemplates/           # JSON policy templates, including OpenIntuneBaseline/
│   ├── CISIntuneBaselines/        # CIS benchmark templates and manifest.json
│   └── win32-apps/                # Bundled .intunewin packages
├── scripts/                       # sync-oib-templates.js, generate-*-manifest.js
├── __tests__/                     # Vitest unit tests
└── e2e/                           # Playwright tests
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
- Implement the fixed glass theme (no dark-mode toggle)

### Phase 4: Advanced Features (Week 5)
- OpenIntuneBaseline templates bundled and synced by a GitHub workflow
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
- Graph API calls (mocked `fetch` with Vitest; MSW is not used)
- Wizard state transitions
- Task execution engine

**E2E Tests** (Playwright):
- Complete hydration flow (create mode)
- Delete flow with safety checks
- Preview mode (no mutations)
- Error scenarios (network failure, permission denied)

**Manual Tenant Validation**:
- Requires a real dev tenant before any production-impacting release.
- Verify expected objects are created successfully.
- Confirm delete mode only removes kit-created objects.
- Validate Conditional Access policies are created disabled.
- Check report accuracy against actual tenant objects.
- Use the PowerShell module for sovereign cloud validation.

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
- The host must run the Node.js `/api/win32-upload` route. A static-only export is not sufficient.
- Vercel (recommended, easy Next.js deployment)
- Azure Static Web Apps (integrates with Entra ID)
- Netlify
- Self-hosted (Docker container)

**Entra ID App Registration** (production):
1. Create new app registration in Azure Portal
2. Register two SPA redirect URIs for each origin that you use (production, each preview alias, and `http://localhost:3000`): `<origin>` for popup sign-in and sign-out, and `<origin>/auth/redirect` for silent token renewal. Both use the Single-page application platform.
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
- License (proprietary commercial EULA)

**In-app Help** (not yet implemented; see "Not Yet Implemented"):
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
- Successfully creates all catalog objects in test tenant (the template catalog lists 990 items)
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

## Not Yet Implemented

These items are still wanted but are not in the app as built:

- Conflict option "Update existing items (overwrites settings)". Create mode always skips existing objects.
- "Reconcile Drift" button, and a full drift report (manually modified settings, missing objects that were previously created).
- "View in Intune Portal" links for all created object types. Only matched Settings Catalog policies have portal links.
- In-app help: tooltip on each wizard step, "What is this?" buttons, links to Microsoft Graph documentation, and an FAQ section.

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
- **Mitigation**: Implement exponential backoff, respect Retry-After headers, Graph `$batch` with fixed batch sizes and delays, and limited delete parallelism (3 concurrent requests)

**Risk**: User lacks required permissions
- **Mitigation**: Pre-flight permission check, clear error messages, link to permission documentation

**Risk**: OpenIntuneBaseline repo changes structure
- **Mitigation**: Bundle the templates in the app. The sync workflow opens a reviewed pull request for each upstream change. Handle parse errors gracefully.

**Risk**: Browser compatibility issues
- **Mitigation**: Use polyfills for modern APIs, test on all major browsers, provide browser support matrix in docs

## Performance Targets

- First contentful paint: < 1.5s
- Time to interactive: < 3s
- Task execution rate: set by Graph `$batch` size and batch delay (see Execution Flow)
- Total hydration time (full catalog, about 990 objects): < 10 minutes
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
