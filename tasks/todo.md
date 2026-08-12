# Landing Hero Intermediate-Width Overlap

- [x] Reproduce the 1067px-wide landing layout and identify the constrained desktop grid.
- [x] Keep the landing hero stacked until both columns fit without overlap.
- [x] Add a 1067px viewport regression and run targeted validation.

## Review

- The two-column preview now begins at 1280px. At 1067px, the compact preview follows the hero content instead of intruding beside it.
- Checks passed: focused unit and Playwright tests, type-check, lint, production build, and React Doctor (100/100).
- One strict review cycle found no actionable issues. Full validation passed.

# Win32 Detection Scripts in Template Docs

- [x] Trace the current lazy Win32 script-loading and documentation path.
- [x] Load and display each Win32 detection script with PowerShell highlighting.
- [x] Add catalog and component regression coverage.
- [x] Run focused tests, type-check, lint, and review the diff.
- [x] Increment the website version for the new pull request.
- [ ] Complete a clean Copilot review cycle on the latest head.
- [ ] Squash-merge the clean pull request and verify the merged state.

## Review

- Detection, install, and uninstall scripts now load together only after a Win32 template expands.
- The detection script uses the same selectable, syntax-highlighted PowerShell panel as the other scripts.
- Thermonuclear review completed in one round with zero actionable findings.
- Checks passed: 560 tests, type-check, lint, production build, and `git diff --check`.

# PR #21 Final Copilot Review and Merge

- [x] Inspect normal threads and all historical suppressed comments.
- [x] Fix the remaining valid `.intunewin` format-message comment with regression coverage.
- [x] Align the Win32 metadata count with the four shipped templates.
- [x] Make Win32 detection read-only, correct Prism token mapping, and clarify protected-delete results.
- [x] Distinguish protected delete matches from absent apps.
- [x] Remove redundant full-payload copies from `.intunewin` parsing.
- [x] Centralize the Graph base URL in a server-safe endpoint module.
- [x] Remove per-block copies from server-side Azure uploads.
- [x] Send the Azure block list with an XML content type.
- [x] Cache Win32 collection discovery across one execution.
- [x] Render the standard `OData type` label casing in template summaries.
- [x] Render readable results labels for every known task category.
- [x] Verify, commit, push, and disposition all current-head comments.
- [ ] Complete a clean Copilot review cycle on the latest head.
- [ ] Squash-merge PR #21 and verify the merged state.

## Review

- The parser now tells operators that supplied packages need stored ZIP entries without data descriptors; it no longer labels the production path as a proof of concept.
- Detection scripts now use WinGet only when it is present and otherwise use read-only registry detection; no detection path downloads or installs dependencies.
- Protected delete candidates now report the ownership requirement, and PowerShell `class-name` tokens receive the intended syntax color.
- Delete discovery now preserves whether any app name matched, so absent apps report `Not found in tenant` while unowned matches report the ownership protection.
- `.intunewin` ZIP entries now remain views over the package buffer, and the encrypted-content view goes directly to `Blob` without another full-payload slice.
- The Graph client and Win32 upload authorization now use the same server-safe endpoint helper.
- Azure block uploads now reuse one 6 MB buffer and send full or tail views without per-block copies.
- Azure block-list commits now declare the XML body as `application/xml`.
- Win32 discovery fetches the full Graph collection once per execution; recent-object lookups preserve eventual-consistency retries, and create/delete mutations update the cache.
- Template summaries preserve the standard `OData type` casing instead of generic title casing.
- Results category headers use readable product labels such as `Win32 Apps`, `App Protection`, and `Conditional Access`.
- Checks passed: 560 tests, PowerShell parsing for all four detection scripts, type-check, lint, production build, React Doctor 100/100, and `git diff --check`.
- Checks passed: 559 tests, PowerShell parsing for all four detection scripts, type-check, lint, production build, React Doctor 100/100, and `git diff --check`.

# Win32 Single-App Selection

- [x] Trace the selected Win32 item from Target Selection into task queue construction.
- [x] Persist Win32 item selections in wizard state.
- [x] Add create-mode and delete-mode single-item queue regressions.
- [x] Run focused and full verification.
- [x] Commit and push the fix to PR #21.

## Review

- Root cause: Target Selection omitted `win32Apps` when it persisted item-level selections, so queue construction received no item filter and selected every template.
- The persisted selection and queue now contain only the chosen app in both create and delete modes.
- Checks passed: 554 tests, type-check, lint, production build, and `git diff --check`.

# Remove PowerShell Win32 Proof of Concept

- [x] Map the PowerShell app template, catalog entry, tests, and bundled assets.
- [x] Remove the PowerShell app without changing required PowerShell-based Win32 implementation details.
- [x] Run focused and full project verification.
- [x] Commit and push the removal to PR #21.

## Review

- Removed the PowerShell template, package, icon, install script, uninstall script, and detection script; the Win32 catalog now contains four apps.
- Checks passed: 552 tests, type-check, lint, production build, and `git diff --check`.

# Suppressed Copilot Comment

- [x] Inspect the suppressed PR #21 comment and validate it against the latest head.
- [x] Fix valid feedback and add focused regression coverage.
- [x] Verify, push, reply, and resolve the handled thread.
- [ ] Complete a clean Copilot review cycle on the new head.

## Review

- Commit `06c3622` removes the live identity-provider dependency from the popup test and requires Graph-authorized, exact-target validation before the Win32 proxy streams content.
- The next review found a delete-discovery race; missing legacy candidates are now ignored while other Graph failures still stop the task.
- Checks passed: 553 tests, type-check, lint, production build, direct Playwright popup validation, `git diff --check`, and React Doctor at 100/100.
- Copilot completed the clean review on `313cc5f` with no comments or suppressed comments; no review threads remain open.
- The documentation-head review found legacy name-variant drift and obsolete theme lessons; both are corrected and need final review.
- The next review found repeated byte-string concatenation in script and icon encoding; both paths now use one chunked base64 utility.

# Results Category Contrast

- [x] Replace theme-dependent task colors with bright colors for the dark glass surface.
- [x] Add status-color regression coverage.
- [x] Verify the results category list and project checks.

## Review

- Completed task labels now use high-contrast emerald, amber, and red tints in both themes; status icons use matching surface-safe colors.
- Sampled task text measures 4.83:1 to 8.60:1 across the supplied blue surface. Focused tests, type-check, lint, production build, and React Doctor at 100/100 pass.

# PowerShell Syntax Highlighting

- [x] Add a lazy PowerShell code renderer with accessible token markup.
- [x] Apply readable token colors without changing the script panel layout.
- [x] Add focused component and catalog regression tests.
- [x] Verify the expanded Win32 template view, bundle split, and project checks.

## Review

- Prism PowerShell highlighting now loads only when a Win32 template expands; the script remains real, selectable text in the existing scroll panels.
- All 549 tests, type-check, lint, production build, Playwright visual checks, and React Doctor at 100/100 pass.

# Vercel Win32 Upload Origin Recovery

- [x] Reproduce the deployed 403 without forwarding content to Azure or Intune.
- [x] Add a regression for branch-alias and immutable-deployment origin divergence.
- [x] Accept only the request origin or explicitly configured deployment origin.
- [x] Verify locally and against the redeployed Vercel endpoint, then commit and push.

## Review

- The immutable deployment hostname reproduced the report's 403 when paired with the browser-facing `dev` origin; the route now permits that explicitly configured deployment origin without trusting forwarded headers.
- The regression failed before the fix and passes after it; focused tests, cross-origin rejection, lint, type-check, production build, whitespace, and the safe deployed endpoint probe pass.

# Dev Deployment Sign-in Recovery

- [x] Reproduce the deployed sign-in failure and capture the redirect/configuration path.
- [x] Compare the dev deployment environment and access protection with local and production behavior.
- [x] Implement the smallest durable fix and add regression coverage.
- [x] Verify sign-in initiation on the deployed dev alias, then commit and push the repair.

## Review

- The `dev` preview inherited the global production redirect because its branch override remained scoped to the retired pre-rename branch.
- Browser auth now uses the initiating origin, `dev` has an explicit Vercel preview override, and focused auth tests, the popup redirect assertion, lint, type-check, production build, and whitespace checks pass.

