import { afterEach, describe, expect, it, vi } from "vitest";
import type { GraphClient } from "@/lib/graph/client";
import {
  checkLicenses,
  checkPermissions,
  getOrganizationInfo,
  validatePrerequisites,
} from "@/lib/graph/prerequisites";
import type { SubscribedSku } from "@/types/prerequisites";

function makeSku(servicePlanNames: string[]): SubscribedSku {
  return {
    skuId: `sku-${servicePlanNames.join("-") || "empty"}`,
    skuPartNumber: "TEST_SKU",
    capabilityStatus: "Enabled",
    servicePlans: servicePlanNames.map((servicePlanName, index) => ({
      servicePlanId: `plan-${index}-${servicePlanName}`,
      servicePlanName,
      appliesTo: "User",
    })),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("graph/prerequisites", () => {
  it("returns the first organization from the beta organization collection", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const getCollection = vi.fn().mockResolvedValue([
      { id: "tenant-1", displayName: "Contoso", tenantType: "AAD", verifiedDomains: [{ name: "contoso.com", isDefault: true }] },
      { id: "tenant-2", displayName: "Ignored Tenant" },
    ]);
    const client = { getCollection } as unknown as GraphClient;

    await expect(getOrganizationInfo(client)).resolves.toEqual({
      id: "tenant-1",
      displayName: "Contoso",
      tenantType: "AAD",
      verifiedDomains: [{ name: "contoso.com", isDefault: true }],
    });

    expect(getCollection).toHaveBeenCalledWith(
      "/organization?$select=id,displayName,tenantType,verifiedDomains",
      "beta"
    );
  });

  it("throws when organization information is unavailable", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const client = { getCollection: vi.fn().mockResolvedValue([]) } as unknown as GraphClient;

    await expect(getOrganizationInfo(client)).rejects.toThrow("No organization information found");
  });

  it("detects Intune, conditional access, premium P2, and driver update licenses from subscribed SKUs", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const getCollection = vi.fn().mockResolvedValue([
      makeSku(["INTUNE_A", "AAD_PREMIUM", "AAD_PREMIUM_P2"]),
      makeSku(["SPE_E3", "WINDOWSUPDATEFORBUSINESS_DEPLOYMENTSERVICE", "AAD_PREMIUM"]),
    ]);
    const client = { getCollection } as unknown as GraphClient;

    const result = await checkLicenses(client);

    expect(result.hasIntuneLicense).toBe(true);
    expect(result.hasConditionalAccessLicense).toBe(true);
    expect(result.hasPremiumP2License).toBe(true);
    expect(result.hasWindowsDriverUpdateLicense).toBe(true);
    expect(result.intuneServicePlans).toEqual(["INTUNE_A", "AAD_PREMIUM"]);
    expect(result.conditionalAccessServicePlans).toEqual(["AAD_PREMIUM", "AAD_PREMIUM_P2", "SPE_E3"]);
    expect(result.premiumP2ServicePlans).toEqual(["AAD_PREMIUM_P2"]);
    expect(result.windowsDriverUpdateServicePlans).toEqual([
      "SPE_E3",
      "WINDOWSUPDATEFORBUSINESS_DEPLOYMENTSERVICE",
    ]);
    expect(getCollection).toHaveBeenCalledWith(
      "/subscribedSkus?$select=skuId,skuPartNumber,servicePlans",
      "beta"
    );
  });

  it("reports granted and missing delegated scopes from oauth permission grants", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const getCollection = vi.fn().mockResolvedValue([
      {
        scope: "DeviceManagementConfiguration.ReadWrite.All Group.ReadWrite.All Group.ReadWrite.All",
        clientId: "client-1",
        consentType: "Principal",
      },
      {
        scope: "Organization.Read.All",
        clientId: "client-2",
        consentType: "Principal",
      },
    ]);
    const client = { getCollection } as unknown as GraphClient;

    const result = await checkPermissions(client);

    expect(result.hasRequiredPermissions).toBe(false);
    expect(result.grantedPermissions).toEqual([
      "DeviceManagementConfiguration.ReadWrite.All",
      "Group.ReadWrite.All",
      "Organization.Read.All",
    ]);
    expect(result.missingPermissions).toContain("Policy.ReadWrite.ConditionalAccess");
    expect(result.missingPermissions).not.toContain("Group.ReadWrite.All");
    expect(getCollection).toHaveBeenCalledWith(
      "/me/oauth2PermissionGrants?$select=scope,clientId,consentType",
      "beta"
    );
  });

  it("falls back to runtime consent when oauth permission grants cannot be queried", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const client = {
      getCollection: vi.fn().mockRejectedValue(new Error("Not supported")),
    } as unknown as GraphClient;

    await expect(checkPermissions(client)).resolves.toEqual({
      hasRequiredPermissions: true,
      missingPermissions: [],
      grantedPermissions: [],
    });
    expect(warnSpy).toHaveBeenCalled();
  });

  it("marks prerequisite validation invalid when Intune licensing is missing and returns warnings", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const getCollection = vi
      .fn()
      .mockResolvedValueOnce([{ id: "tenant-1", displayName: "Contoso" }])
      .mockResolvedValueOnce([makeSku([])]);
    const client = { getCollection } as unknown as GraphClient;

    const result = await validatePrerequisites(client);

    expect(result.organization?.displayName).toBe("Contoso");
    expect(result.licenses?.hasIntuneLicense).toBe(false);
    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual([
      expect.stringContaining("No Intune license found."),
    ]);
    expect(result.warnings).toEqual([
      "No Entra ID Premium (P1) license found. All Conditional Access policies will be skipped during creation.",
      "No Windows Driver Update compatible license found (Windows E3/E5, Microsoft 365 E3/E5, etc.). Windows Driver Update profiles will be skipped during creation.",
    ]);
  });

  it("marks prerequisite validation valid but warns when only P1 conditional access licensing is present", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const getCollection = vi
      .fn()
      .mockResolvedValueOnce([{ id: "tenant-1", displayName: "Contoso" }])
      .mockResolvedValueOnce([makeSku(["INTUNE_A", "AAD_PREMIUM"])]);
    const client = { getCollection } as unknown as GraphClient;

    const result = await validatePrerequisites(client);

    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      "No Azure AD Premium P2 license found. Conditional Access policies that use risk-based conditions (signInRiskLevels, userRiskLevels, insiderRiskLevels) will be skipped during creation.",
      "No Windows Driver Update compatible license found (Windows E3/E5, Microsoft 365 E3/E5, etc.). Windows Driver Update profiles will be skipped during creation.",
    ]);
  });
});
