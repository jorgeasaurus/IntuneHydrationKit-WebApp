/**
 * Central export for all Intune Hydration Kit templates
 */

export * from "./groups";
export * from "./filters";
export * from "./compliance";
export * from "./conditionalAccess";
export * from "./appProtection";
export * from "./enrollment";

/**
 * Template metadata for UI display
 * Counts match the source PowerShell project: https://github.com/jorgeasaurus/IntuneHydrationKit
 */
export const TEMPLATE_METADATA = {
  groups: {
    displayName: "Dynamic Groups",
    description: "Azure AD dynamic groups for device categorization (43 dynamic + 4 static)",
    count: 47,
    icon: "Users",
  },
  filters: {
    displayName: "Device Filters",
    description: "Assignment filters for granular policy targeting",
    count: 24,
    icon: "Filter",
  },
  baseline: {
    displayName: "OpenIntuneBaseline",
    description: "Security baseline policies (Windows, macOS, iOS, Android)",
    count: 70,
    icon: "ShieldCheck",
  },
  compliance: {
    displayName: "Compliance Policies",
    description: "Device compliance policies for all platforms",
    count: 10,
    icon: "Shield",
  },
  appProtection: {
    displayName: "App Protection",
    description: "Mobile application management (MAM) policies",
    count: 10,
    icon: "Smartphone",
  },
  enrollment: {
    displayName: "Enrollment Profiles",
    description: "Windows Autopilot and Apple DEP enrollment profiles",
    count: 3,
    icon: "Download",
  },
  conditionalAccess: {
    displayName: "Conditional Access",
    description: "Conditional access policies (created in disabled state)",
    count: 21,
    icon: "Lock",
  },
} as const;

/**
 * Get total count of all templates
 */
export function getTotalTemplateCount(): number {
  return Object.values(TEMPLATE_METADATA).reduce((sum, meta) => sum + meta.count, 0);
}
