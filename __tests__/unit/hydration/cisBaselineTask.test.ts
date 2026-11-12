import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExecutionContext } from "@/lib/hydration/types";
import type { HydrationTask } from "@/types/hydration";

const {
  mockGetAllTemplateCacheKeys,
  mockGetCachedTemplates,
  mockDetectCISPolicyType,
  mockCreateSettingsCatalogPolicy,
  mockCreateV2CompliancePolicy,
  mockCreateCISCompliancePolicy,
  mockCreateCISDeviceConfiguration,
  mockCreateCISGroupPolicyConfiguration,
  mockCreateCISSecurityIntent,
} = vi.hoisted(() => ({
  mockGetAllTemplateCacheKeys: vi.fn(),
  mockGetCachedTemplates: vi.fn(),
  mockDetectCISPolicyType: vi.fn(),
  mockCreateSettingsCatalogPolicy: vi.fn(),
  mockCreateV2CompliancePolicy: vi.fn(),
  mockCreateCISCompliancePolicy: vi.fn(),
  mockCreateCISDeviceConfiguration: vi.fn(),
  mockCreateCISGroupPolicyConfiguration: vi.fn(),
  mockCreateCISSecurityIntent: vi.fn(),
}));

vi.mock("@/lib/templates/loader", () => ({
  getAllTemplateCacheKeys: mockGetAllTemplateCacheKeys,
  getCachedTemplates: mockGetCachedTemplates,
}));

vi.mock("@/lib/hydration/policyDetection", () => ({
  detectCISPolicyType: mockDetectCISPolicyType,
}));

vi.mock("@/lib/hydration/policyCreators", () => ({
  createSettingsCatalogPolicy: mockCreateSettingsCatalogPolicy,
  createV2CompliancePolicy: mockCreateV2CompliancePolicy,
  createCISCompliancePolicy: mockCreateCISCompliancePolicy,
  createCISDeviceConfiguration: mockCreateCISDeviceConfiguration,
  createCISGroupPolicyConfiguration: mockCreateCISGroupPolicyConfiguration,
  createCISSecurityIntent: mockCreateCISSecurityIntent,
}));

import { executeCISBaselineTask } from "@/lib/hydration/taskExecutors/cisBaselineTask";

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
    category: "cisBaseline",
    operation,
    itemName,
    status: "pending",
  };
}

describe("executeCISBaselineTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllTemplateCacheKeys.mockReturnValue([
      "intune-hydration-templates-cisBaseline-default",
    ]);
  });

  it("returns a failure when the CIS template cannot be found", async () => {
    mockGetCachedTemplates.mockReturnValue([]);

    const result = await executeCISBaselineTask(createTask("Missing template"), {
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

  it("finds a CIS template by its manifest file path", async () => {
    const policyName = "[IHD] CIS Settings Catalog";
    const templatePath = "1.0 - Windows/Settings Catalog/CIS Policy.json";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        _cisFilePath: templatePath,
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("SettingsCatalog");

    const result = await executeCISBaselineTask(
      { ...createTask("Manifest entry"), templatePath },
      {
        client: createClient(),
        operationMode: "create",
        isPreview: true,
        stopOnFirstError: false,
        cachedSettingsCatalogPolicies: [],
      }
    );

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(mockDetectCISPolicyType).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: policyName, _cisFilePath: templatePath })
    );
  });

  it("skips unsupported create operations with the endpoint-security specific reason", async () => {
    const policyName = "[IHD] Unsupported Intent";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        "@odata.type": "#microsoft.graph.devicemanagementintent",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("Unsupported");

    const result = await executeCISBaselineTask(createTask(policyName), {
      client: createClient(),
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
    });

    expect(result).toMatchObject({
      success: true,
      skipped: true,
    });
    expect(result.error).toContain("Security Intents require template instance creation");
  });

  it("returns generic guidance for unsupported create operations outside endpoint security", async () => {
    const policyName = "[IHD] Unsupported CIS Create";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        "@odata.type": "#microsoft.graph.unsupportedType",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("Unsupported");

    const result = await executeCISBaselineTask(createTask(policyName), {
      client: createClient(),
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
    });

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error:
        "Unsupported policy type: #microsoft.graph.unsupportedType. This policy type is not supported for automated creation.",
    });
  });

  it("surfaces settings catalog creation errors", async () => {
    const policyName = "[IHD] CIS Settings Catalog";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("SettingsCatalog");
    mockCreateSettingsCatalogPolicy.mockRejectedValue(new Error("settings catalog create failed"));

    const result = await executeCISBaselineTask(createTask(policyName), {
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

  it("skips group policy creates when the name already exists in the prefetched cache", async () => {
    const policyName = "[IHD] CIS Group/Policy";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        "@odata.type": "#microsoft.graph.groupPolicyConfiguration",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("GroupPolicyConfiguration");

    const client = createClient();
    const context: ExecutionContext = {
      client,
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
      cachedGroupPolicyConfigurations: [
        {
          id: "group-policy-id",
          displayName: policyName.toLowerCase(),
          description: "Imported by Intune Hydration Kit",
        },
      ],
    };

    const result = await executeCISBaselineTask(createTask(policyName), context);

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error: "Already exists",
    });
    expect(client.getCollection).not.toHaveBeenCalled();
    expect(client.get).not.toHaveBeenCalled();
  });

  it("supports preview creates for security intents", async () => {
    const policyName = "[IHD] CIS Security Intent Preview";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        "@odata.type": "#microsoft.graph.deviceManagementIntent",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("SecurityIntent");

    const result = await executeCISBaselineTask(createTask(policyName), {
      client: createClient(),
      operationMode: "create",
      isPreview: true,
      stopOnFirstError: false,
      cachedSecurityIntents: [],
    });

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(mockCreateCISSecurityIntent).not.toHaveBeenCalled();
  });

  it("creates V1 compliance CIS policies and updates the cache", async () => {
    const policyName = "[IHD] CIS V1 Compliance";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        "@odata.type": "#microsoft.graph.windows10CompliancePolicy",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("V1Compliance");
    mockCreateCISCompliancePolicy.mockResolvedValue({ id: "v1-policy-id" });

    const context: ExecutionContext = {
      client: createClient(),
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
      cachedCompliancePolicies: [],
    };

    const result = await executeCISBaselineTask(createTask(policyName), context);

    expect(result).toMatchObject({
      success: true,
      skipped: false,
      createdId: "v1-policy-id",
    });
    expect(context.cachedCompliancePolicies).toContainEqual({
      id: "v1-policy-id",
      displayName: policyName,
      description: "",
    });
  });

  it("skips settings catalog creates when the policy already exists", async () => {
    const policyName = "[IHD] Existing CIS Settings Catalog";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("SettingsCatalog");

    const result = await executeCISBaselineTask(createTask(policyName), {
      client: createClient(),
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
      cachedSettingsCatalogPolicies: [{ id: "existing-id", name: policyName }],
    });

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error: "Already exists",
    });
  });

  it("returns an invalid operation error for unsupported CIS modes", async () => {
    const policyName = "[IHD] Invalid CIS Mode";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("SettingsCatalog");

    const result = await executeCISBaselineTask(createTask(policyName), {
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
