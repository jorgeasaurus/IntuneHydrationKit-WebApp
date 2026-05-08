import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExecutionContext } from "@/lib/hydration/types";
import type { HydrationTask } from "@/types/hydration";

const {
  mockGetCachedTemplates,
  mockCreateSettingsCatalogPolicy,
  mockCreateDeviceConfigurationPolicy,
  mockCreateDriverUpdateProfile,
  mockCompliancePolicyExistsByName,
  mockCreateBaselineCompliancePolicy,
  mockEscapeODataString,
  mockHasODataUnsafeChars,
  mockCreateAppProtectionPolicy,
  mockDeleteAppProtectionPolicy,
} = vi.hoisted(() => ({
  mockGetCachedTemplates: vi.fn(),
  mockCreateSettingsCatalogPolicy: vi.fn(),
  mockCreateDeviceConfigurationPolicy: vi.fn(),
  mockCreateDriverUpdateProfile: vi.fn(),
  mockCompliancePolicyExistsByName: vi.fn(),
  mockCreateBaselineCompliancePolicy: vi.fn(),
  mockEscapeODataString: vi.fn(),
  mockHasODataUnsafeChars: vi.fn(),
  mockCreateAppProtectionPolicy: vi.fn(),
  mockDeleteAppProtectionPolicy: vi.fn(),
}));

vi.mock("@/lib/templates/loader", () => ({
  getCachedTemplates: mockGetCachedTemplates,
}));

vi.mock("@/lib/hydration/policyCreators", () => ({
  createSettingsCatalogPolicy: mockCreateSettingsCatalogPolicy,
  createDeviceConfigurationPolicy: mockCreateDeviceConfigurationPolicy,
  createDriverUpdateProfile: mockCreateDriverUpdateProfile,
  compliancePolicyExistsByName: mockCompliancePolicyExistsByName,
  createBaselineCompliancePolicy: mockCreateBaselineCompliancePolicy,
}));

vi.mock("@/lib/hydration/utils", () => ({
  escapeODataString: mockEscapeODataString,
  hasODataUnsafeChars: mockHasODataUnsafeChars,
}));

vi.mock("@/lib/graph/appProtection", () => ({
  createAppProtectionPolicy: mockCreateAppProtectionPolicy,
  deleteAppProtectionPolicy: mockDeleteAppProtectionPolicy,
}));

import { executeBaselineTask } from "@/lib/hydration/taskExecutors/baselineTask";

