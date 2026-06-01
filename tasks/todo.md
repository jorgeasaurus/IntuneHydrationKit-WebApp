# React Doctor 100

- [x] Run `npx react-doctor@latest` (baseline: 70, 456 issues).
- [x] Fix reported issues with minimal code changes.
  - [x] Mechanical Tailwind/copy/animation cleanup (after batch: 71, 258 issues).
  - [x] React Doctor error cleanup (after batch: 74, 243 warnings, 0 errors).
  - [x] Dead-code cleanup (after batch: 77, 201 warnings).
  - [x] Low-risk refactor/accessibility cleanup (after batch: 85, 151 warnings).
  - [x] State/effect cleanup (after batch: 88, 137 warnings).
- [x] Re-run React Doctor until score is 100.
- [x] Run relevant project checks.

## Review

- React Doctor: 100 / 100, no issues found.
- Type-check: `npm run type-check` passed.
- Tests: `npm run test:run` passed (63 files, 473 tests).

# Conditional Access Beta Endpoint

- [x] Reproduce/trace policy create path for 1038 beta endpoint error.
- [x] Route preview Conditional Access policy creates to Graph beta in batch mode.
- [x] Add regression coverage.
- [x] Run targeted checks.

## Review

- Preview Conditional Access batch creates now use Graph beta when the payload contains preview-only features.
- Stable Conditional Access batch creates remain on `v1.0`.
- Checks passed: targeted hydration tests, `npm run type-check`, `npm run test:run`, `npx react-doctor@latest`.

# Graph SDK Source 404s

- [x] Trace `/src/*.ts` dev-server 404 source requests.
- [x] Remove or contain the import path that exposes missing package sources.
- [x] Verify with targeted checks.

## Review

- Removed `@microsoft/microsoft-graph-client` from the browser bundle path and dependencies.
- `GraphClient.getCollection` now follows `@odata.nextLink` with the same authenticated `fetch` path as other Graph calls.
- Converted React Doctor suppressions to `oxlint-disable` so `next build` can lint without the React Doctor ESLint plugin installed.
- Checks passed: Graph client tests, `npm run type-check`, `npm run test:run`, `npm run build`, `npx react-doctor@latest`.
- Dev smoke test on `http://localhost:3017` showed no `/src/*` or Graph SDK source-map requests.

# Preview Account Recovery Payload

- [x] Inspect generated body for `Secure account recovery with identity verification (Preview)`.
- [x] Normalize unsupported/null template fields before Graph beta create.
- [x] Add regression coverage for the preview policy payload.
- [x] Run targeted checks.

## Review

- Conditional Access create payloads now drop exported Graph response metadata and null optional branches.
- The preview account recovery policy still preserves `verifiedID` and `urn:user:accountrecovery`, and still routes to Graph beta.
- Checks passed: targeted tests, `npm run type-check`, `npm run test:run`, `npm run build`, `npx react-doctor@latest`.

# Conditional Access Malformed Error Logging

- [x] Inspect batch failure handling for malformed Graph create responses.
- [x] Add scoped console diagnostics for Conditional Access create 400 failures.
- [x] Add regression coverage for the diagnostic log.
- [x] Run targeted checks.

## Review

- Failed Conditional Access batch creates now log task, endpoint, API version, Graph response body, and sanitized request payload.
- `$batch`-level 400 failures also log the affected Conditional Access create requests.
- Checks passed: targeted batch executor test, `npm run type-check`, `npm run test:run`, `git diff --check`.

# Operator Identity Text Overflow

- [x] Locate the operator identity card.
- [x] Patch long email wrapping without layout overflow.
- [x] Verify targeted component tests/type checks.

## Review

- Operator identity now uses a constrained card and breakable email text.
- Added a component regression test for the wrapping classes.
- Checks passed: targeted TenantConfig test, `npm run type-check`, `npm run build`, `npx react-doctor@latest`, `git diff --check`.
- Browser smoke reached `/wizard`, but unauthenticated Playwright redirected to the signed-out home page before the tenant card was visible.

# AccountRecovery Private Preview Handling

- [x] Extract Graph batch inner error details.
- [x] Classify AccountRecovery private-preview authorization as skipped.
- [x] Add regression coverage for the 1101 response.
- [x] Run targeted and project checks.