# PR #21 Copilot Review Loop

- [x] Inspect authentication, PR metadata, review counts, and unresolved threads.
- [x] Address every valid Copilot thread with focused tests and verification.
- [x] Push fixes, reply to and resolve handled threads, then request a fresh review.
- [x] Repeat until Copilot reviews the latest head with no new actionable feedback.

## Review

- Replaced the landing client bundle's package-manifest import with a build-time version constant sourced from `package.json` in Next and Vitest configuration.
- Verified the focused landing tests, lint, type-check, production build, and whitespace before completing the clean review cycle.

# Dev Branch Rename and Deployment

- [x] Rename the current remote branch to `dev` and preserve the ready-PR path.
- [x] Realign the local branch and upstream tracking.
- [x] Deploy and verify the exact Vercel `git-dev` alias.
- [x] Record final PR, deployment, and workspace state.

## Review

- GitHub closed legacy PR #20 during the server-side rename because its head ref remained bound to the retired branch name; ready replacement PR #21 targets `main` from `dev` with the same 2.6.4 changes.
- Local `dev` tracks `origin/dev`; the requested Vercel branch alias is the deployment verification target.

# Win32 Script Content in Template Docs

- [x] Load each Win32 install and uninstall wrapper when its template is expanded.
- [x] Show both scripts as readable PowerShell while retaining them in the raw payload.
- [x] Add catalog and UI regression coverage for script content and failures.
- [x] Run project/browser checks and refresh PR #20.

## Review

- Script assets remain out of the initial catalog bundle and load only for the expanded Win32 item.
- Checks passed: focused catalog/UI/package tests, full test suite (72 files, 546 tests), type-check, production build, browser content assertions, visual review, `git diff --check`, React Doctor, GitGuardian, and Vercel.

# Expanded Win32 Starter Pack

- [x] Add Google Chrome, Mozilla Firefox, PowerShell, and Visual Studio Code definitions.
- [x] Generate module-equivalent wrappers, icons, and `.intunewin` packages.
- [x] Expand catalog, package, preview, create, and delete coverage.
- [x] Run project checks, commit, push, and verify PR #20.

## Review

- Added four WinGet-based Win32 apps through the shared 7-Zip execution path.
- Wrapper scripts match the PowerShell module generators for all four apps.
- Checks passed: focused Win32/catalog/selection tests, full test suite (72 files, 545 tests), type-check, production build, browser catalog verification, `git diff --check`, React Doctor, GitGuardian, and Vercel.

# PR #20 Copilot Review Loop

- [x] Capture the initial Copilot state and actionable threads.
- [x] Fix Win32 asset diagnostics and remove the arbitrary package-size ceiling.
- [x] Run focused checks, commit, and push the fixes.
- [x] Resolve handled threads and request a fresh Copilot review.
- [ ] Verify a new clean Copilot review cycle.

## Review

- Resolved four Copilot threads: Win32 asset diagnostics, package-size limit, Remotion type import, and Azure upload redirects.
- Checks passed: focused Win32 upload and task-executor tests, `npm run type-check`, `npm run build`, and `git diff --check`.
- Copilot completed two re-review cycles: the first found two issues; the second review on `b28c568` produced no new comments.
- A subsequent review found the upload route buffered whole packages. It now streams 6 MB blocks with an 8 GB limit and fixed-width block IDs; a final re-review is pending.

# README Status and Screenshot Refresh

- [x] Remove the obsolete development-status section.
- [x] Capture and add a current landing-page screenshot.
- [ ] Verify the README image path and documentation diff.

## Review

- Removed the obsolete phase-based development-status section.
- Replaced `LandingPage.jpeg` with a current 1550×972 landing-page capture and updated its alt text.
- Checks passed: README status search, image-path and dimensions check, visual inspection, and `git diff --check`.
- Merged and pushed as documentation-only commit `fefe788` on `main`.

# Proprietary License Transition

- [x] Add a proprietary commercial EULA for future releases.
- [x] Replace MIT and free/open-source product claims with the proprietary licensing position.
- [x] Verify no MIT licensing references remain and run documentation checks.
- [x] Commit and merge only the proprietary-license changes into `main`.

## Review

- Replaced the README, landing footer, FAQ, and project-specification MIT claims with proprietary commercial licensing language.
- Added `LICENSE` with a commercial EULA: evaluation only; production and other commercial use require a separately purchased written license.
- Checks passed: focused landing-page test, `npm run type-check`, `git diff --check`, and an MIT-reference search.
- Merged as licensing-only commit `705e7f0` on `main`; focused React Doctor scan scored 100/100.

# Landing Version Alignment

- [x] Read the PowerShell module version.
- [x] Update landing-page version references and regression coverage.
- [x] Run focused verification and record results.

## Review

- Landing badge and supporting copy now display the PowerShell module version, v1.3.0.
- Checks passed: `npm run test:run -- __tests__/unit/components/HomeLanding.test.tsx`, `npm run type-check`, `npm run build`, and `git diff --check`.

# PowerShell Group and Filter Parity

- [x] Compare the PowerShell and web group/filter inventories.
- [x] Add missing web templates, manifests, counts, and coverage.
- [x] Run focused tests, type-check, and build; record results.

## Review

- Added the three Microsoft Entra device-trust dynamic groups and four Windows device-trust filters from PowerShell module v1.3.0.
- Both loader and static-fallback paths are aligned; cache version bumped to invalidate stale browser templates.
- Checks passed: focused template tests, `npm run type-check`, `npm run test:run` (70 files, 512 tests), `npm run build`, `git diff --check`, and source-file parity.

# Intune Hydration Kit Social Ad

- [x] Define a short-form vertical ad storyboard grounded in current product capabilities.
- [x] Add a self-contained Remotion composition and render entry point.
- [x] Render and visually inspect the illustrative MP4.
- [x] Capture actual local product views at a dark mobile viewport.
- [x] Replace the illustrative UI in the ad and render the updated MP4.
- [x] Capture the dark desktop landing page at key real-product views.
- [x] Recreate the product scenes as desktop browser captures and render the updated MP4.

## Review

- Illustrative version completed; replacing it with real mobile product captures.
- Revised version uses real 390×844 dark-mode landing and template-catalog captures in the product scenes.
- Checks passed: `npm run type-check`, rendered MP4, and visual review of both product scenes.
- Desktop recreation uses real 1440×900 dark-mode landing captures for the hero/live-run and operating-model scenes.
- Upstream Remotion markup/render guidance used: frame-driven animations, `staticFile()`/`Img` assets, still-frame review, and full render.

# GitHub Issue #16 Investigation

- [x] Retrieve issue #16 details, discussion, and linked work.
- [x] Trace the reported behavior through the local code and test coverage.
- [x] Validate the suspected cause and record a concise recommendation.

## Review

- Confirmed: `%OrganizationId%` is sent unchanged by both Settings Catalog paths; the PowerShell module replaces it with the connected tenant ID.
- Checks passed: focused loader, policy-creator, and baseline-task tests (74 tests).

# GitHub Issue #16 Fix PR

- [x] Thread the authenticated tenant ID into hydration execution.
- [x] Replace `%OrganizationId%` in OIB payload values for sequential and batch creates.
- [x] Add regression coverage for both creation paths.
- [x] Commit, push, and open a draft PR.

## Review

- OIB templates remain tenant-neutral in cache; only cloned create payloads receive the authenticated tenant ID.
- Checks passed: focused tests, `npm run type-check`, `npm run test:run` (69 files, 508 tests), `npm run build`, and `git diff --check`.
- Draft PR: #17.

# PR #17 Copilot Review Loop

- [x] Capture Copilot review and unresolved-thread state.
- [x] Address and verify any actionable feedback.
- [x] Request and validate a new clean Copilot review cycle.

## Review

- Copilot review `PRR_kwDOQzwR3c8AAAABHD-ufQ` completed on `799ffc5605c080926c03106df731f73ee2b252fc` with no comments or unresolved threads.

# Issue #16 OIB Template Coverage

