/**
 * Microsoft Graph API operations for device assignment filters
 */

import { GraphClient } from "./client";
import { DeviceFilter } from "@/types/graph";
import { HYDRATION_MARKER, hasHydrationMarker } from "@/lib/utils/hydrationMarker";

/**
 * Get all device filters in the tenant
 */
export async function getAllFilters(client: GraphClient): Promise<DeviceFilter[]> {
  return client.getCollection<DeviceFilter>(
    "/deviceManagement/assignmentFilters?$select=id,displayName,description,platform,rule"
  );
}

/**
 * Create a new device filter
 */
export async function createFilter(
  client: GraphClient,
  filter: DeviceFilter
): Promise<DeviceFilter> {
  if (!hasHydrationMarker(filter.description)) {
    filter.description = `${filter.description || ""} ${HYDRATION_MARKER}`.trim();
  }

  return client.post<DeviceFilter>("/deviceManagement/assignmentFilters", filter);
}