## Review

- Graph batch errors now preserve `error.innerError.message`.
- AccountRecovery private-preview authorization failures are marked skipped with a clear tenant-authorization reason.
- Checks passed: targeted batch tests, `npm run type-check`, `npm run test:run`, `npm run build`, `git diff --check`.

# Remove AccountRecovery Private Preview Policy

- [x] Remove the private-preview AccountRecovery policy from template sources.
- [x] Update surfaced Conditional Access offering counts.
- [x] Adjust tests for the reduced offering.
- [x] Run targeted and project checks.

## Review

- Removed Secure account recovery with identity verification from public JSON templates and static CA exports.
- Conditional Access offering count is now 20.
- Remaining AccountRecovery references are defensive tests/notes only, not offered templates.
- Checks passed: targeted template/task queue tests, `npm run type-check`, `npm run test:run`, `npm run build`, `git diff --check`.

# PostCSS Audit Finding

- [x] Confirm vulnerable dependency path.
- [x] Patch nested Next PostCSS without forced Next downgrade.
- [x] Re-run audit and project checks.

## Review

- `next@15.5.18` now resolves to the root `postcss@8.5.15` via npm overrides.
- Removed the nested vulnerable `node_modules/next/node_modules/postcss` install path.
- Checks passed: `npm audit --json`, `npm ls next postcss`, `npm run type-check`, `npm run test:run`, `npm run build`, `git diff --check`.

# Thermo-Nuclear Review Loop

- [x] Capture React Doctor and code-quality baseline.
- [x] Run thermo-nuclear review against current branch changes.
- [x] Address every actionable finding.
- [x] Repeat review until no findings remain.
- [x] Verify React Doctor remains 100 and project checks pass.

## Review

- Removed `react-doctor` as an unused devDependency while keeping the `doctor` script on `npx`.
- Moved Conditional Access batch endpoint/diagnostic/private-preview logic out of `batchExecutor.ts` into `lib/hydration/conditionalAccessBatch.ts`.
- Replaced hidden CIS category ref state with derived category IDs from selected CIS policy paths.
- Checks passed: React Doctor full and diff scans at 100, `npm audit --json`, `npm ls next postcss`, `npm run type-check`, `npm run test:run`, `npm run build`, `git diff --check`.

# Thermo Findings Follow-up

- [x] Extract TargetSelection search/platform/CIS model helpers.
- [x] Replace Conditional Access beta display-name heuristic with explicit payload capabilities.
- [x] Add focused regression coverage for stable preview-named Conditional Access policies.
- [x] Decompose TargetSelection and remove blanket structural suppressions.
- [x] Make selected CIS policy paths the canonical persisted selection.
- [x] Move Conditional Access beta capability routing to a typed CA create model.
- [x] De-duplicate Conditional Access batch test setup.
- [x] Rerun React Doctor, thermo review, and project verification.

## Review

- TargetSelection is split into focused data, state, bulk-action, persistence, and view modules.
- CIS tasks carry `templatePath`; queue dedupe and batch/sequential lookup use the selected path when present.
- Conditional Access creates use one typed create plan for payload normalization and API-version routing.
- Independent thermo review: no findings.
- Checks passed: React Doctor full and diff scans at 100, `npm run type-check`, `npm run test:run`, `npm run build`, `npm audit --json`, `npm ls next postcss`, `git diff --check`.

# Commit Breakdown

- [x] Group changes by tooling/deps, frontend cleanup, Graph/hydration reliability, Conditional Access, TargetSelection/CIS identity, and task docs.
- [x] Commit each group separately.
- [x] Verify final worktree status.

# Copilot PR Follow-up

- [x] Fetch and classify Copilot comments from merged PR #4.
- [x] Fix wizard target-selection navigation so Review stays reachable.
- [x] Add accessible names/state to TargetSelection category icon buttons.
- [x] Pin/reduce permissions for the React Doctor workflow.
- [x] Restore `aria-hidden` on decorative background canvases.
- [x] Run focused and project checks.

## Review

- Addressed all 5 unresolved Copilot review threads from merged PR #4.
- Checks passed: targeted component tests, `npm run type-check`, `npm run test:run`, `npm run build`, `npx react-doctor@latest --verbose --diff`, `git diff --check`.