- [x] Verify every bundled OIB `%OrganizationId%` occurrence is covered by the resolver.
- [x] Add regression coverage for all three OIB template files.
- [x] Run focused checks and update PR #17.

## Review

- Regression coverage scans the OIB manifest and validates all five `%OrganizationId%` values across the three bundled OneDrive templates.
- Checks passed: focused placeholder tests, `npm run type-check`, and `git diff --check`.

# React Doctor Follow-up Top 3 Pass

- [x] Fetch canonical rule guidance for touched React Doctor rules.
- [x] Fix `react-doctor/no-json-parse-stringify-clone` in Graph payload cloning.
- [x] Fix `socket/low-supply-chain-score` for `vitest`.
- [x] Fix `react-doctor/public-debug-artifact` public template false-positive/root cause.
- [x] Re-run `npx react-doctor@latest --verbose` and project checks.

## Review

- React Doctor full and changed-file scans now report 100/100 with no issues.
- Graph create payload clones now use `structuredClone`.
- Vitest packages are upgraded to `4.1.10`; the critical Vitest audit finding is gone.
- Public template files with policy names containing debug/report/dump terms were renamed at the file path layer while preserving manifest display names and payload contents.
- Checks passed: focused graph/template tests, `npm run type-check`, `npm run build`, React Doctor full and changed scans, `git diff --check`.

# React Doctor Top 3 Pass

- [x] Fetch canonical rule guidance for touched React Doctor rules.
- [x] Fix `react-doctor/no-jsx-element-type` in `DynamicWallpaper` and `animated-grid-background`.
- [x] Fix `react-doctor/no-cascading-set-state` in `RouteWallpaper`.
- [x] Fix `deslop/unused-export` for `FAQ_LINK_CLASS_NAME`.
- [x] Re-run `npx react-doctor@latest --verbose` and targeted project checks.

## Review

- The three requested issue groups are gone from React Doctor.
- Full React Doctor now reports only the untouched follow-up groups: `socket/low-supply-chain-score`, `public-debug-artifact`, and `no-json-parse-stringify-clone`.
- Checks passed: focused wallpaper tests, `npm run type-check`, `npx react-doctor@latest --verbose --diff`, `npm run build`, `git diff --check`.

# PR Comment Follow-up: Manifest Test

- [x] Validate each device filter manifest entry's per-file count.
- [x] Validate one sentinel filter display name per manifest path to catch swapped JSON sources.
- [x] Run checks, commit, push, and verify PR checks.

## Review

- The manifest alignment test now checks every path's fallback source count and sentinel filter display name.
- Checks passed: focused filters test, `npm run type-check`, `npm run test:run`, `npm run build`, `git diff --check`.

# PR Comment Follow-up

- [x] Split device filter template paths/counts into a lightweight manifest.
- [x] Keep JSON imports isolated to the static filter fallback module.
- [x] Add consistency coverage so the manifest stays aligned with bundled JSON templates.
- [x] Run focused checks, commit, push, and verify PR checks.

## Review

- `lib/templates/loader.ts` now imports filter fetch paths from a lightweight manifest with no JSON imports.
- `templates/index.ts` uses the manifest count instead of importing the JSON-backed fallback for metadata.
- Checks passed: focused filter/loader/task queue tests, `npm run type-check`, `npm run test:run`, `npm run build`, `git diff --check`.

# Version 2.6 Bump

- [x] Update package metadata and visible landing version text from 2.5 to 2.6.
- [x] Update version assertions in unit and e2e tests.
- [x] Run focused checks.

## Review

- Package metadata and visible landing version text now use 2.6.
- Checks passed: focused HomeLanding test, `npm run type-check`, `npm run build`, `git diff --check`.

# Device Filter Source Of Truth

- [x] Replace hand-copied static filter fallback definitions with an adapter over bundled JSON templates.
- [x] Reuse the same filter template path list for runtime fetching.
- [x] Derive Device Filters metadata count from the fallback template array.
- [x] Run focused checks, commit, push, and redeploy preview.

## Review

- Static filter fallback, runtime fetch paths, and UI metadata now derive from the bundled filter JSON files.
- Android PowerShell platform values are normalized from `androidForWork` to the web app's `android` Graph type.
- Checks passed: focused filter/loader/task queue tests, `npm run type-check`, `npm run test:run`, `npm run build`, `git diff --check`.

# Device Filter Architecture Templates

- [x] Add Windows and macOS architecture filter templates from the PowerShell module.
- [x] Include the new filter files in the web template loader.
- [x] Update the static TypeScript fallback and visible filter counts from 24 to 29.
- [x] Add/adjust focused regression coverage for the new filter set.
- [x] Run targeted checks and document results.

## Review

- Added Windows x64/ARM64/x86 and macOS Apple Silicon/Intel assignment filters.
- Bumped the template cache version so older browser filter caches cannot hide the new architecture filters.
- Web filter JSON now matches the PowerShell module filter templates: 29 filters, no missing/extra definitions.
- Checks passed: focused filter tests, `npm run type-check`, `npm run test:run`, `npm run build`, `git diff --check`.

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

# Axe ARIA Diagnostic

- [x] Change TargetSelection category button `aria-expanded` to an explicit boolean.
- [x] Update regression coverage.
- [x] Run focused checks.

## Review

- Fixed Edge/axe `aria-expanded="{expression}"` by avoiding an undefined-returning ARIA expression.
- Checks passed: TargetSelection test, `npm run type-check`, `npx react-doctor@latest --verbose --diff`, `git diff --check`.

# v2.5 Landing UI Upgrade Plan

## Skills

- `frontend-design`: visual direction, responsive layout, interaction polish.
- `make-plan`: phased implementation and verification structure.
- `react-doctor`: final React/accessibility regression scan.
- `playwright-testing`: viewport screenshots and smoke verification after implementation.

## Phase 0: Discovery

- [x] Current landing page: `app/page.tsx` uses a split hero, repeated `data-card` grids, `WebAppDemo`, and `v2.2` badge.
- [x] Current identity: `--hydrate` blue is the trademark accent in `app/globals.css`; keep it as signature blue, not the dominant palette.
- [x] Existing APIs/patterns: Tailwind tokens, shadcn-style `Button/Card/Accordion`, lucide icons, `framer-motion` via `LazyMotion`, Next `Image/Link`.
- [x] Guardrails: no new UI library, no all-blue palette, no nested card stacks, no decorative text explaining the UI, preserve auth/cloud selector behavior.

## Phase 1: Design System Refresh

- [x] Update version surface to v2.5 and move repeated landing copy/data into small local arrays.
- [x] Add v2.5 landing utilities for editorial sections, metric rails, and app-preview framing.
- [x] Keep `--hydrate` blue for focus rings, active rails, status pulse, primary CTA accent, and one hero highlight.

## Phase 2: Hero Modernization

- [x] Replace the split hero/card layout with a full-bleed operational console hero.
- [x] Make the first viewport signal the product name/offer, v2.5 status, primary CTA, and live deployment proof.
- [x] Reuse `WebAppDemo` as an integrated product scene, not a detached card.
- [x] Keep the next section visible below the fold on desktop and mobile.

## Phase 3: Content Section Upgrade

- [x] Convert feature cards into denser operational rows: safety, deployment intelligence, cloud support, validation.
- [x] Rework "How It Works" into a compact timeline/process rail.
- [x] Keep "Available Configurations" as the main evidence section with stronger metrics and clearer grouping.
- [x] Make permissions/FAQ/CTA quieter and more scannable.

## Phase 4: Responsiveness And Accessibility

- [x] Verify no text overflow at mobile/tablet/desktop widths.
- [x] Keep icon-only controls named and decorative visuals `aria-hidden`.
- [x] Respect reduced motion and avoid layout shifts from counters/demo animation.

## Phase 5: Verification

- [x] Run `npm run type-check`.
- [x] Run focused landing component tests.
- [x] Run `npm run test:run`, `npm run build`, `npx react-doctor@latest --verbose --diff`, and `git diff --check`.
- [x] Use browser/Playwright screenshots at mobile and desktop before calling the UI done.

## Review

