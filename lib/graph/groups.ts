/**
 * Microsoft Graph API operations for Azure AD Groups
 */

import { GraphClient } from "./client";
import { DeviceGroup } from "@/types/graph";
import { HYDRATION_MARKER, HYDRATION_MARKER_LEGACY, hasHydrationMarker, addHydrationMarker } from "@/lib/utils/hydrationMarker";

/**
 * Get all groups in the tenant
 */
export async function getAllGroups(client: GraphClient): Promise<DeviceGroup[]> {
  return client.getCollection<DeviceGroup>("/groups");
}

/**
 * Get groups created by Intune Hydration Kit
 * Supports both current and legacy markers
 */
export async function getHydrationKitGroups(client: GraphClient): Promise<DeviceGroup[]> {
  // Use contains filter to match both marker variations
  // Note: Graph API doesn't support OR in filters well, so we do two queries
  const filter1 = `contains(description,'${HYDRATION_MARKER}')`;
  const filter2 = `contains(description,'${HYDRATION_MARKER_LEGACY}')`;

  const [groups1, groups2] = await Promise.all([
    client.getCollection<DeviceGroup>(`/groups?$filter=${encodeURIComponent(filter1)}`).catch(() => []),
    client.getCollection<DeviceGroup>(`/groups?$filter=${encodeURIComponent(filter2)}`).catch(() => [])
  ]);

  // Combine and deduplicate by id
  const seen = new Set<string>();
  const combined: DeviceGroup[] = [];
  for (const group of [...groups1, ...groups2]) {
    if (group.id && !seen.has(group.id)) {
      seen.add(group.id);
      combined.push(group);
    }
  }
  return combined;
}

/**
 * Get all groups that start with "Intune - " prefix
 * Used for efficient existence checking before group creation
 */
export async function getIntuneGroups(client: GraphClient): Promise<DeviceGroup[]> {
  const filter = "startswith(displayName,'Intune - ')";
  return client.getCollection<DeviceGroup>(`/groups?$filter=${encodeURIComponent(filter)}`);
}

/**
 * Get a group by ID
 */
export async function getGroupById(
  client: GraphClient,
  groupId: string
): Promise<DeviceGroup> {
  return client.get<DeviceGroup>(`/groups/${groupId}`);
}

/**
 * Get a group by display name
 */
export async function getGroupByName(
  client: GraphClient,
  displayName: string
): Promise<DeviceGroup | null> {
  const filter = `displayName eq '${displayName.replace(/'/g, "''")}'`;
  const groups = await client.getCollection<DeviceGroup>(
    `/groups?$filter=${encodeURIComponent(filter)}`
  );
  return groups.length > 0 ? groups[0] : null;
}

/**
 * Check if a group exists by display name (case-insensitive)
 */
export async function groupExists(
  client: GraphClient,
  displayName: string
): Promise<boolean> {
  const group = await getGroupByName(client, displayName);
  return group !== null;
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
 * Update an existing group
 */
export async function updateGroup(
  client: GraphClient,
  groupId: string,
  updates: Partial<DeviceGroup>
): Promise<DeviceGroup> {
  return client.patch<DeviceGroup>(`/groups/${groupId}`, updates);
}

/**
 * Delete a group by ID
 * Only deletes if the group was created by Intune Hydration Kit
 */
export async function deleteGroup(client: GraphClient, groupId: string): Promise<void> {
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

  if (!group) {
    throw new Error(`Group "${displayName}" not found`);
  }

  if (!hasHydrationMarker(group.description)) {
    throw new Error(
      `Cannot delete group "${displayName}": Not created by Intune Hydration Kit`
    );
  }

  if (!group.id) {
    throw new Error(`Group "${displayName}" has no ID`);
  }

  await client.delete(`/groups/${group.id}`);
}

/**
 * Get group members count
 */
export async function getGroupMemberCount(
  client: GraphClient,
  groupId: string
): Promise<number> {
  const response = await client.get<{ value: unknown[] }>(`/groups/${groupId}/members/$count`);
  return Array.isArray(response.value) ? response.value.length : 0;
}

/**
 * Validate group membership rule syntax
 */
export async function validateMembershipRule(
  client: GraphClient,
  rule: string
): Promise<{ isValid: boolean; error?: string }> {
  try {
    await client.post(
      "/groups/validateProperties",
      {
        entityType: "group",
        membershipRule: rule,
      },
      "v1.0"
    );
    return { isValid: true };
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Batch create multiple groups
 * Returns array of results with success/failure status
 */
export async function batchCreateGroups(
  client: GraphClient,
  groups: DeviceGroup[]
): Promise<Array<{ group: DeviceGroup; success: boolean; error?: string; id?: string }>> {
  const results: Array<{
    group: DeviceGroup;
    success: boolean;
    error?: string;
    id?: string;
  }> = [];

  for (const group of groups) {
    try {
      // Check if group already exists
      const exists = await groupExists(client, group.displayName);
      if (exists) {
        results.push({
          group,
          success: false,
          error: "Group already exists",
        });
        continue;
      }

      // Create the group
      const createdGroup = await createGroup(client, group);
      results.push({
        group,
        success: true,
        id: createdGroup.id,
      });
    } catch (error) {
      results.push({
        group,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return results;
}

/**
 * Batch delete multiple groups created by Intune Hydration Kit
 */
export async function batchDeleteGroups(
  client: GraphClient,
  groupIds: string[]
): Promise<Array<{ groupId: string; success: boolean; error?: string }>> {
  const results: Array<{ groupId: string; success: boolean; error?: string }> = [];

  for (const groupId of groupIds) {
    try {
      await deleteGroup(client, groupId);
      results.push({ groupId, success: true });
    } catch (error) {
      results.push({
        groupId,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return results;
}
