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
 * Check if a string contains the hydration marker (supports both current and legacy formats)
 * Also checks for the [IHD] prefix in display names.
 * @param text The text to check (typically description or displayName)
 * @returns true if the text contains either marker variant or [IHD] prefix
 */
export function hasHydrationMarker(text: string | undefined | null): boolean {
  if (!text) return false;
  return (
    text.includes(HYDRATION_MARKER) ||
    text.includes(HYDRATION_MARKER_LEGACY) ||
    text.startsWith(IMPORT_PREFIX)
  );
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