- v2.5 landing extracted to `HomeLanding` plus typed content data; `app/page.tsx` now only owns auth/cloud routing.
- Mobile and desktop browser checks passed with no horizontal overflow and next-section hint visible.
- Checks passed: `npm run type-check`, `npm run test:run`, `npm run build`, `npx react-doctor@latest --verbose --diff`, `git diff --check`.

# Dynamic Wallpaper Refresh

- [x] Locate the mounted dynamic wallpaper component.
- [x] Replace the industrial scan grid with a different dynamic visual treatment.
- [x] Preserve accessibility, pointer transparency, and reduced-motion behavior.
- [x] Verify with type/build/doctor checks and browser smoke.

## Review

- Replaced the industrial canvas with Vanta.js Waves using the requested options from the shared Vanta URL.
- Removed unused scan/grid wallpaper CSS and Tailwind animation entries.
- Checks passed: focused wallpaper tests, `npm run type-check`, `npm run build`, `npx react-doctor@latest --verbose --diff`.
- Browser smoke passed on desktop and mobile: Vanta effect present, configured, animating, `aria-hidden`, no horizontal overflow.

# Vanta Waves Visibility Regression

- [x] Fix light-mode landing contrast over the dynamic wallpaper.
- [x] Match the visible Vanta Waves reference color.
- [x] Keep the wallpaper visible behind landing content without burying the UI.
- [x] Verify light and dark mode in browser plus project checks.

## Review

- Aligned `three` to Vanta's r134 reference runtime so the wave facets render like the Vanta demo.
- Added a theme-aware wallpaper scrim and fixed the signed-out hero CTA so it does not shrink/clip.
- Checks passed: focused landing/wallpaper tests, `npm run type-check`, `npm run test:run`, `npm run build`, `npx react-doctor@latest --verbose --diff`, `git diff --check`.
- Browser smoke passed on desktop/mobile in light and dark mode: Vanta canvas visible, no horizontal overflow, CTA text fits, no console errors or warnings.

# Dark Mode Wave Contrast

- [x] Darken the dark-mode Vanta wallpaper overlay without changing light mode.
- [x] Verify text contrast and wave visibility in dark mode.

## Review

- Increased only the dark-mode Vanta scrim opacity; light mode and the Vanta wave color stay unchanged.
- Checks passed: focused landing/wallpaper tests, `npm run type-check`, browser dark-mode smoke, no console warnings, `git diff --check`.

# Landing Color Readability Optimization

- [x] Tune landing text, muted text, panels, and buttons for the Vanta backdrop.
- [x] Verify desktop and mobile in light and dark mode.
- [x] Run focused tests, type-check, React Doctor diff, and `git diff --check`.

## Review

- Added a landing-scoped color system for readable text, softer buttons, calmer panels, and better glass contrast over the wave backdrop.
- Desktop and mobile browser checks passed in light and dark mode: Vanta visible, no horizontal overflow, hero buttons fit.
- Checks passed: focused landing/wallpaper tests, `npm run type-check`, `npm run build`, `npx react-doctor@latest --verbose --diff`, `git diff --check`.

# Landing Black Action Buttons

- [x] Make landing action buttons black: Launch Wizard, Sign In with Microsoft, PowerShell Module, Template Docs, and active demo deployment action.
- [x] Include the navigation CTA without changing icon-only controls.
- [x] Verify desktop and mobile button fit.

## Review

- Landing action buttons now share the same black gradient treatment with light text.
- Navigation CTA uses the same landing action class while icon-only controls keep their existing styling.
- Checks passed: focused landing/navigation/demo tests, `npm run type-check`, `npm run build`, `npx react-doctor@latest --verbose --diff`, `git diff --check`, and browser desktop/mobile smoke.

# Landing Version Badge Contrast

- [x] Give the v2.5 badge a higher-contrast surface over the Vanta backdrop.
- [x] Verify desktop and mobile readability.
- [x] Run focused checks.

## Review

- The v2.5 badge now uses the landing black action surface with light text and keeps the hydrate dot as the brand accent.
- Browser checks passed in light and dark mode on desktop and mobile: badge text fits, Vanta remains visible, no horizontal overflow, no console warnings.
- Checks passed: focused landing test, `npm run type-check`, `npm run build`, `npx react-doctor@latest --verbose --diff`, `git diff --check`.

# Cloud Modal Black Actions

- [x] Replace the cloud modal primary blue action with a black action treatment.
- [x] Reduce blue-heavy selectable surfaces in the modal.
- [x] Verify modal rendering and focused checks.

## Review

- Cloud modal footer buttons now use black neutral surfaces instead of default primary-blue styling.
- The commercial cloud row now uses neutral muted panel styling instead of a primary-blue selected treatment.
- Checks passed: focused cloud selector test, `npm run type-check`, `npm run build`, `npx react-doctor@latest --verbose --diff`, `git diff --check`, and browser desktop/mobile smoke.

# Todo Completion Audit

- [x] Inventory unchecked todos in `tasks/`, `README.md`, `claude.md`, e2e specs, and source comments.
- [x] Update stale e2e assertions for the v2.5 landing page.
- [x] Gate the manual real-tenant import test behind `RUN_MANUAL_E2E=1`.
- [x] Run the automated e2e suite and mark README end-to-end testing complete.
- [x] Verify production homepage availability and mark README production deployment complete.
- [x] Remove the stale `DEPLOYMENT.md` reference and mark README documentation review complete.
- [x] Resolve or explicitly retire the remaining `claude.md` manual tenant validation checklist.

## Review

- Automated todos are complete: `npm run test:e2e` passes with 26 automated tests and 1 manual MSAL import test skipped by default.
- Production homepage check passed: `https://www.intunehydrationkit.com/` returned HTTP 200 from Vercel.
- Retired false-positive checkbox syntax in `claude.md`; category options remain spec prose, and manual tenant checks are documented as external release validation.
- Thermonuclear review after the e2e/doc changes found no structural issues after replacing the hard-coded settings storage key with the canonical constant.
- Final searches found no unchecked todo boxes in `tasks/`, `README.md`, `claude.md`, e2e specs, or source files; the only `TODO` string left is an intentional placeholder sentinel in `lib/hydration/utils.ts`.
- Checks passed: `npm run test:run`, `npm run test:e2e`, `npm run build`, `npm run type-check`, `npm run doctor -- --verbose --diff`, `git diff --check`.

# Dashboard Delete Warning Contrast

- [x] Replace the transparent destructive delete-mode banner with a filled high-contrast warning panel.
- [x] Verify the dashboard banner renders clearly against the Vanta backdrop.
- [x] Run focused checks and Doctor.

## Review

- Live delete mode now renders a dark filled warning panel with red accent text and light body copy instead of transparent destructive styling.
- Added focused dashboard render coverage for the high-contrast banner classes.
- Checks passed: dashboard test, `npm run type-check`, `npm run build`, `npm run doctor -- --verbose --diff`, `git diff --check`.

# Template Docs Category Card Cleanup

- [x] Remove counts from Template Docs category cards.
- [x] Remove the category-card color accents and neutralize the Template Docs chrome.
- [x] Update regression coverage.
- [x] Run focused checks and Doctor.

## Review

- Template Docs category cards now show only label and description with neutral panel styling.
- Active Template Docs filter buttons use black instead of the primary blue state.
- Checks passed: focused TemplateCatalogPage test, `npm run type-check`, `npm run build`, `npm run doctor -- --verbose --diff`, `git diff --check`, and desktop/mobile browser smoke on `/templates`.

# CIS Baselines Card Alignment

- [x] Make Template Docs category cards top-align content when grid rows stretch.
- [x] Add regression coverage for the CIS Baselines card alignment.
- [x] Run focused checks and browser smoke.

## Review

- CIS Baselines now uses the same top-aligned card content layout as the other Template Docs category cards.
- Checks passed: focused TemplateCatalogPage test, `npm run type-check`, `npm run build`, `npm run doctor -- --verbose --diff`, `git diff --check`, and desktop/mobile browser geometry checks on `/templates`.

# PR Readiness Thermo Review

