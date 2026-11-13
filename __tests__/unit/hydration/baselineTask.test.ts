import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExecutionContext } from "@/lib/hydration/types";
import type { HydrationTask } from "@/types/hydration";

const {
  mockGetCachedTemplates,
  mockCreateSettingsCatalogPolicy,
  mockCreateDeviceConfigurationPolicy,
  mockCreateDriverUpdateProfile,
  mockCreateBaselineCompliancePolicy,
  mockCreateAppProtectionPolicy,
} = vi.hoisted(() => ({
  mockGetCachedTemplates: vi.fn(),
  mockCreateSettingsCatalogPolicy: vi.fn(),
  mockCreateDeviceConfigurationPolicy: vi.fn(),
  mockCreateDriverUpdateProfile: vi.fn(),
  mockCreateBaselineCompliancePolicy: vi.fn(),
  mockCreateAppProtectionPolicy: vi.fn(),
}));

vi.mock("@/lib/templates/loader", () => ({
  getCachedTemplates: mockGetCachedTemplates,
}));

vi.mock("@/lib/hydration/policyCreators", () => ({
  createSettingsCatalogPolicy: mockCreateSettingsCatalogPolicy,
  createDeviceConfigurationPolicy: mockCreateDeviceConfigurationPolicy,
  createDriverUpdateProfile: mockCreateDriverUpdateProfile,
  createBaselineCompliancePolicy: mockCreateBaselineCompliancePolicy,
}));

vi.mock("@/lib/graph/appProtection", () => ({
  createAppProtectionPolicy: mockCreateAppProtectionPolicy,
}));

import { executeBaselineTask } from "@/lib/hydration/taskExecutors/baselineTask";

function createClient() {
  return {
    delete: vi.fn(),
    get: vi.fn(),
    getCollection: vi.fn().mockResolvedValue([]),
    patch: vi.fn(),
    post: vi.fn(),
  } as unknown as ExecutionContext["client"];
}

function createTask(itemName: string, operation: HydrationTask["operation"] = "create"): HydrationTask {
  return {
    id: `${operation}-${itemName}`,
    category: "baseline",
    operation,
    itemName,
    status: "pending",
  };
}

