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
 * Get a group by ID
 */
async function getGroupById(
  client: GraphClient,
  groupId: string
): Promise<DeviceGroup> {
  return client.get<DeviceGroup>(`/groups/${groupId}`);
}

/**
 * Get a group by display name
 */
async function getGroupByName(
  client: GraphClient,
  displayName: string
): Promise<DeviceGroup | null> {
  const filter = `displayName eq '${displayName.replace(/'/g, "''")}'`;
  const groups = await client.getCollection<DeviceGroup>(
    `/groups?$filter=${encodeURIComponent(filter)}&$select=id,displayName,description`
  );
  return groups.length > 0 ? groups[0] : null;
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

/**
 * Delete a group by ID
 * Only deletes if the group was created by Intune Hydration Kit
 */
async function deleteGroup(client: GraphClient, groupId: string): Promise<void> {
  // First, verify the group has the hydration marker
  const group = await getGroupById(client, groupId);

  if (!hasHydrationMarker(group.description)) {
    throw new Error(
      `Cannot delete group "${group.displayName}": Not created by Intune Hydration Kit`
    );
  }

  await client.delete(`/groups/${groupId}`);
}

/**
 * Delete a group by display name
 * Only deletes if the group was created by Intune Hydration Kit
 */
export async function deleteGroupByName(
  client: GraphClient,
  displayName: string
): Promise<void> {
  const group = await getGroupByName(client, displayName);

  if (!group || !group.id) {
    throw new Error(`Group "${displayName}" not found`);
  }

  await deleteGroup(client, group.id);
}