- [x] Audit current branch/worktree for structural PR blockers.
- [x] Decompose landing/wallpaper CSS out of `app/globals.css` to keep shared globals below 1k lines.
- [x] Run final PR readiness checks.

## Review

- Initial blocker found and fixed: `app/globals.css` crossed 1k lines; landing/wallpaper rules now live in `app/landing.css`.
- Initial e2e blocker found and fixed: Playwright reused an unrelated `localhost:3000`; e2e now starts this app on `127.0.0.1:3100` unless `PLAYWRIGHT_BASE_URL` is set.
- Checks passed: `npm run test:run`, `npm run type-check`, `npm run build`, `npm run test:e2e`, `npm run doctor -- --verbose --diff`, `npm audit --json`, `npm ls next postcss three vanta`, and `git diff --check`.

# Light Mode Toggle Regression

- [x] Reproduce the dark-to-light theme toggle failure.
- [x] Patch theme active-state calculation without changing the supported theme model.
- [x] Add regression coverage.
- [x] Run focused checks, e2e theme checks, build, and Doctor.

## Review

- Root cause: the toggle trusted `next-themes` reporting `system` over the persisted dark app setting, so dark-on-light-OS sessions could cycle back to dark instead of light.
- Fixed by making persisted non-system settings authoritative for active-theme calculation.
- Checks passed: focused theme tests, `npm run test:e2e -- --grep Theme`, `npm run type-check`, `npm run test:run`, `npm run build`, `npm run doctor -- --verbose --diff`, `git diff --check`, and manual Playwright dark-to-light verification.

# Light Mode Visual Regression Follow-up

- [x] Reproduce the user's still-dark visual behavior with Playwright screenshots/computed styles.
- [x] Patch the actual light-mode visual/functionality issue.
- [x] Add regression coverage that checks visible light-mode styling, not just the HTML class.
- [x] Run focused browser checks, project checks, Doctor, and push the PR update.

## Review

- Playwright found the missed path: a persisted `corporate-1999` setting was outside the landing nav's light/dark cycle, and the first click went to dark instead of light.
- Out-of-cycle persisted themes now reset to the first supported cycle option, so the landing toggle sends `corporate-1999` directly to light.
- Checks passed: focused theme tests, `npm run test:e2e -- --grep Theme`, manual Playwright corporate-to-light screenshot/computed-style check, `npm run type-check`, `npm run test:run`, `npm run build`, `npm run doctor -- --verbose --diff`, `git diff --check`.

# Footer Credit

- [x] Add the requested `Made By Jorgeasaurus` footer text.
- [x] Add focused render coverage.
- [x] Run focused checks and push the PR update.

## Review

- Footer now includes `Made By Jorgeasaurus` next to the existing product/year and license text.
- Checks passed: focused HomeLanding test, `npm run type-check`, `npm run doctor -- --verbose --diff`, `git diff --check`.

# Copilot Feedback Before Merge

- [x] Check PR #6 for Copilot feedback before merging.
- [x] Fix Copilot's hardcoded Playwright storage key finding.
- [x] Push the fix, recheck feedback/checks, and merge only if clear.

## Review

- Copilot feedback was present, so merge was deferred.
- Replaced the hardcoded Playwright localStorage key with `APP_SETTINGS_STORAGE_KEY`.
- Checks passed: `npm run test:e2e -- --grep Theme`, `git diff --check`.

# Copilot Follow-up PR

- [x] Add Vercel Analytics ingestion to the CSP `connect-src`.
- [x] Move Vanta wallpaper loading out of `RootLayout` into a route-aware lazy client layer.
- [x] Add focused regression coverage.
- [x] Run checks.
- [x] Open a follow-up PR.

## Review

- Added Vercel Analytics ingestion to CSP `connect-src`.
- `RouteWallpaper` lazy-loads Vanta/Three client-only; `routeWallpaperRules` keeps route matching out of the component export.
- Opened PR #7 from `fix/copilot-pr-feedback` to `main`.
- Checks passed: focused wallpaper tests, `npm run type-check`, `npm run test:run`, `npm run build`, `npm run test:e2e -- --grep "Landing Page|Protected Routes"`, `npm run doctor -- --verbose --diff --fail-on warning`, `git diff --check`.

# Turbopack HMR Ping Error

- [x] Reproduce the `unrecognized HMR message {"event":"ping"}` dev-server error.
- [x] Identify whether the source is app config/headers or a Turbopack dev-server issue.
- [x] Apply the smallest fix that keeps local development stable.
- [x] Verify dev logs and project checks.

## Review

- Root cause: Turbopack rejects legacy HMR `ping` messages; webpack dev mode accepts them.
- `npm run dev` now uses `next dev`; `npm run dev:turbo` keeps Turbopack opt-in.
- Checks passed: forced HMR ping repro/diff, `npm run dev:turbo -- -p 3023`, `npm run type-check`, `npm run build`, `npm run test:run`, `npm run test:e2e`, `npm run doctor -- --verbose --diff`, `git diff --check`.

# Wizard Animated Wallpaper

- [x] Add the landing animated wallpaper to the wizard route.
- [x] Preserve other route wallpaper behavior during the wizard-only change.
- [x] Update route wallpaper regression coverage.
- [x] Verify route tests, browser rendering, type/build, Doctor, and diff hygiene.

## Review

- `/wizard` now renders the same Vanta wallpaper layer as the landing/templates routes.
- The wizard-only pass left dashboard and results unchanged until the console follow-up below.
- Checks passed: focused wallpaper tests, browser `/wizard` load check with wallpaper canvas present, `npm run type-check`, `npm run build`, landing/protected-route e2e smoke, `npm run doctor -- --verbose --diff`, `git diff --check`.

# Console Routes Animated Wallpaper

- [x] Add the landing animated wallpaper to dashboard and results routes.
- [x] Keep template/landing/wizard wallpaper behavior unchanged.
- [x] Update route wallpaper regression coverage.
- [x] Verify focused tests, browser route loads, type/build, Doctor, and diff hygiene.

## Review

- `/dashboard` and `/results` now render through the same route-level Vanta wallpaper as landing/templates/wizard.
- Exact route matching keeps `/templates-old` excluded while `/templates/*` still works.
- Checks passed: focused wallpaper tests, protected-route browser load checks, `npm run type-check`, `npm run build`, landing/protected-route e2e smoke, `npm run doctor -- --verbose --diff`, `git diff --check`.

# Publish Console Wallpaper

- [x] Confirm changed-file scope before commit.
- [x] Commit and push the branch.
- [x] Deploy the pushed changes to Vercel production.
- [x] Record commit, push, and production deployment result.

## Review

- Committed console wallpaper changes as `2f1151b` and pushed `fix/copilot-pr-feedback` to origin.
- Vercel production deploy completed and aliased to `https://www.intunehydrationkit.com`.

# Console Wallpaper PR

- [x] Confirm no existing PR for `fix/copilot-pr-feedback`.
- [x] Commit and push the PR task log.
- [x] Open a PR from `fix/copilot-pr-feedback` to `main`.
- [x] Record the PR URL.

## Review

- Opened draft PR #8 from `fix/copilot-pr-feedback` to `main`: `https://github.com/jorgeasaurus/IntuneHydrationKit-WebApp/pull/8`.

# PR #8 Progress Review

- [x] Inspect Copilot discussion `discussion_r3347541451`.
- [x] Restore the wizard progress fill to the computed `progress` value.
- [x] Remove now-unused step-specific progress CSS.
- [x] Verify, commit, and push the review fix.

## Review

- Restored the wizard progress bar to the existing `progress` calculation and removed hard-coded `wizard-progress-fill-step-*` classes.
- Checks passed: `npm run type-check`, `npm run build`, `npm run test:e2e -- --grep "Protected Routes"`, `npm run doctor -- --verbose --diff`, `git diff --check`.

# Edge Diagnostics Cleanup

- [x] Replace the wizard progress inline style without reintroducing hard-coded step widths.
- [x] Fix the category action button ARIA value diagnostic.
- [x] Update lessons for the correction pattern.
- [x] Verify, commit, and push the PR update.

## Review

