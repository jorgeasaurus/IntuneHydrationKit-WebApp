# Changelog

All notable changes to the IntuneHydrationKit Web App will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **`[IHD]` display name prefix** - All created objects now get an `[IHD] ` prefix on their display name, matching the PowerShell module v0.5.0 behavior. Both prefix and description marker are used for safe delete detection.
- **Static groups** (5) - Assignment ring groups (Ring 0–3) and Autopilot Device Preparation group with static membership.
- **ESP profile** - Windows Enrollment Status Page configuration profile.
- **Device Preparation profile** - Windows Autopilot Device Preparation (user-driven) profile using Settings Catalog format.
- **VM device filters** (12) - Filters for Hyper-V, VMware, VirtualBox, Parallels, QEMU, Citrix, Nutanix, Azure VM, AWS, GCP, Oracle Cloud, and Generic Virtual Machine.
- **Platform-specific filters** - iOS (3), Android (3), and macOS (3) device filters.
- **Enterprise Data Protection policies** - Level 1, 2, and 3 app protection policies for both Android and iOS.
- **Microsoft starter pack CA policies** (21) - Replaced generic CA001–CA013 policies with the full set of Microsoft-recommended conditional access policies including agent identity blocking, insider risk blocking, phishing-resistant MFA, and secure account recovery.

### Changed

- **Dynamic groups expanded** - 12 → 50 groups across 6 categories: OS (20), Autopilot (2), Ownership (2), Manufacturer (5), User (9), VM (12).
- **Device filters expanded** - 12 → 24 filters covering Windows, iOS, Android, and macOS platforms.
- **Compliance policies replaced** - 10 generic policies → 8 platform-aligned policies matching PS project (Android FullyManaged basic/strict, Windows standard/custom, iOS basic/strict, macOS basic/strict). Linux excluded (Settings Catalog format).
- **App protection policies replaced** - 4 corporate/BYOD policies → 8 policies (basic Android/iOS + Level 1–3 Enterprise Data Protection for each platform).
- **Enrollment profiles replaced** - Removed Apple DEP profiles (not in PS project), updated Autopilot profiles to use `outOfBoxExperienceSetting` (singular), added `preprovisioningAllowed` and `hardwareHashExtractionEnabled` fields.
- **Conditional access policies replaced** - 13 generic → 21 Microsoft starter pack policies, all created in disabled state.
- **Template metadata counts updated** - Groups 47→55, compliance 10→8, app protection 10→8, enrollment 3→4.
- **Template loader** - Cache version bumped to 16, all fetch functions apply `[IHD]` prefix to `displayName`, fixed notification loader to reference `First-Warning.json`.
- **All JSON template files** in `public/IntuneTemplates/` synced from PowerShell project v0.5.0.

### Removed

- Apple DEP enrollment profiles (iOS/macOS) - not present in the PowerShell project.
- Generic CA001–CA013 conditional access policy templates.
- Old compliance policy names (e.g., "Windows 10 - Security Baseline") replaced by PS-aligned names.
