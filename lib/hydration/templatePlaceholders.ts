const ORGANIZATION_ID_PLACEHOLDER = "%OrganizationId%";

/**
 * Resolves tenant-specific values in an OpenIntuneBaseline payload without
 * mutating the cached source template.
 */
export function resolveOIBOrganizationId<T>(template: T, tenantId?: string): T {
  const replaceValue = (value: unknown): unknown => {
    if (typeof value === "string") {
      return tenantId
        ? value.replaceAll(ORGANIZATION_ID_PLACEHOLDER, tenantId)
        : value;
    }

    if (Array.isArray(value)) {
      return value.map(replaceValue);
    }

    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, nestedValue]) => [key, replaceValue(nestedValue)])
      );
    }

    return value;
  };

  return replaceValue(template) as T;
}