function createClient() {
  return {
    delete: vi.fn(),
    get: vi.fn(),
    getCollection: vi.fn(),
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
    mockEscapeODataString.mockImplementation((value: string) => value);
    mockHasODataUnsafeChars.mockReturnValue(false);
    mockCompliancePolicyExistsByName.mockResolvedValue(false);
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

  it("fetches V1 compliance policies for OData-unsafe names and skips duplicates", async () => {
    const policyName = "[IHD] Win - OIB - Compliance - U - Password - v3.1";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        _oibPolicyType: "CompliancePolicies",
      },
    ]);
    mockHasODataUnsafeChars.mockReturnValue(true);

    const client = createClient();
    vi.mocked(client.getCollection).mockResolvedValue([
      {
        id: "existing-policy-id",
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
      },
    ]);

    const result = await executeBaselineTask(createTask(policyName), {
      client,
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
    });

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error: "Already exists",
    });
    expect(client.getCollection).toHaveBeenCalledWith(
      "/deviceManagement/deviceCompliancePolicies?$select=id,displayName,description"
    );
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
    vi.mocked(client.get).mockResolvedValue({ value: [] });

    const result = await executeBaselineTask(createTask(policyName), {
      client,
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
    });

    expect(result).toMatchObject({
      success: true,
      skipped: false,
      createdId: "device-config-id",
    });
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
    });

    expect(result).toMatchObject({
      success: false,
      skipped: false,
      error: "settings catalog create failed",
    });
  });

  it("skips compliance deletes when the name contains OData-unsafe characters", async () => {
    const policyName = "[IHD] Unsafe / Compliance Policy";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        _oibPolicyType: "CompliancePolicies",
      },
    ]);
    mockHasODataUnsafeChars.mockReturnValue(true);

    const client = createClient();
    const result = await executeBaselineTask(createTask(policyName, "delete"), {
      client,
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
    });

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error: "Cannot query by name (special characters)",
    });
    expect(client.get).not.toHaveBeenCalled();
  });

  it("maps app protection marker failures to a skip during delete", async () => {
    const policyName = "[IHD] Android App Protection";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        _oibPolicyType: "AppProtection",
      },
    ]);
    mockDeleteAppProtectionPolicy.mockRejectedValue(
      new Error("Not created by Intune Hydration Kit")
    );

    const result = await executeBaselineTask(createTask(policyName, "delete"), {
      client: createClient(),
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
      cachedAppProtectionPolicies: [
        {
          "@odata.type": "#microsoft.graph.androidManagedAppProtection",
          id: "app-policy-id",
          displayName: policyName,
          description: "Created manually",
          _platform: "android",
        },
      ],
    });

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error: "Not created by Hydration Kit",
    });
  });

  it("skips app protection deletes when the policy is missing from cache", async () => {
    const policyName = "[IHD] Missing App Protection";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        _oibPolicyType: "AppProtection",
      },
    ]);

    const result = await executeBaselineTask(createTask(policyName, "delete"), {
      client: createClient(),
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
      cachedAppProtectionPolicies: [],
    });

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error: "Not found in tenant",
    });
  });

  it("allows preview app protection deletes when the cached policy exists", async () => {
    const policyName = "[IHD] Preview App Protection";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        _oibPolicyType: "AppProtection",
      },
    ]);

    const client = createClient();
    const result = await executeBaselineTask(createTask(policyName, "delete"), {
      client,
      operationMode: "delete",
      isPreview: true,
      stopOnFirstError: false,
      cachedAppProtectionPolicies: [
        {
          "@odata.type": "#microsoft.graph.iosManagedAppProtection",
          id: "app-policy-id",
          displayName: policyName,
          description: "Imported by Intune Hydration Kit",
          _platform: "iOS",
        },
      ],
    });

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(mockDeleteAppProtectionPolicy).not.toHaveBeenCalled();
  });

  it("deletes app protection policies when the cached policy exists", async () => {
    const policyName = "[IHD] Delete App Protection";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        _oibPolicyType: "AppProtection",
      },
    ]);
    mockDeleteAppProtectionPolicy.mockResolvedValue(undefined);

    const result = await executeBaselineTask(createTask(policyName, "delete"), {
      client: createClient(),
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
      cachedAppProtectionPolicies: [
        {
          "@odata.type": "#microsoft.graph.androidManagedAppProtection",
          id: "app-policy-id",
          displayName: policyName,
          description: "Imported by Intune Hydration Kit",
          _platform: "android",
        },
      ],
    });

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(mockDeleteAppProtectionPolicy).toHaveBeenCalledWith(
      expect.any(Object),
      "app-policy-id",
      "android"
    );
  });

  it("defaults app protection delete platform to android when cache metadata is missing", async () => {
    const policyName = "[IHD] Delete App Protection Default Platform";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        _oibPolicyType: "AppProtection",
      },
    ]);
    mockDeleteAppProtectionPolicy.mockResolvedValue(undefined);

    await executeBaselineTask(createTask(policyName, "delete"), {
      client: createClient(),
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
      cachedAppProtectionPolicies: [
        {
          "@odata.type": "#microsoft.graph.androidManagedAppProtection",
          id: "app-policy-id",
          displayName: policyName,
          description: "Imported by Intune Hydration Kit",
        },
      ],
    });

    expect(mockDeleteAppProtectionPolicy).toHaveBeenCalledWith(
      expect.any(Object),
      "app-policy-id",
      "android"
    );
  });

  it("deletes device configuration policies with the hydration marker", async () => {
    const policyName = "[IHD] Device Configuration Delete";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        _oibPolicyType: "DeviceConfiguration",
      },
    ]);

    const client = createClient();
    vi.mocked(client.get)
      .mockResolvedValueOnce({
        value: [{ id: "device-config-id", displayName: policyName }],
      })
      .mockResolvedValueOnce({
        id: "device-config-id",
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
      });

    const result = await executeBaselineTask(createTask(policyName, "delete"), {
      client,
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
    });

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(client.delete).toHaveBeenCalledWith(
      "/deviceManagement/deviceConfigurations/device-config-id"
    );
  });

  it("supports preview device configuration deletes", async () => {
    const policyName = "[IHD] Preview Device Configuration Delete";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        _oibPolicyType: "DeviceConfiguration",
      },
    ]);

    const client = createClient();
    vi.mocked(client.get)
      .mockResolvedValueOnce({
        value: [{ id: "device-config-id", displayName: policyName }],
      })
      .mockResolvedValueOnce({
        id: "device-config-id",
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
      });

    const result = await executeBaselineTask(createTask(policyName, "delete"), {
      client,
      operationMode: "delete",
      isPreview: true,
      stopOnFirstError: false,
    });

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(client.delete).not.toHaveBeenCalled();
  });

  it("skips compliance deletes when the policy is missing from the tenant", async () => {
    const policyName = "[IHD] Missing Compliance Delete";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        _oibPolicyType: "CompliancePolicies",
      },
    ]);

    const client = createClient();
    vi.mocked(client.get).mockResolvedValue({ value: [] });

    const result = await executeBaselineTask(createTask(policyName, "delete"), {
      client,
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
    });

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error: "Not found in tenant",
    });
  });

  it("skips compliance deletes for policies without the hydration marker", async () => {
    const policyName = "[IHD] Unmarked Compliance Delete";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        _oibPolicyType: "CompliancePolicies",
      },
    ]);

    const client = createClient();
    vi.mocked(client.get)
      .mockResolvedValueOnce({
        value: [{ id: "compliance-policy-id", displayName: policyName }],
      })
      .mockResolvedValueOnce({
        id: "compliance-policy-id",
        displayName: policyName,
        description: "Created manually",
      });

    const result = await executeBaselineTask(createTask(policyName, "delete"), {
      client,
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
    });

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error: "Not created by Hydration Kit",
    });
  });

  it("skips unmarked driver update profiles after fetching the tenant cache", async () => {
    const policyName = "[IHD] Driver Update Profile";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        _oibPolicyType: "DriverUpdateProfiles",
      },
    ]);

    const client = createClient();
    vi.mocked(client.get).mockResolvedValue({
      value: [
        {
          id: "driver-profile-id",
          displayName: policyName,
          description: "Created manually",
        },
      ],
    });

    const context: ExecutionContext = {
      client,
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
    };

    const result = await executeBaselineTask(createTask(policyName, "delete"), context);

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error: "Not created by Hydration Kit",
    });
    expect(context.cachedDriverUpdateProfiles).toEqual([
      {
        id: "driver-profile-id",
        displayName: policyName,
        description: "Created manually",
      },
    ]);
  });

  it("allows preview deletes for marked driver update profiles", async () => {
    const policyName = "[IHD] Preview Driver Update";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        _oibPolicyType: "DriverUpdateProfiles",
      },
    ]);

    const client = createClient();
    const result = await executeBaselineTask(createTask(policyName, "delete"), {
      client,
      operationMode: "delete",
      isPreview: true,
      stopOnFirstError: false,
      cachedDriverUpdateProfiles: [
        {
          id: "driver-profile-id",
          displayName: policyName,
          description: "Imported by Intune Hydration Kit",
        },
      ],
    });

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(client.delete).not.toHaveBeenCalled();
  });

  it("returns not found when the driver update profile does not exist in tenant", async () => {
    const policyName = "[IHD] Missing Driver Update";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        _oibPolicyType: "DriverUpdateProfiles",
      },
    ]);

    const client = createClient();
    vi.mocked(client.get).mockResolvedValue({ value: [] });

    const result = await executeBaselineTask(createTask(policyName, "delete"), {
      client,
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
    });

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error: "Not found in tenant",
    });
  });

  it("deletes marked driver update profiles", async () => {
    const policyName = "[IHD] Delete Driver Update";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        _oibPolicyType: "DriverUpdateProfiles",
      },
    ]);

    const client = createClient();
    const result = await executeBaselineTask(createTask(policyName, "delete"), {
      client,
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
      cachedDriverUpdateProfiles: [
        {
          id: "driver-profile-id",
          displayName: policyName,
          description: "Imported by Intune Hydration Kit",
        },
      ],
    });

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(client.delete).toHaveBeenCalledWith(
      "/deviceManagement/windowsDriverUpdateProfiles/driver-profile-id"
    );
  });

  it("deletes matching V2 compliance policies when no settings catalog policy exists", async () => {
    const policyName = "[IHD] V2 Compliance Policy";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
      },
    ]);

    const client = createClient();
    vi.mocked(client.delete).mockResolvedValue(undefined);

    const context: ExecutionContext = {
      client,
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
      cachedSettingsCatalogPolicies: [],
      cachedV2CompliancePolicies: [
        {
          id: "v2-policy-id",
          name: policyName,
          description: "Imported by Intune Hydration Kit",
        },
      ],
    };

    const result = await executeBaselineTask(createTask(policyName, "delete"), context);

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(client.delete).toHaveBeenCalledWith(
      "/deviceManagement/compliancePolicies/v2-policy-id"
    );
    expect(context.cachedV2CompliancePolicies).toEqual([]);
  });

  it("skips V2 compliance deletes when the cached fallback policy is not hydration managed", async () => {
    const policyName = "[IHD] Unmarked V2 Compliance Policy";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
      },
    ]);

    const result = await executeBaselineTask(createTask(policyName, "delete"), {
      client: createClient(),
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
      cachedSettingsCatalogPolicies: [],
      cachedV2CompliancePolicies: [
        {
          id: "v2-policy-id",
          name: policyName,
          description: "Created manually",
        },
      ],
    });

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error: "Not created by Hydration Kit",
    });
  });

  it("supports preview deletes for marked V2 compliance policies", async () => {
    const policyName = "[IHD] Preview V2 Compliance Policy";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
      },
    ]);

    const client = createClient();
    const result = await executeBaselineTask(createTask(policyName, "delete"), {
      client,
      operationMode: "delete",
      isPreview: true,
      stopOnFirstError: false,
      cachedSettingsCatalogPolicies: [],
      cachedV2CompliancePolicies: [
        {
          id: "v2-policy-id",
          name: policyName,
          description: "Imported by Intune Hydration Kit",
        },
      ],
    });

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(client.delete).not.toHaveBeenCalled();
  });

  it("skips settings catalog deletes when the policy still has assignments", async () => {
    const policyName = "[IHD] Assigned Settings Catalog";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
      },
    ]);

    const client = createClient();
    vi.mocked(client.get).mockResolvedValue({ value: [{ id: "assignment-id" }] });

    const result = await executeBaselineTask(createTask(policyName, "delete"), {
      client,
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
      cachedSettingsCatalogPolicies: [
        {
          id: "settings-catalog-id",
          name: policyName,
          description: "Imported by Intune Hydration Kit",
        },
      ],
    });

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error: "Policy has 1 active assignment(s)",
    });
  });

  it("returns not found when neither settings catalog nor V2 compliance matches exist", async () => {
    const policyName = "[IHD] Missing Settings Catalog";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
      },
    ]);

    const client = createClient();
    vi.mocked(client.getCollection).mockResolvedValue([]);

    const result = await executeBaselineTask(createTask(policyName, "delete"), {
      client,
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
    });

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error: "Not found in tenant",
    });
  });

  it("deletes settings catalog policies after an assignment lookup failure", async () => {
    const policyName = "[IHD] Delete After Assignment Lookup Failure";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
      },
    ]);

    const client = createClient();
    vi.mocked(client.get).mockRejectedValueOnce(new Error("assignment lookup failed"));
    vi.mocked(client.delete).mockResolvedValue(undefined);

    const context: ExecutionContext = {
      client,
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
      cachedSettingsCatalogPolicies: [
        {
          id: "settings-catalog-id",
          name: policyName,
          description: "Imported by Intune Hydration Kit",
        },
      ],
    };

    const result = await executeBaselineTask(createTask(policyName, "delete"), context);

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(context.cachedSettingsCatalogPolicies).toEqual([]);
  });

  it("supports preview deletes for marked settings catalog policies", async () => {
    const policyName = "[IHD] Preview Settings Catalog Delete";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
      },
    ]);

    const client = createClient();
    vi.mocked(client.get).mockResolvedValue({ value: [] });

    const result = await executeBaselineTask(createTask(policyName, "delete"), {
      client,
      operationMode: "delete",
      isPreview: true,
      stopOnFirstError: false,
      cachedSettingsCatalogPolicies: [
        {
          id: "settings-catalog-id",
          name: policyName,
          description: "Imported by Intune Hydration Kit",
        },
      ],
    });

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(client.delete).not.toHaveBeenCalled();
  });

  it("skips settings catalog deletes for policies without the hydration marker", async () => {
    const policyName = "[IHD] Unmarked Settings Catalog Delete";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
      },
    ]);

    const result = await executeBaselineTask(createTask(policyName, "delete"), {
      client: createClient(),
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
      cachedSettingsCatalogPolicies: [
        {
          id: "settings-catalog-id",
          name: policyName,
          description: "Created manually",
        },
      ],
    });

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error: "Not created by Hydration Kit",
    });
  });

  it("treats settings catalog delete verification 404s as a successful delete", async () => {
    const policyName = "[IHD] Settings Catalog Delete";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
      },
    ]);

    const client = createClient();
    vi.mocked(client.get)
      .mockResolvedValueOnce({ value: [] })
      .mockRejectedValueOnce(new Error("404 Not Found"));
    vi.mocked(client.delete).mockRejectedValue(new Error("backend glitch"));

    const context: ExecutionContext = {
      client,
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
      cachedSettingsCatalogPolicies: [
        {
          id: "settings-catalog-id",
          name: policyName,
          description: "Imported by Intune Hydration Kit",
        },
      ],
    };

    const result = await executeBaselineTask(createTask(policyName, "delete"), context);

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(client.delete).toHaveBeenCalledWith(
      "/deviceManagement/configurationPolicies/settings-catalog-id"
    );
    expect(context.cachedSettingsCatalogPolicies).toEqual([]);
  });

  it("maps persistent settings catalog delete failures to the manual delete guidance", async () => {
    const policyName = "[IHD] Undeletable Settings Catalog";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
      },
    ]);

    const client = createClient();
    vi.mocked(client.get)
      .mockResolvedValueOnce({ value: [] })
      .mockResolvedValueOnce({ id: "settings-catalog-id" });
    vi.mocked(client.delete).mockRejectedValue(new Error("[400] An error has occurred"));

    const result = await executeBaselineTask(createTask(policyName, "delete"), {
      client,
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
      cachedSettingsCatalogPolicies: [
        {
          id: "settings-catalog-id",
          name: policyName,
          description: "Imported by Intune Hydration Kit",
        },
      ],
    });

    expect(result).toMatchObject({
      success: false,
      skipped: false,
      error:
        "Microsoft Intune backend error - some Settings Catalog policies cannot be deleted via Graph API. Delete manually in Intune portal.",
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