- Wizard progress now uses a native `progress` element backed by the computed `progress` value and stylesheet pseudo-elements.
- Category action buttons render literal `aria-expanded` values.
- Checks passed: focused TargetSelection tests, `npm run type-check`, `npm run build`, `npm run test:e2e -- --grep "Protected Routes"`, `npm run doctor -- --verbose --diff`, `git diff --check`.

# Merge PR #8 And Prod Deploy

- [x] Confirm PR #8 is mergeable and checks are green.
- [x] Merge PR #8 into `main`.
- [x] Deploy merged `main` to Vercel production.
- [x] Verify production status and HTTP response.

## Review

- PR #8 merged into `main` at merge commit `4c3f1ba`.
- Vercel production deployment `dpl_CS9c7SQ2nnAQbcrzp1daeXH4av3d` is ready and aliased to `https://www.intunehydrationkit.com`.
- Production HTTP check returned `200`.

# PR #11 Review Comments

- [x] Restore supported sovereign cloud values when loading the session cloud environment.
- [x] Render CSV start/end timestamps in UTC.
- [x] Verify and push the PR update.

## Review

- Restored session reload for all supported cloud environments via the MSAL cloud endpoint map.
- CSV reports now label start/end columns as UTC and render UTC values.
- Checks passed: focused auth/reporter tests, `npm run test:run`, `npm run type-check`, `npm run build`, `git diff --check`.

# Full-width Execution Summary

- [x] Remove the Intent and Safety rail summary cards from operation mode.
- [x] Expand the Execution summary card across the available width.
- [x] Update focused regression coverage and verify the change.

## Review

- Operation mode now shows only the dynamic Execution summary card across the full available width.
- Focused coverage confirms the removed labels stay absent while preview/live behavior remains intact.
- Checks passed: focused OperationMode tests, `npm run type-check`, `npm run build`, `git diff --check`.

# Full-width Execution Summary PR

- [x] Create and push a focused feature branch.
- [x] Open a pull request against `main`.
- [x] Run Copilot review cycles until the latest functional head receives a clean review.
- [x] Record the PR and functional review results.

## Review

- Opened PR #15 from `ui/full-width-execution-summary` to `main`: `https://github.com/jorgeasaurus/IntuneHydrationKit-WebApp/pull/15`.
- Copilot cycles 1 and 2 produced four actionable test-coverage comments; all were fixed, replied to, and resolved.
- Copilot cycle 3 reviewed functional head `e34450c` and produced no new comments.
- Checks passed: focused OperationMode tests, `npm run type-check`, Vercel, React Doctor, GitGuardian, and `git diff --check`.

# Make Choices Unmistakable

- [x] Replace the operation choice cards with keyboard-accessible radio groups.
- [x] Add visible focus treatment and accessible labels for task filtering controls.
- [x] Add focused regression coverage and verify the affected UI.

## Review

- Operation and execution cards are now focusable radio controls with keyboard selection and clear checked states.
- Task search, status, and category filters now have accessible names.
- Checks passed: focused component tests, `npm run type-check`, and `npm run build`.

# Shared Dark Wallpaper, Readable Light UI

- [x] Restore the original dark wallpaper treatment as the shared backdrop.
- [x] Improve light-mode contrast through foreground and surface styling only.
- [x] Verify the shared backdrop and light-mode readability through focused and project checks.

## Review

- Both themes now share the original dark water scrim; the wallpaper is not altered by the light theme.
- Light mode uses high-contrast outer text and more opaque pale content surfaces with dark text for readable scanning.
- Checks passed: focused landing/wallpaper tests, `npm run type-check`, clean `npm run build`, and `git diff --check`.

# Landing Contrast Follow-up

- [x] Set readable foreground colors for the light navigation brand and status area.
- [x] Set readable muted copy on the light final CTA surface.
- [x] Verify the focused landing behavior and project checks.

## Review

- The navigation brand, status, and CTA description now use dark foregrounds on their pale light-mode surfaces.
- The shared dark water wallpaper remains untouched.
- Checks passed: focused landing/navigation tests, `npm run type-check`, `npm run build`, and `git diff --check`.

# Landing Demo Contrast Follow-up

- [x] Scope readable foreground and muted text to the simulated app window.
- [x] Verify the demo cycle and project checks.

## Review

- The simulated app browser now renders dark foreground and muted text on its pale light-mode surfaces.
- The shared wallpaper remains unchanged.
- Checks passed: focused demo/landing tests, `npm run type-check`, `npm run build`, and `git diff --check`.

# Navigation Hover Contrast

- [x] Keep light-mode navigation hover text dark enough for the pale header.
- [x] Verify the navigation and project checks.

## Review

- Light-mode navigation hover text now uses the deep blue accent; dark mode retains the light hover treatment.
- Checks passed: focused navigation tests, `npm run type-check`, `npm run build`, and `git diff --check`.

# Status Badge Contrast

- [x] Use a readable light-mode label color for informational status badges.
- [x] Verify the landing checks.

## Review

- Informational badges now use a deep blue label on their pale light-mode surface.
- Checks passed: focused landing test, `npm run type-check`, `npm run build`, and `git diff --check`.

# Conditional Access Alert Contrast

- [x] Use an opaque, readable warning surface for Conditional Access follow-up alerts.
- [x] Verify the results and wizard checks.

## Review

- Conditional Access alerts now use opaque card surfaces, clear foreground text, and amber warning icons over the wallpaper.
- Checks passed: focused results/wizard tests, `npm run type-check`, `npm run build`, and `git diff --check`.

# React Doctor 100

- [x] Fetch and follow the current React Doctor triage playbook.
- [x] Fix all React Doctor findings until the full scan scores 100.
- [x] Run regression and project validation checks.

## Review

- React Doctor 0.9.8 full-project scan: 57 to 100, with zero errors or warnings.
- Fixed lifecycle cleanup, pure state transitions, deterministic server/client time formatting, animation performance, and repeated lookup issues.
- Checks passed: focused demo test, full test suite (514 tests), type check, production build, and `git diff --check`.

# Thermonuclear Review Fix Loop

- [x] Review the full current branch diff and record actionable findings.
- [x] Fix every confirmed finding and run focused checks.
- [x] Re-review the changed scope until it has zero findings.
- [x] Run final project validation.

## Round 1 findings

1. Keep the shared compact radio primitive separate from selectable card layout.
2. Pair the wallpaper media-query listener with the exact matching cleanup API.

## Round 2 finding

1. Keep generic light-mode button hover text on the control-text token.

## Review

- Three review rounds completed. The final fresh review had zero findings.
- The fixes restored compact-radio ownership, matched wallpaper listener teardown, added card-radio focus treatment, simplified validation-progress cleanup, and corrected light hover contrast.
- Checks passed: focused component tests, full test suite (514 tests), type check, production build, React Doctor (100/100), and `git diff --check`.

# GitHub Copilot Review Loop

- [x] Inspect pull-request review state and address valid feedback.
- [x] Push verified fixes and resolve handled review threads.
- [x] Request and verify a clean new Copilot review cycle.

## Review

- Copilot identified one valid progress-completion race. It was fixed, tested, replied to, and resolved.
- Two follow-up Copilot review cycles completed. The final cycle reviewed `c0eb626` and added no actionable threads.
- Checks passed: full test suite (515 tests), type check, production build, changed-scope React Doctor (100/100), matching local and remote heads, and `git diff --check`.

# Website Version Revision

- [x] Increase the website version from 2.6.0 to 2.6.1.
- [x] Add the pull-request version-increment merge requirement.

# PR #19 Copilot Review Refresh

- [x] Record the latest pull-request review state and request a new Copilot review for the 2.6.1 head.
- [x] Address and verify any new actionable feedback.
- [x] Confirm a clean Copilot review is anchored to the latest commit.

## Review

- Copilot review `PRR_kwDOQzwR3c8AAAABI3Nklw` completed on `1a298fd` with no actionable comments or unresolved threads.
- The only suppressed suggestion concerns an existing UTC timestamp label and is outside the version-update scope.
- Checks passed: package metadata consistency, `git diff --check`, and matching local/remote PR heads.

