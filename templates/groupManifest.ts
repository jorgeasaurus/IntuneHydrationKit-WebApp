/**
 * Lightweight group template manifest.
 *
 * Client components use this file for counts without loading template JSON.
 */

export const DYNAMIC_GROUP_TEMPLATE_PATHS = [
  "DynamicGroups/Autopilot-Groups.json",
  "DynamicGroups/DeviceTrustType-Groups.json",
  "DynamicGroups/Manufacturer-Groups.json",
  "DynamicGroups/OS-Groups.json",
  "DynamicGroups/Ownership-Groups.json",
  "DynamicGroups/User-Groups.json",
  "DynamicGroups/VM-Groups.json",
] as const;

export const DYNAMIC_GROUP_TEMPLATE_COUNT = 62;
export const STATIC_GROUP_TEMPLATE_COUNT = 5;
export const GROUP_TEMPLATE_COUNT =
  DYNAMIC_GROUP_TEMPLATE_COUNT + STATIC_GROUP_TEMPLATE_COUNT;
