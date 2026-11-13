/**
 * Hydration marker utilities
 * Used to identify objects created by the Intune Hydration Kit
 */

// Display name prefix for all created objects (matches PS module $script:ImportPrefix)
export const IMPORT_PREFIX = "[IHD] ";

// Current marker (used when creating new objects)
export const HYDRATION_MARKER = "Imported by Intune Hydration Kit";

// Legacy marker (with hyphens - used in older versions)
export const HYDRATION_MARKER_LEGACY = "Imported by Intune-Hydration-Kit";

/**
 * Check if a description contains the hydration marker (current or legacy text).
 * Use this for every object type that has a description field. The [IHD] display
 * name prefix is not a marker: an administrator can give any object that name.
 * @param text The description to check
 * @returns true if the text contains either marker variant
 */
export function hasHydrationMarker(text: string | undefined | null): boolean {
  if (!text) return false;
  return text.includes(HYDRATION_MARKER) || text.includes(HYDRATION_MARKER_LEGACY);
}

const CONDITIONAL_ACCESS_MARKER_SUFFIXES = [
  " [intune hydration kit]",
  ` [${HYDRATION_MARKER.toLowerCase()}]`,
  ` [${HYDRATION_MARKER_LEGACY.toLowerCase()}]`,
];

/**
 * Check if a Conditional Access policy display name carries the hydration marker.
 * Conditional Access policies have no description field, so the kit marks them in
 * the display name: the [IHD] prefix, a marker suffix, or the marker text.
 * Use this rule only for Conditional Access policies.
 */
export function hasConditionalAccessHydrationMarker(displayName: string | undefined | null): boolean {
  if (!displayName) return false;
  const normalizedDisplayName = displayName.trim().toLowerCase();
  return (
    hasHydrationMarker(displayName) ||
    displayName.startsWith(IMPORT_PREFIX) ||
    CONDITIONAL_ACCESS_MARKER_SUFFIXES.some((suffix) => normalizedDisplayName.endsWith(suffix))
  );
}

/**
 * Check if a notification message template display name carries the hydration marker.
 * Notification templates have no description field. The PowerShell module creates them
 * as "[IHD] <template name>" and deletes only names in its own template set, so the
 * marker is the [IHD] prefix together with a name from the kit's template set.
 * An unprefixed name is not accepted, because it carries no marker.
 * @param displayName The display name of the tenant object
 * @param kitTemplateNames Display names of the kit templates, with the [IHD] prefix
 */
export function hasNotificationTemplateMarker(
  displayName: string | undefined | null,
  kitTemplateNames: readonly string[]
): boolean {
  if (!displayName?.startsWith(IMPORT_PREFIX)) return false;
  const lowerName = displayName.toLowerCase();
  return kitTemplateNames.some(
    (name) => name.startsWith(IMPORT_PREFIX) && name.toLowerCase() === lowerName
  );
}

/**
 * Remove the Conditional Access marker prefix and suffix from a display name, for name matching.
 */
export function normalizeConditionalAccessPolicyName(displayName: string): string {
  let normalized = displayName.trim().toLowerCase();
  const importPrefix = IMPORT_PREFIX.toLowerCase();

  if (normalized.startsWith(importPrefix)) {
    normalized = normalized.slice(importPrefix.length);
  }

  const markerSuffix = CONDITIONAL_ACCESS_MARKER_SUFFIXES.find((suffix) => normalized.endsWith(suffix));
  if (markerSuffix) {
    normalized = normalized.slice(0, -markerSuffix.length);
  }

  return normalized.trim();
}

/**
 * Add the hydration marker to a description if not already present
 * @param description The existing description
 * @returns The description with the marker added (or unchanged if already present)
 */
export function addHydrationMarker(description: string | undefined | null): string {
  const desc = String(description || "");
  if (desc.includes(HYDRATION_MARKER) || desc.includes(HYDRATION_MARKER_LEGACY)) {
    return desc;
  }
  return desc ? `${desc} - ${HYDRATION_MARKER}` : HYDRATION_MARKER;
}

/**
 * Add the [IHD] prefix to a display name if not already present
 * @param displayName The display name to prefix
 * @returns The display name with [IHD] prefix
 */
export function addImportPrefix(displayName: string): string {
  if (displayName.startsWith(IMPORT_PREFIX)) {
    return displayName;
  }
  return `${IMPORT_PREFIX}${displayName}`;
}
