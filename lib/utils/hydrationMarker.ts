/**
 * Hydration marker utilities
 * Used to identify objects created by the Intune Hydration Kit
 */

// Current marker (used when creating new objects)
export const HYDRATION_MARKER = "Imported by Intune Hydration Kit";

// Legacy marker (with hyphens - used in older versions)
export const HYDRATION_MARKER_LEGACY = "Imported by Intune-Hydration-Kit";

/**
 * Check if a string contains the hydration marker (supports both current and legacy formats)
 * @param text The text to check (typically description or displayName)
 * @returns true if the text contains either marker variant
 */
export function hasHydrationMarker(text: string | undefined | null): boolean {
  if (!text) return false;
  return text.includes(HYDRATION_MARKER) || text.includes(HYDRATION_MARKER_LEGACY);
}

/**
 * Add the hydration marker to a description if not already present
 * @param description The existing description
 * @returns The description with the marker added (or unchanged if already present)
 */
export function addHydrationMarker(description: string | undefined | null): string {
  const desc = String(description || "");
  if (hasHydrationMarker(desc)) {
    return desc;
  }
  return desc ? `${desc} - ${HYDRATION_MARKER}` : HYDRATION_MARKER;
}
