/**
 * Microsoft Graph API operations for Azure AD Groups
 */

import { GraphClient } from "./client";
import { DeviceGroup } from "@/types/graph";
import { HYDRATION_MARKER, hasHydrationMarker } from "@/lib/utils/hydrationMarker";

/**
 * Get all groups created by or relevant to this tool.
 * Fetches groups with [IHD] prefix, "Intune - " prefix, and "Entra - " prefix
 * to support duplicate detection for both new and legacy naming conventions.
 */
export async function getIntuneGroups(client: GraphClient): Promise<DeviceGroup[]> {
  const filter = "startswith(displayName,'[IHD] ') or startswith(displayName,'Intune - ') or startswith(displayName,'Entra - ')";
  return client.getCollection<DeviceGroup>(`/groups?$filter=${encodeURIComponent(filter)}&$select=id,displayName,description,membershipRule`);
}

/**
 * Create a new dynamic group
 */
export async function createGroup(
  client: GraphClient,
  group: DeviceGroup
): Promise<DeviceGroup> {
  // Ensure the hydration marker is in the description
  if (!hasHydrationMarker(group.description)) {
    group.description = `${group.description || ""} ${HYDRATION_MARKER}`.trim();
  }

  return client.post<DeviceGroup>("/groups", group);
}