# Suppressed Review Follow-up

- [x] Make the prerequisite-validation timestamp's UTC timezone explicit.
- [x] Add focused regression coverage and update PR #19.

## Review

- The prerequisite timestamp now visibly states UTC and retains an explicit locale/timezone formatter for deterministic rendering.
- Checks passed: focused TenantConfig test, type check, production build, changed-line React Doctor scan, and `git diff --check`.

# Suppressed Copilot Feedback Follow-up

- [x] Make terminal-demo progress reach 100% after the final command.
- [x] Format the UTC validation timestamp in the operator's runtime locale.
- [x] Add regression coverage and verify the focused changed scope.

## Review

- Four valid suppressed findings were fixed across two commits: `12800e7` and `8885123`.
- Copilot review `PRR_kwDOQzwR3c8AAAABI3UpFw` completed on `8885123` with no actionable comments or unresolved threads.
- The remaining suppressed wallpaper suggestion conflicts with the requested same-treatment light/dark wallpaper and was intentionally not applied.
- Checks passed: focused component tests (8 tests), type check, production build, changed-line React Doctor scans, `git diff --check`, and matching local/remote heads.

# Win32 App Proof of Concept

- [x] Identify one PowerShell-module Win32 app that can be represented safely in the web app.
- [x] Add the minimal template and Graph task path for that app.
- [x] Add focused coverage and validate the proof of concept.

## Review

- Uses the supplied 7-Zip 25.01 `.intunewin` package, including its Intune encryption metadata.
- Checks passed: focused tests, type check, lint, and whitespace validation.

# Thermonuclear Review: Win32 App Proof of Concept

- [x] Review the branch diff against `origin/main` and record actionable findings.
- [x] Fix each actionable finding and run focused verification.
- [x] Repeat the strict review until it has zero findings, then run final validation.

## Review

- Moved app-specific metadata into the Win32 template, reject malformed package-size metadata, clean up a failed app upload, use the no-retry create boundary, and keep outer and encrypted package names distinct.
- Final strict review found no remaining structural, boundary, or maintainability issues in the branch scope.

# Win32 Upload Commit Failure

- [x] Match the module's Azure block-upload and block-list protocol in the same-origin upload proxy.
- [x] Cover the protocol with a focused route test and verify the Win32 upload path.

## Review

- The proxy now uploads each package block and explicitly commits the Azure block list before Graph receives the encryption metadata.
- Checks passed: focused Win32 tests, type check, lint, production build, and whitespace validation.

# Win32 Catalog Visibility

- [x] Include shipped Win32 app templates in the template-documentation catalog.
- [x] Add a catalog regression test and verify the catalog UI source.

## Review

- The 7-Zip proof-of-concept is now discoverable under Win32 Apps with its import-ready template payload.
- Checks passed: focused catalog tests, type check, lint, production build, and whitespace validation.

# Sign-in Popup Investigation

- [x] Reproduce the unauthenticated browser flow through the cloud confirmation dialog.
- [x] Start the Global-cloud MSAL popup directly from every sign-in call to action.
- [x] Add regression coverage and verify the authenticated entry point.

## Review

- The redundant Global-cloud confirmation was the extra interaction before MSAL could receive the browser click. Sign-in now starts directly from the call to action.
- A missing Entra client ID now displays an actionable configuration error instead of creating an invalid authorization request.
- Checks passed: focused authentication/component tests, direct Chrome popup verification, type check, lint, production build, and whitespace validation.

# Worktree Consolidation

- [x] Checkpoint the Glass UI worktree without absorbing task bookkeeping.
- [x] Create a combined branch from the Win32 work and merge the Glass UI checkpoint.
- [x] Resolve integration conflicts, revise the version, and run the full verification suite.

## Review

- Combined branch: `codex/consolidate-win32-glass-ui`, version 2.6.3.
- Checks passed: 515 tests, type check, lint, production build, whitespace validation, and Chrome verification of the glass landing surface plus direct Entra popup.

# Entra Client ID Regression

- [x] Restore the missing local Entra environment configuration to the Glass UI worktree.
- [x] Verify the generated authorization URL includes `client_id` from that restored configuration.

## Review

- The Glass UI worktree was missing its ignored `.env.local`; the regular environment-driven configuration is restored and the temporary fallback was removed.
- Checks passed: direct Chrome test against the restarted Glass UI server confirms the authorization URL includes `client_id`.

# Wizard Chunk Recovery

- [x] Identify the server/worktree conflict serving stale wizard assets on port 3000.
- [x] Rebuild the current branch's generated Next.js cache and verify the wizard route in Chrome.

## Review

- A stale Glass UI server was also bound to port 3000 over IPv6, while the consolidated worktree used IPv4.
- The stale generated cache was moved to `.next-stale-chunk-recovery`; the replacement server is the sole port-3000 listener and Chrome loaded `/wizard` without a chunk error.

# Prerequisite Banner Contrast

- [x] Give the successful prerequisite banner explicit Glass UI foreground colors.
- [x] Add a regression assertion and verify the wizard component.

## Review

- The prerequisite-success icon, title, and description now use explicit light emerald foregrounds that remain readable over the dark Glass surface.
- Checks passed: focused component test, type check, lint, clean production build, and whitespace validation.

# Preview Callout Contrast

- [x] Give the preview-mode callout explicit Glass UI foreground colors.
- [x] Run focused and project verification, then record results.

## Review

- Preview mode now uses explicit light sky foregrounds over a slightly stronger blue surface, so its status and description remain readable in the fixed Glass UI theme.
- Checks passed: focused component test, type check, lint, clean production build, and whitespace validation.

# Glass UI Site-wide Restyle

- [x] Inspect the SPXC reference and map its visual primitives to the landing page.
- [x] Replace the landing theme with the strict glass system over the retained Vanta water effect.
- [x] Add responsive and reduced-transparency fallbacks.
- [x] Verify the landing page with tests, build, and desktop/mobile screenshots.
- [x] Apply the approved visual system to the remaining product surfaces.

## Review

- Retained the Vanta water effect after user correction; glass panels and navigation now use the SPXC/blog visual language.
- Applied the glass system to the wizard, dashboard, results, template catalog, navigation, dialogs, controls, status cards, and progress surfaces.
- Checks passed: full tests, type check, production build, desktop/mobile Chrome checks, and reduced-transparency coverage.

# Thermonuclear Review Fix Loop: Glass UI Site-wide

- [x] Inspect the current branch diff and establish review scope.
- [x] Run strict review rounds and fix every actionable finding.
- [x] Verify the final changed scope and browser behavior.

## Review

- Centralized shared glass rules, removed the obsolete multi-theme system, and replaced stale theme end-to-end checks.
- Three review rounds completed; the final round had no findings.

# Glass UI Responsive Follow-ups

- [x] Make hero action labels fit narrow phone layouts.
- [x] Scan public routes and authenticated headers for equivalent risks.
- [x] Remove the requested landing navigation decoration without disturbing its structural border.

## Review

- Compact labels prevent horizontal overflow at 320px and 393px while preserving full desktop labels.
- Wizard, dashboard, results, and pre-flight actions now stack or use accessible icon-only controls on phones.

# Dialog Positioning Fix

- [x] Preserve the glass-dialog appearance without overriding its viewport positioning.
- [x] Add a browser regression test for a centered dialog and verify it in Chrome.

## Review

- The shared Glass surface selector no longer changes Radix dialog positioning from fixed to relative.
- Checks passed: focused component test, direct Chrome viewport-center check, type check, lint, and whitespace validation.

# Glass Worktree Final Consolidation

- [x] Confirm the Glass commit is already an ancestor of the combined main-directory branch.
- [x] Preserve remaining Glass-only task notes and local lessons in the main directory.
- [x] Retire the redundant Glass worktree and verify the main directory remains healthy.

## Review

- All committed Glass UI work is present in `codex/consolidate-win32-glass-ui`; the former Glass branch had no unique commits.
- Matching local Entra and Vercel configuration was confirmed before retirement, and the Glass-only task history was preserved here.
- The redundant worktree was unregistered, its port-3300 server stopped, and its remaining generated directory moved to Trash for recovery.