describe("executeBaselineTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe.each([
    ["DeviceConfiguration", "cachedDeviceConfigurations"],
    ["DriverUpdateProfiles", "cachedDriverUpdateProfiles"],
  ] as const)("%s existence check", (policyType, cacheKey) => {
    it("skips an existing policy found in the prefetched cache", async () => {
      const name = "[IHD] Existing Baseline";
      mockGetCachedTemplates.mockReturnValue([{ displayName: name, _oibPolicyType: policyType }]);
      const client = createClient();
      const result = await executeBaselineTask(createTask(name), {
        client, operationMode: "create", isPreview: false, stopOnFirstError: true,
        [cacheKey]: [{ id: "existing-id", displayName: name }],
      });
      expect(client.getCollection).not.toHaveBeenCalled();
      expect(result).toMatchObject({ success: true, skipped: true, skipKind: "noOp" });
      expect(mockCreateDeviceConfigurationPolicy).not.toHaveBeenCalled();
      expect(mockCreateDriverUpdateProfile).not.toHaveBeenCalled();
    });

    it.each([false, true])("fails without creating when the prefetch failed (preview=%s)", async (isPreview) => {
      const name = "[IHD] Unverified Baseline";
      mockGetCachedTemplates.mockReturnValue([{ displayName: name, _oibPolicyType: policyType }]);
      const client = createClient();
      const result = await executeBaselineTask(createTask(name), {
        client, operationMode: "create", isPreview, stopOnFirstError: true,
        prefetchErrors: { [cacheKey]: "Policy inventory could not be read" },
      });
      expect(result).toMatchObject({ success: false, skipped: false });
      expect(result.error).toContain("Policy inventory could not be read");
      expect(mockCreateDeviceConfigurationPolicy).not.toHaveBeenCalled();
      expect(mockCreateDriverUpdateProfile).not.toHaveBeenCalled();
      expect(client.post).not.toHaveBeenCalled();
      expect(client.patch).not.toHaveBeenCalled();
      expect(client.delete).not.toHaveBeenCalled();
    });
  });

  it("skips a normalized Settings Catalog match in stop-on-first-error execution", async () => {
    const name = "[IHD] Win - OIB - SC - Device Security - D - Windows Package Manager - v3.5";
    const existingName = name.replace("Manager -", "Manager  -");
    mockGetCachedTemplates.mockReturnValue([{ name, _oibPolicyType: "SettingsCatalog", settings: [] }]);
    const current = createTask(name);
    const client = createClient();
    vi.mocked(client.get).mockResolvedValue({ name: existingName, settings: [] });
    const result = await executeBaselineTask(current, {
      client, operationMode: "create", isPreview: false, stopOnFirstError: true,
      cachedSettingsCatalogPolicies: [{ id: "old-policy", name: existingName }],
    });
    expect(result).toMatchObject({ skipped: true, skipKind: "noOp" });
    expect(current.match).toMatchObject({ id: "old-policy", name: existingName, matchType: "normalized" });
    expect(mockCreateSettingsCatalogPolicy).not.toHaveBeenCalled();
  });

  it("does not let an Android name match block a new iOS baseline policy", async () => {
    const name = "[IHD] Shared BYOD Policy";
    mockGetCachedTemplates.mockReturnValue([{ displayName: name, "@odata.type": "#microsoft.graph.iosManagedAppProtection", _oibPolicyType: "AppProtection" }]);
    mockCreateAppProtectionPolicy.mockResolvedValue({ id: "created-ios" });
    const result = await executeBaselineTask(createTask(name), {
      client: createClient(), operationMode: "create", isPreview: false, stopOnFirstError: true,
      cachedAppProtectionPolicies: [{ id: "android-policy", displayName: name, description: "", _platform: "android" }],
    });
    expect(result).toMatchObject({ skipped: false, createdId: "created-ios" });
    expect(mockCreateAppProtectionPolicy).toHaveBeenCalledOnce();
  });

  it("records a same-platform app protection match from prefetch platform tags", async () => {
    const name = "[IHD] Shared BYOD Policy";
    mockGetCachedTemplates.mockReturnValue([{ displayName: name, "@odata.type": "#microsoft.graph.iosManagedAppProtection", _oibPolicyType: "AppProtection" }]);
    const current = createTask(name);
    const result = await executeBaselineTask(current, {
      client: createClient(), operationMode: "create", isPreview: true, stopOnFirstError: true,
      cachedAppProtectionPolicies: [{ id: "android-policy", displayName: name, description: "", _platform: "android" }, { id: "ios-policy", displayName: name, description: "", _platform: "iOS" }],
    });
    expect(result).toMatchObject({ skipped: true, skipKind: "noOp" });
    expect(current.match?.id).toBe("ios-policy");
    expect(mockCreateAppProtectionPolicy).not.toHaveBeenCalled();
  });

  it("returns a failure when the baseline template cannot be found", async () => {
    mockGetCachedTemplates.mockReturnValue([]);

    const result = await executeBaselineTask(createTask("Missing Baseline"), {
      client: createClient(),
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
    });

    expect(result).toMatchObject({
      success: false,
      skipped: false,
      error: "Template not found",
    });
  });

  it("creates the template at the task's file path when another file shares its name", async () => {
    const policyName = "[IHD] Duplicate OIB Policy";
    mockGetCachedTemplates.mockReturnValue([
      { displayName: policyName, name: policyName, description: "first", _oibFilePath: "WINDOWS/a.json" },
      { displayName: policyName, name: policyName, description: "second", _oibFilePath: "WINDOWS/b.json" },
    ]);
    mockCreateSettingsCatalogPolicy.mockResolvedValue({ id: "settings-catalog-id" });
    const client = createClient();

    const result = await executeBaselineTask(
      { ...createTask(policyName), templatePath: "WINDOWS/b.json" },
      { client, operationMode: "create", isPreview: false, stopOnFirstError: false, cachedSettingsCatalogPolicies: [] }
    );

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(mockCreateSettingsCatalogPolicy).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ description: "second" })
    );
  });

  it("skips V1 compliance duplicates found in the prefetched cache", async () => {
    const policyName = "[IHD] Win - OIB - Compliance - U - Password - v3.1";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        _oibPolicyType: "CompliancePolicies",
      },
    ]);
    const client = createClient();

    const result = await executeBaselineTask(createTask(policyName), {
      client,
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
      cachedCompliancePolicies: [
        {
          id: "existing-policy-id",
          displayName: policyName,
          description: "Imported by Intune Hydration Kit",
        },
      ],
    });

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error: "Already exists",
    });
    expect(client.getCollection).not.toHaveBeenCalled();
    expect(mockCreateBaselineCompliancePolicy).not.toHaveBeenCalled();
  });

  it("creates device configuration policies when no duplicate exists", async () => {
    const policyName = "[IHD] Device Configuration";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        _oibPolicyType: "DeviceConfiguration",
      },
    ]);
    mockCreateDeviceConfigurationPolicy.mockResolvedValue({ id: "device-config-id" });

    const client = createClient();
    const context: ExecutionContext = {
      client,
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
      cachedDeviceConfigurations: [],
    };

    const result = await executeBaselineTask(createTask(policyName), context);

    expect(result).toMatchObject({
      success: true,
      skipped: false,
      createdId: "device-config-id",
    });
    expect(context.cachedDeviceConfigurations).toContainEqual(
      expect.objectContaining({ id: "device-config-id", displayName: policyName })
    );
    expect(mockCreateDeviceConfigurationPolicy).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ displayName: policyName })
    );
  });

  it("creates settings catalog policies and updates the cache", async () => {
    const policyName = "[IHD] Settings Catalog Policy";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
      },
    ]);
    mockCreateSettingsCatalogPolicy.mockResolvedValue({
      id: "settings-catalog-id",
      warning: "Some settings were normalized",
    });

    const client = createClient();
    const context: ExecutionContext = {
      client,
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
      cachedSettingsCatalogPolicies: [],
    };

    const result = await executeBaselineTask(createTask(policyName), context);

    expect(result).toMatchObject({
      success: true,
      skipped: false,
      createdId: "settings-catalog-id",
      warning: "Some settings were normalized",
    });
    expect(mockCreateSettingsCatalogPolicy).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ displayName: policyName })
    );
    expect(context.cachedSettingsCatalogPolicies).toContainEqual({
      id: "settings-catalog-id",
      name: policyName,
      description: "",
    });
  });

  it("replaces OIB organization placeholders before sequential Settings Catalog creation", async () => {
    const policyName = "[IHD] OneDrive configuration";
    const tenantId = "12345678-1234-1234-1234-123456789abc";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        name: policyName,
        description: "Imported by Intune Hydration Kit",
        platforms: "windows10",
        technologies: "mdm",
        settings: [
          {
            settingInstance: {
              simpleSettingValue: { value: "%OrganizationId%" },
            },
          },
        ],
      },
    ]);
    mockCreateSettingsCatalogPolicy.mockResolvedValue({ id: "settings-catalog-id" });

    await executeBaselineTask(createTask(policyName), {
      client: createClient(),
      tenantId,
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
      cachedSettingsCatalogPolicies: [],
    });

    expect(mockCreateSettingsCatalogPolicy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        settings: [
          {
            settingInstance: {
              simpleSettingValue: { value: tenantId },
            },
          },
        ],
      })
    );
  });

  it("creates app protection policies when no cached duplicate exists", async () => {
    const policyName = "[IHD] iOS App Protection";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        _oibPolicyType: "AppProtection",
      },
    ]);
    mockCreateAppProtectionPolicy.mockResolvedValue({ id: "app-protection-id" });

    const result = await executeBaselineTask(createTask(policyName), {
      client: createClient(),
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
      cachedAppProtectionPolicies: [],
    });

    expect(result).toMatchObject({
      success: true,
      skipped: false,
      createdId: "app-protection-id",
    });
    expect(mockCreateAppProtectionPolicy).toHaveBeenCalled();
  });

  it("surfaces settings catalog creation errors", async () => {
    const policyName = "[IHD] Broken Settings Catalog";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
      },
    ]);
    mockCreateSettingsCatalogPolicy.mockRejectedValue(new Error("settings catalog create failed"));

    const result = await executeBaselineTask(createTask(policyName), {
      client: createClient(),
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
      cachedSettingsCatalogPolicies: [],
    });

    expect(result).toMatchObject({
      success: false,
      skipped: false,
      error: "settings catalog create failed",
    });
  });

  it("returns an invalid operation error for unsupported baseline modes", async () => {
    const policyName = "[IHD] Invalid Baseline Mode";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
      },
    ]);

    const result = await executeBaselineTask(createTask(policyName), {
      client: createClient(),
      operationMode: "preview" as ExecutionContext["operationMode"],
      isPreview: false,
      stopOnFirstError: false,
    });

    expect(result).toMatchObject({
      success: false,
      skipped: false,
      error: "Invalid operation mode",
    });
  });
});
