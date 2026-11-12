/**
 * Create-time existence matching.
 *
 * The rules that a create task uses to find a tenant object with the same name as
 * its template. The sequential executors and the conflict check use these
 * functions, so the conflict check reports the same objects that a run skips.
 */

import { findHydrationConditionalAccessPolicy } from "@/lib/graph/conditionalAccess";
import type { DeviceFilter, DeviceGroup } from "@/types/graph";
import type { FilterTemplate, GroupTemplate } from "@/lib/templates/loader";
import type { ExecutionContext } from "./types";
import { normalizeName } from "./utils";

function stripLowerImportPrefix(lowerName: string): string {
  return lowerName.startsWith("[ihd] ") ? lowerName.slice(6) : lowerName;
}

/** Group with the same name (case-insensitive), with or without the [IHD] prefix. */
export function findExistingGroup<T extends { displayName?: string }>(groups: T[], templateName: string): T | undefined {
  const targetName = templateName.toLowerCase();
  const targetNameStripped = stripLowerImportPrefix(targetName);
  return groups.find((group) => {
    const name = group.displayName?.toLowerCase();
    if (name === undefined) return false;
    return name === targetName || stripLowerImportPrefix(name) === targetNameStripped;
  });
}

/** Device filter with the same name (case-insensitive). */
export function findExistingFilter<T extends { displayName?: string }>(filters: T[], templateName: string): T | undefined {
  const targetName = templateName.toLowerCase();
  return filters.find((filter) => filter.displayName?.toLowerCase() === targetName);
}

/** Compliance and App Protection names match case-insensitively, with or without the [IHD] prefix. */
export function namesMatchIgnoringImportPrefix(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) return false;
  const normalizedLeft = left.toLowerCase();
  const normalizedRight = right.toLowerCase();
  const strip = (name: string) => name.replace(/^\[ihd\]\s/i, "");
  return normalizedLeft === normalizedRight || strip(normalizedLeft) === strip(normalizedRight);
}

/** App Protection policy with the same name (case-insensitive). */
export function findExistingAppProtectionPolicy<T extends { displayName?: string }>(
  policies: T[],
  templateName: string
): T | undefined {
  const targetName = templateName.toLowerCase();
  return policies.find((policy) => policy.displayName?.toLowerCase() === targetName);
}

/**
 * Conditional Access policy with the same name: exact, with a marker suffix, punctuation-tolerant,
 * or a kit policy with the other marker format.
 */
export function findExistingConditionalAccessPolicy(
  displayName: string,
  policies: ExecutionContext["cachedConditionalAccessPolicies"]
): { id: string; displayName?: string; state?: string } | undefined {
  const lowerName = displayName.toLowerCase();
  const suffixedLowerName = `${lowerName} [intune hydration kit]`;
  const fullMarkerLowerName = `${lowerName} [imported by intune hydration kit]`;
  const normalizedDisplayName = normalizeName(displayName);

  const match = policies?.find((policy) => {
    const policyLower = policy.displayName?.toLowerCase();
    return (
      policyLower === lowerName ||
      policyLower === suffixedLowerName ||
      policyLower === fullMarkerLowerName ||
      normalizeName(policy.displayName) === normalizedDisplayName
    );
  });
  if (match) return match;
  // A kit policy can carry the other marker format, for example
  // "Require MFA [Imported by Intune Hydration Kit]" for the template "[IHD] Require MFA".
  return (policies && findHydrationConditionalAccessPolicy(policies, displayName)) ?? undefined;
}

/**
 * Create body of a group template. A template without a membership rule is a static group.
 * The caller adds the hydration marker to the description.
 */
export function buildGroupCreateBody(template: GroupTemplate | DeviceGroup): DeviceGroup {
  if ("@odata.type" in template) return template;
  const isStaticGroup = template.isStaticGroup === true || !template.membershipRule;
  const base = {
    "@odata.type": "#microsoft.graph.group" as const,
    displayName: template.displayName,
    description: template.description,
    mailEnabled: false,
    mailNickname: template.displayName.replace(/[^a-zA-Z0-9]/g, ""),
    securityEnabled: true,
  };
  return isStaticGroup
    ? { ...base, groupTypes: [] }
    : {
        ...base,
        groupTypes: ["DynamicMembership"],
        membershipRule: template.membershipRule,
        membershipRuleProcessingState: "On",
      };
}

/** Create body of a device filter template. The caller adds the hydration marker to the description. */
export function buildFilterCreateBody(template: FilterTemplate | DeviceFilter): DeviceFilter {
  if ("@odata.type" in template) return template;
  return {
    "@odata.type": "#microsoft.graph.deviceAndAppManagementAssignmentFilter",
    displayName: template.displayName,
    description: template.description,
    platform: template.platform,
    rule: template.rule,
  };
}