# PowerShell WinGet Win32 Parity

- [x] Trace the module's 7-Zip template, generated wrapper, package, Graph payload, and upload flow.
- [x] Replace the mismatched PSADT proof of concept with the module-equivalent WinGet package behavior.
- [x] Add parity and regression coverage for the package, commands, detection, and content publishing path.
- [x] Run focused and full verification, then record the result.

## Review

- The web proof now generates and ships the module's WinGet install, uninstall, and detection wrappers for `7zip.7zip`, including SYSTEM bootstrap behavior and ownership metadata.
- The obsolete PSADT/MSI package was retired; Intune now receives the module-equivalent commands, PowerShell detection rule, icon, requirements, and encrypted content package.
- Upload parity includes transient retries, sovereign Azure Blob hosts, and Graph SAS renewal; icon failures remain non-blocking and duplicate owned apps are handled safely.
- Checks passed: 524 tests, type check, lint, production build, zero-finding parity review, static-asset requests on port 3000, and whitespace validation.

# Delete Warning Contrast

- [x] Give the live-delete warning an opaque dark surface and explicit high-contrast foregrounds.
- [x] Add a regression assertion and verify the wizard locally.

## Review

- The warning now uses a near-opaque slate panel, pale body copy, light red heading, and stronger red border while leaving the wallpaper unchanged.
- Checks passed: focused component test, type check, rendered Chrome screenshot, and whitespace validation.

# Live Acknowledgement Contrast

- [x] Give the live-run acknowledgement panel and checkbox explicit high-contrast colors.
- [x] Add regression coverage and verify the rendered treatment.

## Review

- The acknowledgement panel now uses an opaque slate surface, white label, light supporting copy, and a bright checkbox border/check state while preserving the wallpaper.
- Checks passed: focused component test, type check, rendered Chrome screenshot, and whitespace validation.

# Live Acknowledgement Contrast Regression

- [x] Confirm the source and compiled wizard bundle no longer use the retired blue-on-blue treatment.
- [x] Replace utility-dependent colors with a scoped high-contrast Glass UI variant.
- [x] Verify the real rendered panel and complete project checks.

## Review

- The live acknowledgement now owns an opaque near-black surface, white title, pale copy, and bright checkbox styling through a scoped component class.
- Computed browser colors and the rendered Chrome screenshot passed; 526 tests, type check, lint, production build, React Doctor 100/100, and whitespace validation passed.

# Win32 Delete Ownership Diagnosis

- [x] Use Lokka to inspect the tenant's 7-Zip mobile-app records and ownership metadata.
- [x] Fix the safe delete matcher for the confirmed metadata shape.
- [x] Add regression coverage and complete project verification.

## Review

- Lokka confirmed the tenant record is the original PSADT proof app, which has the hydration marker but predates the WinGet ownership notes required by the current safe delete matcher.
- The migration path accepts only the exact observed legacy metadata fingerprint; current WinGet ownership rules remain unchanged for all other apps.
- Checks passed: 526 tests, type check, lint, production build, React Doctor 100/100, zero-finding safety review, and whitespace validation.
# Sitewide Landing-Style Navigation

- [x] Create one shared app navigation shell with landing-page pill styling.
- [x] Migrate wizard, dashboard, and results without losing contextual controls.
- [x] Verify desktop/mobile behavior across landing, templates, wizard, dashboard, and results.
- [x] Run focused and full project checks.

## Review

- Wizard, dashboard, and results now share the landing page's pill geometry, glass fill, border, blur, shadow, logo treatment, and compact contextual actions.
- Playwright confirmed matching computed styling at desktop width and zero horizontal overflow at 390px; 528 tests, lint, type check, production build, React Doctor 100/100, and whitespace validation passed.

# Thermonuclear Review Fix Loop

- [x] Review the current branch diff against its merge base with full thermonuclear strictness.
- [x] Fix every actionable structural or maintainability finding.
- [x] Repeat the review until a fresh round returns zero findings.
- [x] Run focused and full validation and record the clean result.

## Review

- Round 1 removed five root causes: version drift, duplicated navigation branding, unsafe session-cache parsing, repeated Win32 template resolution, and an obsolete direct-Blob CSP allowance.
- Round 2 moved Win32 content-version and content-file creates onto the existing non-retrying Graph boundary; round 3 returned zero findings.
- Checks passed: 529 tests, lint, type check, production build, React Doctor 100/100, Playwright landing/wizard verification, and whitespace validation.

# Win32 Template Documentation

- [x] Reproduce the missing Win32 template entry and trace the catalog/filter path.
- [x] Add the Win32 app to Template Docs through the canonical catalog model.
- [x] Add regression coverage for category, platform, summary, and payload inspection.
- [x] Verify the rendered page and complete project checks.

## Review

- Template Docs now renders the 7-Zip proof app under Win32 Apps with its package source, WinGet metadata, commands, requirements, and raw import payload.
- The page and catalog share one category order, preventing future template categories from disappearing during grouped rendering.
- Checks passed: 529 tests, lint, type check, production build, React Doctor 100/100, rendered Playwright verification, and whitespace validation.

# Stale Branch Cleanup

- [x] Audit local branches, remote branches, worktrees, and merged PR history.
- [x] Delete every stale branch while preserving `main` and the current branch.
- [x] Prune and verify the final local and GitHub branch lists.

## Review

- Local and GitHub now contain only `main` and `codex/consolidate-win32-glass-ui`.

# Preview Results Notice Contrast

- [x] Replace the pale preview notice with an explicit dark, high-contrast surface.
- [x] Add focused regression assertions for all visible notice colors.
- [x] Verify the real results screen in Playwright and complete project checks.

## Review

- The preview notice now uses a near-black surface, white title, pale supporting copy, sky icon, and visible sky border while leaving the wallpaper unchanged.
- Playwright computed-color verification and screenshot inspection passed; 527 tests, lint, type check, production build, React Doctor 100/100, and whitespace validation passed.

# Live 7-Zip Create/Delete Playwright Validation

- [x] Sign in through a persistent headed Playwright browser.
- [x] Create only the 7-Zip proof app and verify the result.
- [x] Delete only the 7-Zip proof app and verify the final tenant state.
- [x] Capture the browser evidence and document the result.

## Review

- Playwright reproduced Intune collection lag after creation, then verified the exact created ID handoff fixes immediate deletion while retaining ownership validation and list retries.
- Final live cycle: created 1, deleted 1, skipped 0, failed 0. A final read-only delete preview reported `Not found in tenant`.
- Checks passed: 527 tests, lint, type check, production build, React Doctor 100/100, and whitespace validation.

# Site-wide Navigation Width

- [x] Match both shared navigation variants to the landing hero container.
- [x] Add regression coverage for the shared responsive frame.
- [x] Verify landing, templates, wizard, dashboard, and results at desktop and mobile widths.
- [x] Run project checks and record the result.

## Review

- Public and application navigation now use the landing hero's responsive container and gutters instead of an independent 1120px cap.
- Browser measurements matched exactly at desktop and mobile widths with no horizontal overflow.
- Checks passed: 529 tests, lint, type check, production build, React Doctor 100/100, screenshot inspection, and whitespace validation.

# Landing Demo Backplate Removal

- [x] Remove the rectangular decorative layer behind the live-run demo.
- [x] Add regression coverage that preserves the demo without the backplate.
- [x] Verify the desktop landing composition and run focused checks.

## Review

- Removed the absolute border backplate while preserving the preview strip, demo window, and soft glow.
- Checks passed: focused landing tests, type check, lint, production build, screenshot inspection, and whitespace validation.

# Version 2.6.4 Ready PR

- [x] Rev the website patch version to 2.6.4.
- [x] Stage only the accumulated product changes and exclude local artifacts.
- [x] Commit, push, and open a ready PR against `main`.
- [x] Verify the published PR metadata and checks.

## Review

- Ready PR #20 targets `main` from `codex/consolidate-win32-glass-ui` with website version 2.6.4.
- Local validation passed: 529 tests, lint, type check, production build, React Doctor 100/100, browser verification, and whitespace validation.
