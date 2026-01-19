/**
 * Microsoft Graph API operations for Device Assignment Filters
 */

import { GraphClient } from "./client";
import { DeviceFilter } from "@/types/graph";

const HYDRATION_MARKER = "Imported by Intune Hydration Kit";

/**
 * Get all device filters in the tenant
 */
export async function getAllFilters(client: GraphClient): Promise<DeviceFilter[]> {
  return client.getCollection<DeviceFilter>("/deviceManagement/assignmentFilters");
}

/**
 * Get filters created by Intune Hydration Kit
 */
export async function getHydrationKitFilters(client: GraphClient): Promise<DeviceFilter[]> {
  const filters = await getAllFilters(client);
  return filters.filter((filter) => filter.description?.includes(HYDRATION_MARKER));
}

/**
 * Get a filter by ID
 */
export async function getFilterById(
  client: GraphClient,
  filterId: string
): Promise<DeviceFilter> {
  return client.get<DeviceFilter>(`/deviceManagement/assignmentFilters/${filterId}`);
}

/**
 * Get a filter by display name
 */
export async function getFilterByName(
  client: GraphClient,
  displayName: string
): Promise<DeviceFilter | null> {
  const filters = await getAllFilters(client);
  const found = filters.find(
    (filter) => filter.displayName.toLowerCase() === displayName.toLowerCase()
  );
  return found || null;
}

/**
 * Check if a filter exists by display name (case-insensitive)
 */
export async function filterExists(
  client: GraphClient,
  displayName: string
): Promise<boolean> {
  const filter = await getFilterByName(client, displayName);
  return filter !== null;
}

/**
 * Get filters by platform
 */
export async function getFiltersByPlatform(
  client: GraphClient,
  platform: DeviceFilter["platform"]
): Promise<DeviceFilter[]> {
  const filters = await getAllFilters(client);
  return filters.filter((filter) => filter.platform === platform);
}

/**
 * Create a new device filter
 */
export async function createFilter(
  client: GraphClient,
  filter: DeviceFilter
): Promise<DeviceFilter> {
  // Ensure the hydration marker is in the description
  if (!filter.description?.includes(HYDRATION_MARKER)) {
    filter.description = `${filter.description || ""} ${HYDRATION_MARKER}`.trim();
  }

  return client.post<DeviceFilter>("/deviceManagement/assignmentFilters", filter);
}

/**
 * Update an existing filter
 */
export async function updateFilter(
  client: GraphClient,
  filterId: string,
  updates: Partial<DeviceFilter>
): Promise<DeviceFilter> {
  return client.patch<DeviceFilter>(
    `/deviceManagement/assignmentFilters/${filterId}`,
    updates
  );
}

/**
 * Delete a filter by ID
 * Only deletes if the filter was created by Intune Hydration Kit
 */
export async function deleteFilter(client: GraphClient, filterId: string): Promise<void> {
  // First, verify the filter has the hydration marker
  const filter = await getFilterById(client, filterId);

  if (!filter.description?.includes(HYDRATION_MARKER)) {
    throw new Error(
      `Cannot delete filter "${filter.displayName}": Not created by Intune Hydration Kit`
    );
  }

  await client.delete(`/deviceManagement/assignmentFilters/${filterId}`);
}

/**
 * Delete a filter by display name
 * Only deletes if the filter was created by Intune Hydration Kit
 */
export async function deleteFilterByName(
  client: GraphClient,
  displayName: string
): Promise<void> {
  const filter = await getFilterByName(client, displayName);

  if (!filter) {
    throw new Error(`Filter "${displayName}" not found`);
  }

  if (!filter.description?.includes(HYDRATION_MARKER)) {
    throw new Error(
      `Cannot delete filter "${displayName}": Not created by Intune Hydration Kit`
    );
  }

  if (!filter.id) {
    throw new Error(`Filter "${displayName}" has no ID`);
  }

  await client.delete(`/deviceManagement/assignmentFilters/${filter.id}`);
}

/**
 * Validate filter rule syntax
 */
export async function validateFilterRule(
  client: GraphClient,
  rule: string,
  platform: DeviceFilter["platform"]
): Promise<{ isValid: boolean; error?: string }> {
  try {
    // Use the Graph API to validate the rule
    await client.post("/deviceManagement/assignmentFilters/validateFilter", {
      platform,
      rule,
    });
    return { isValid: true };
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get devices that match a filter rule
 * Useful for testing filter rules before deployment
 */
export async function getDevicesMatchingFilter(
  client: GraphClient,
  filterId: string
): Promise<number> {
  try {
    // Get the filter
    const filter = await getFilterById(client, filterId);

    // Query devices with the filter
    const devices = await client.getCollection<unknown>(
      `/deviceManagement/managedDevices?$filter=platform eq '${filter.platform}'`
    );

    return devices.length;
  } catch (error) {
    console.error("Failed to get matching devices:", error);
    return 0;
  }
}

/**
 * Batch create multiple filters
 * Returns array of results with success/failure status
 */
export async function batchCreateFilters(
  client: GraphClient,
  filters: DeviceFilter[]
): Promise<Array<{ filter: DeviceFilter; success: boolean; error?: string; id?: string }>> {
  const results: Array<{
    filter: DeviceFilter;
    success: boolean;
    error?: string;
    id?: string;
  }> = [];

  for (const filter of filters) {
    try {
      // Check if filter already exists
      const exists = await filterExists(client, filter.displayName);
      if (exists) {
        results.push({
          filter,
          success: false,
          error: "Filter already exists",
        });
        continue;
      }

      // Validate the rule first
      const validation = await validateFilterRule(client, filter.rule, filter.platform);
      if (!validation.isValid) {
        results.push({
          filter,
          success: false,
          error: `Invalid filter rule: ${validation.error}`,
        });
        continue;
      }

      // Create the filter
      const createdFilter = await createFilter(client, filter);
      results.push({
        filter,
        success: true,
        id: createdFilter.id,
      });
    } catch (error) {
      results.push({
        filter,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return results;
}

/**
 * Batch delete multiple filters created by Intune Hydration Kit
 */
export async function batchDeleteFilters(
  client: GraphClient,
  filterIds: string[]
): Promise<Array<{ filterId: string; success: boolean; error?: string }>> {
  const results: Array<{ filterId: string; success: boolean; error?: string }> = [];

  for (const filterId of filterIds) {
    try {
      await deleteFilter(client, filterId);
      results.push({ filterId, success: true });
    } catch (error) {
      results.push({
        filterId,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return results;
}
