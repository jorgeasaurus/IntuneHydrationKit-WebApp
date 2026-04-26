import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExecutionContext } from "@/lib/hydration/types";
import type { HydrationTask } from "@/types/hydration";

const {
  mockGetAllTemplateCacheKeys,
  mockGetCachedTemplates,
  mockDetectCISPolicyType,
  mockSettingsCatalogPolicyExists,
  mockCreateSettingsCatalogPolicy,
  mockV2CompliancePolicyExists,
  mockCreateV2CompliancePolicy,
  mockCompliancePolicyExistsByName,
  mockCreateCISCompliancePolicy,
  mockDeviceConfigurationExists,
  mockCreateCISDeviceConfiguration,
  mockGroupPolicyConfigurationExists,
  mockCreateCISGroupPolicyConfiguration,
  mockSecurityIntentExists,
  mockCreateCISSecurityIntent,
  mockEscapeODataString,
  mockHasODataUnsafeChars,
} = vi.hoisted(() => ({
  mockGetAllTemplateCacheKeys: vi.fn(),
  mockGetCachedTemplates: vi.fn(),
  mockDetectCISPolicyType: vi.fn(),
  mockSettingsCatalogPolicyExists: vi.fn(),
  mockCreateSettingsCatalogPolicy: vi.fn(),
  mockV2CompliancePolicyExists: vi.fn(),
  mockCreateV2CompliancePolicy: vi.fn(),
  mockCompliancePolicyExistsByName: vi.fn(),
  mockCreateCISCompliancePolicy: vi.fn(),
  mockDeviceConfigurationExists: vi.fn(),
  mockCreateCISDeviceConfiguration: vi.fn(),
  mockGroupPolicyConfigurationExists: vi.fn(),
  mockCreateCISGroupPolicyConfiguration: vi.fn(),
  mockSecurityIntentExists: vi.fn(),
  mockCreateCISSecurityIntent: vi.fn(),
  mockEscapeODataString: vi.fn(),
  mockHasODataUnsafeChars: vi.fn(),
}));

vi.mock("@/lib/templates/loader", () => ({
  getAllTemplateCacheKeys: mockGetAllTemplateCacheKeys,
  getCachedTemplates: mockGetCachedTemplates,
}));

vi.mock("@/lib/hydration/policyDetection", () => ({
  detectCISPolicyType: mockDetectCISPolicyType,
}));

vi.mock("@/lib/hydration/policyCreators", () => ({
  settingsCatalogPolicyExists: mockSettingsCatalogPolicyExists,
  createSettingsCatalogPolicy: mockCreateSettingsCatalogPolicy,
  v2CompliancePolicyExists: mockV2CompliancePolicyExists,
  createV2CompliancePolicy: mockCreateV2CompliancePolicy,
  compliancePolicyExistsByName: mockCompliancePolicyExistsByName,
  createCISCompliancePolicy: mockCreateCISCompliancePolicy,
  deviceConfigurationExists: mockDeviceConfigurationExists,
  createCISDeviceConfiguration: mockCreateCISDeviceConfiguration,
  groupPolicyConfigurationExists: mockGroupPolicyConfigurationExists,
  createCISGroupPolicyConfiguration: mockCreateCISGroupPolicyConfiguration,
  securityIntentExists: mockSecurityIntentExists,
  createCISSecurityIntent: mockCreateCISSecurityIntent,
}));

vi.mock("@/lib/hydration/utils", () => ({
  escapeODataString: mockEscapeODataString,
  hasODataUnsafeChars: mockHasODataUnsafeChars,
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
    mockEscapeODataString.mockImplementation((value: string) => value);
    mockHasODataUnsafeChars.mockReturnValue(false);
    mockSettingsCatalogPolicyExists.mockResolvedValue(false);
    mockGroupPolicyConfigurationExists.mockResolvedValue(false);
    mockSecurityIntentExists.mockResolvedValue(false);
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
    });

    expect(result).toMatchObject({
      success: false,
      skipped: false,
      error: "settings catalog create failed",
    });
  });

  it("skips group policy creates when an OData-unsafe name already exists in the fetched cache", async () => {
    const policyName = "[IHD] CIS Group/Policy";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        "@odata.type": "#microsoft.graph.groupPolicyConfiguration",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("GroupPolicyConfiguration");
    mockHasODataUnsafeChars.mockReturnValue(true);

    const client = createClient();
    vi.mocked(client.getCollection).mockResolvedValue([
      {
        id: "group-policy-id",
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
      },
    ]);

    const context: ExecutionContext = {
      client,
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
    };

    const result = await executeCISBaselineTask(createTask(policyName), context);

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error: "Already exists",
    });
    expect(context.cachedGroupPolicyConfigurations).toEqual([
      {
        id: "group-policy-id",
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
      },
    ]);
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
    mockSettingsCatalogPolicyExists.mockResolvedValue(true);

    const result = await executeCISBaselineTask(createTask(policyName), {
      client: createClient(),
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
    });

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error: "Already exists",
    });
  });

  it("skips group policy deletes when the fetched policy has active assignments", async () => {
    const policyName = "[IHD] CIS Group Policy";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        "@odata.type": "#microsoft.graph.groupPolicyConfiguration",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("GroupPolicyConfiguration");

    const client = createClient();
    vi.mocked(client.getCollection).mockResolvedValue([
      {
        id: "group-policy-id",
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
      },
    ]);
    vi.mocked(client.get).mockResolvedValue({ value: [{ id: "assignment-id" }] });

    const context: ExecutionContext = {
      client,
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
    };

    const result = await executeCISBaselineTask(createTask(policyName, "delete"), context);

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error: "Policy has 1 active assignment(s)",
    });
    expect(context.cachedGroupPolicyConfigurations).toEqual([
      {
        id: "group-policy-id",
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
      },
    ]);
  });

  it("deletes marked group policy configurations and prunes the cache", async () => {
    const policyName = "[IHD] CIS Group Policy Delete";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        "@odata.type": "#microsoft.graph.groupPolicyConfiguration",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("GroupPolicyConfiguration");

    const client = createClient();
    vi.mocked(client.get).mockResolvedValue({ value: [] });

    const context: ExecutionContext = {
      client,
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
      cachedGroupPolicyConfigurations: [
        {
          id: "group-policy-id",
          displayName: policyName,
          description: "Imported by Intune Hydration Kit",
        },
      ],
    };

    const result = await executeCISBaselineTask(createTask(policyName, "delete"), context);

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(client.delete).toHaveBeenCalledWith(
      "/deviceManagement/groupPolicyConfigurations/group-policy-id"
    );
    expect(context.cachedGroupPolicyConfigurations).toEqual([]);
  });

  it("still deletes marked group policy configurations when assignment lookup fails", async () => {
    const policyName = "[IHD] CIS Group Policy Assignment Failure";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        "@odata.type": "#microsoft.graph.groupPolicyConfiguration",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("GroupPolicyConfiguration");

    const client = createClient();
    vi.mocked(client.get).mockRejectedValueOnce(new Error("assignment lookup failed"));

    const context: ExecutionContext = {
      client,
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
      cachedGroupPolicyConfigurations: [
        {
          id: "group-policy-id",
          displayName: policyName,
          description: "Imported by Intune Hydration Kit",
        },
      ],
    };

    const result = await executeCISBaselineTask(createTask(policyName, "delete"), context);

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(client.delete).toHaveBeenCalledWith(
      "/deviceManagement/groupPolicyConfigurations/group-policy-id"
    );
    expect(context.cachedGroupPolicyConfigurations).toEqual([]);
  });

  it("skips security intent deletes for policies without the hydration marker", async () => {
    const policyName = "[IHD] CIS Security Intent";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        "@odata.type": "#microsoft.graph.deviceManagementIntent",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("SecurityIntent");

    const client = createClient();
    vi.mocked(client.getCollection).mockResolvedValue([
      {
        id: "intent-id",
        displayName: policyName,
        description: "Created manually",
      },
    ]);

    const result = await executeCISBaselineTask(createTask(policyName, "delete"), {
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

  it("skips security intent deletes when the policy is not found", async () => {
    const policyName = "[IHD] Missing CIS Security Intent";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        "@odata.type": "#microsoft.graph.deviceManagementIntent",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("SecurityIntent");

    const client = createClient();
    vi.mocked(client.getCollection).mockResolvedValue([]);

    const result = await executeCISBaselineTask(createTask(policyName, "delete"), {
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

  it("skips security intent deletes when active assignments remain", async () => {
    const policyName = "[IHD] Assigned CIS Security Intent";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        "@odata.type": "#microsoft.graph.deviceManagementIntent",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("SecurityIntent");

    const client = createClient();
    vi.mocked(client.get).mockResolvedValue({ value: [{ id: "assignment-id" }] });

    const result = await executeCISBaselineTask(createTask(policyName, "delete"), {
      client,
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
      cachedSecurityIntents: [
        {
          id: "intent-id",
          displayName: policyName,
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

  it("supports preview deletes for marked security intents", async () => {
    const policyName = "[IHD] CIS Security Intent Preview Delete";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        "@odata.type": "#microsoft.graph.deviceManagementIntent",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("SecurityIntent");

    const client = createClient();
    vi.mocked(client.get).mockResolvedValue({ value: [] });

    const result = await executeCISBaselineTask(createTask(policyName, "delete"), {
      client,
      operationMode: "delete",
      isPreview: true,
      stopOnFirstError: false,
      cachedSecurityIntents: [
        {
          id: "intent-id",
          displayName: policyName,
          description: "Imported by Intune Hydration Kit",
        },
      ],
    });

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(client.delete).not.toHaveBeenCalled();
  });

  it("deletes marked security intents when assignment lookup fails", async () => {
    const policyName = "[IHD] CIS Security Intent Assignment Failure";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        "@odata.type": "#microsoft.graph.deviceManagementIntent",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("SecurityIntent");

    const client = createClient();
    vi.mocked(client.get).mockRejectedValueOnce(new Error("assignment lookup failed"));

    const context: ExecutionContext = {
      client,
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
      cachedSecurityIntents: [
        {
          id: "intent-id",
          displayName: policyName,
          description: "Imported by Intune Hydration Kit",
        },
      ],
    };

    const result = await executeCISBaselineTask(createTask(policyName, "delete"), context);

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(client.delete).toHaveBeenCalledWith("/deviceManagement/intents/intent-id");
    expect(context.cachedSecurityIntents).toEqual([]);
  });

  it("allows preview deletes for partially matched settings catalog policies", async () => {
    const policyName = "CIS Browser Policy";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("SettingsCatalog");

    const client = createClient();
    vi.mocked(client.get).mockResolvedValue({ value: [] });

    const result = await executeCISBaselineTask(createTask(policyName, "delete"), {
      client,
      operationMode: "delete",
      isPreview: true,
      stopOnFirstError: false,
      cachedSettingsCatalogPolicies: [
        {
          id: "settings-policy-id",
          name: `${policyName} - v1`,
          description: "Imported by Intune Hydration Kit",
        },
      ],
    });

    expect(result).toMatchObject({
      success: true,
      skipped: false,
    });
    expect(client.delete).not.toHaveBeenCalled();
  });

  it("returns unsupported policy guidance for unsupported delete types that do not map to intents", async () => {
    const policyName = "[IHD] Unsupported Delete";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        "@odata.type": "#microsoft.graph.unsupportedType",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("Unsupported");

    const result = await executeCISBaselineTask(createTask(policyName, "delete"), {
      client: createClient(),
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
    });

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error: "Unsupported policy type",
    });
  });

  it("skips V2 compliance deletes when the name contains OData-unsafe characters", async () => {
    const policyName = "[IHD] CIS V2 / Compliance";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        platforms: "linux",
        technologies: "linuxMdm",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("V2Compliance");
    mockHasODataUnsafeChars.mockReturnValue(true);

    const result = await executeCISBaselineTask(createTask(policyName, "delete"), {
      client: createClient(),
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
    });

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error: "Cannot query by name (special characters)",
    });
  });

  it("supports preview deletes for marked V1 compliance policies", async () => {
    const policyName = "[IHD] CIS V1 Compliance Delete";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        "@odata.type": "#microsoft.graph.windows10CompliancePolicy",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("V1Compliance");

    const client = createClient();
    vi.mocked(client.get).mockResolvedValue({
      value: [
        {
          id: "v1-policy-id",
          displayName: policyName,
          description: "Imported by Intune Hydration Kit",
        },
      ],
    });

    const result = await executeCISBaselineTask(createTask(policyName, "delete"), {
      client,
      operationMode: "delete",
      isPreview: true,
      stopOnFirstError: false,
    });

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(client.delete).not.toHaveBeenCalled();
  });

  it("skips V1 compliance deletes when the name contains OData-unsafe characters", async () => {
    const policyName = "[IHD] CIS V1 / Compliance";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        "@odata.type": "#microsoft.graph.windows10CompliancePolicy",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("V1Compliance");
    mockHasODataUnsafeChars.mockReturnValue(true);

    const result = await executeCISBaselineTask(createTask(policyName, "delete"), {
      client: createClient(),
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
    });

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error: "Cannot query by name (special characters)",
    });
  });

  it("skips V1 compliance deletes for policies without the hydration marker", async () => {
    const policyName = "[IHD] Unmarked CIS V1 Compliance";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        "@odata.type": "#microsoft.graph.windows10CompliancePolicy",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("V1Compliance");

    const client = createClient();
    vi.mocked(client.get).mockResolvedValue({
      value: [
        {
          id: "v1-policy-id",
          displayName: policyName,
          description: "Created manually",
        },
      ],
    });

    const result = await executeCISBaselineTask(createTask(policyName, "delete"), {
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

  it("skips V2 compliance deletes for policies without the hydration marker", async () => {
    const policyName = "[IHD] Unmarked CIS V2 Compliance";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        platforms: "linux",
        technologies: "linuxMdm",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("V2Compliance");

    const client = createClient();
    vi.mocked(client.get).mockResolvedValue({
      value: [
        {
          id: "v2-policy-id",
          name: policyName,
          description: "Created manually",
        },
      ],
    });

    const result = await executeCISBaselineTask(createTask(policyName, "delete"), {
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

  it("supports preview deletes for marked V2 compliance policies", async () => {
    const policyName = "[IHD] Preview CIS V2 Compliance";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        platforms: "linux",
        technologies: "linuxMdm",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("V2Compliance");

    const client = createClient();
    vi.mocked(client.get).mockResolvedValue({
      value: [
        {
          id: "v2-policy-id",
          name: policyName,
          description: "Imported by Intune Hydration Kit",
        },
      ],
    });

    const result = await executeCISBaselineTask(createTask(policyName, "delete"), {
      client,
      operationMode: "delete",
      isPreview: true,
      stopOnFirstError: false,
    });

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(client.delete).not.toHaveBeenCalled();
  });

  it("skips V2 compliance deletes when the policy is not found", async () => {
    const policyName = "[IHD] Missing CIS V2 Compliance";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        platforms: "linux",
        technologies: "linuxMdm",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("V2Compliance");

    const client = createClient();
    vi.mocked(client.get).mockResolvedValue({ value: [] });

    const result = await executeCISBaselineTask(createTask(policyName, "delete"), {
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

  it("deletes marked V2 compliance policies", async () => {
    const policyName = "[IHD] CIS V2 Compliance Delete Success";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        platforms: "linux",
        technologies: "linuxMdm",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("V2Compliance");

    const client = createClient();
    vi.mocked(client.get).mockResolvedValue({
      value: [
        {
          id: "v2-policy-id",
          name: policyName,
          description: "Imported by Intune Hydration Kit",
        },
      ],
    });

    const result = await executeCISBaselineTask(createTask(policyName, "delete"), {
      client,
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
    });

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(client.delete).toHaveBeenCalledWith(
      "/deviceManagement/compliancePolicies/v2-policy-id"
    );
  });

  it("deletes marked V1 compliance policies", async () => {
    const policyName = "[IHD] CIS V1 Compliance Delete Success";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        "@odata.type": "#microsoft.graph.windows10CompliancePolicy",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("V1Compliance");

    const client = createClient();
    vi.mocked(client.get).mockResolvedValue({
      value: [
        {
          id: "v1-policy-id",
          displayName: policyName,
          description: "Imported by Intune Hydration Kit",
        },
      ],
    });

    const result = await executeCISBaselineTask(createTask(policyName, "delete"), {
      client,
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
    });

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(client.delete).toHaveBeenCalledWith(
      "/deviceManagement/deviceCompliancePolicies/v1-policy-id"
    );
  });

  it("skips V1 compliance deletes when the policy is not found", async () => {
    const policyName = "[IHD] Missing CIS V1 Compliance";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        "@odata.type": "#microsoft.graph.windows10CompliancePolicy",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("V1Compliance");

    const client = createClient();
    vi.mocked(client.get).mockResolvedValue({ value: [] });

    const result = await executeCISBaselineTask(createTask(policyName, "delete"), {
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

  it("skips device configuration deletes for policies without the hydration marker", async () => {
    const policyName = "[IHD] CIS Device Configuration Delete";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        "@odata.type": "#microsoft.graph.windows10GeneralConfiguration",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("DeviceConfiguration");

    const client = createClient();
    vi.mocked(client.get).mockResolvedValue({
      value: [
        {
          id: "device-config-id",
          displayName: policyName,
          description: "Created manually",
        },
      ],
    });

    const result = await executeCISBaselineTask(createTask(policyName, "delete"), {
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

  it("supports preview deletes for marked device configuration policies", async () => {
    const policyName = "[IHD] CIS Device Configuration Preview Delete";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        "@odata.type": "#microsoft.graph.windows10GeneralConfiguration",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("DeviceConfiguration");

    const client = createClient();
    vi.mocked(client.get).mockResolvedValue({
      value: [
        {
          id: "device-config-id",
          displayName: policyName,
          description: "Imported by Intune Hydration Kit",
        },
      ],
    });

    const result = await executeCISBaselineTask(createTask(policyName, "delete"), {
      client,
      operationMode: "delete",
      isPreview: true,
      stopOnFirstError: false,
    });

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(client.delete).not.toHaveBeenCalled();
  });

  it("deletes marked device configuration policies", async () => {
    const policyName = "[IHD] CIS Device Configuration Delete Success";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        "@odata.type": "#microsoft.graph.windows10GeneralConfiguration",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("DeviceConfiguration");

    const client = createClient();
    vi.mocked(client.get).mockResolvedValue({
      value: [
        {
          id: "device-config-id",
          displayName: policyName,
          description: "Imported by Intune Hydration Kit",
        },
      ],
    });

    const result = await executeCISBaselineTask(createTask(policyName, "delete"), {
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

  it("skips device configuration deletes when the name contains OData-unsafe characters", async () => {
    const policyName = "[IHD] CIS Device / Configuration";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        "@odata.type": "#microsoft.graph.windows10GeneralConfiguration",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("DeviceConfiguration");
    mockHasODataUnsafeChars.mockReturnValue(true);

    const result = await executeCISBaselineTask(createTask(policyName, "delete"), {
      client: createClient(),
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
    });

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error: "Cannot query by name (special characters)",
    });
  });

  it("skips device configuration deletes when the policy is not found", async () => {
    const policyName = "[IHD] Missing CIS Device Configuration";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        "@odata.type": "#microsoft.graph.windows10GeneralConfiguration",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("DeviceConfiguration");

    const client = createClient();
    vi.mocked(client.get).mockResolvedValue({ value: [] });

    const result = await executeCISBaselineTask(createTask(policyName, "delete"), {
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

  it("returns not found when no settings catalog delete match exists after fetching the cache", async () => {
    const policyName = "[IHD] Missing CIS Settings Catalog";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("SettingsCatalog");

    const client = createClient();
    vi.mocked(client.getCollection).mockResolvedValue([]);

    const result = await executeCISBaselineTask(createTask(policyName, "delete"), {
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

  it("deletes unsupported intent-typed policies via the security intent delete fallback", async () => {
    const policyName = "[IHD] Unsupported Intent Delete";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        "@odata.type": "#microsoft.graph.deviceManagementIntent",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("Unsupported");

    const client = createClient();
    vi.mocked(client.get).mockResolvedValue({ value: [] });

    const context: ExecutionContext = {
      client,
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
      cachedSecurityIntents: [
        {
          id: "intent-id",
          displayName: policyName,
          description: "Imported by Intune Hydration Kit",
        },
      ],
    };

    const result = await executeCISBaselineTask(createTask(policyName, "delete"), context);

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(client.delete).toHaveBeenCalledWith("/deviceManagement/intents/intent-id");
    expect(context.cachedSecurityIntents).toEqual([]);
  });

  it("deletes settings catalog policies and removes them from the cache", async () => {
    const policyName = "[IHD] CIS Settings Catalog Delete";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("SettingsCatalog");

    const client = createClient();
    vi.mocked(client.get).mockResolvedValue({ value: [] });

    const context: ExecutionContext = {
      client,
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
      cachedSettingsCatalogPolicies: [
        {
          id: "settings-policy-id",
          name: policyName,
          description: "Imported by Intune Hydration Kit",
        },
      ],
    };

    const result = await executeCISBaselineTask(createTask(policyName, "delete"), context);

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(client.delete).toHaveBeenCalledWith(
      "/deviceManagement/configurationPolicies/settings-policy-id"
    );
    expect(context.cachedSettingsCatalogPolicies).toEqual([]);
  });

  it("skips settings catalog deletes for policies without the hydration marker", async () => {
    const policyName = "[IHD] Unmarked CIS Settings Catalog";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("SettingsCatalog");

    const result = await executeCISBaselineTask(createTask(policyName, "delete"), {
      client: createClient(),
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
      cachedSettingsCatalogPolicies: [
        {
          id: "settings-policy-id",
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

  it("skips settings catalog deletes when the policy still has assignments", async () => {
    const policyName = "[IHD] Assigned CIS Settings Catalog";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("SettingsCatalog");

    const client = createClient();
    vi.mocked(client.get).mockResolvedValue({ value: [{ id: "assignment-id" }] });

    const result = await executeCISBaselineTask(createTask(policyName, "delete"), {
      client,
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
      cachedSettingsCatalogPolicies: [
        {
          id: "settings-policy-id",
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

  it("still deletes settings catalog policies when assignment lookups fail", async () => {
    const policyName = "[IHD] CIS Settings Catalog Assignment Failure";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("SettingsCatalog");

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
          id: "settings-policy-id",
          name: policyName,
          description: "Imported by Intune Hydration Kit",
        },
      ],
    };

    const result = await executeCISBaselineTask(createTask(policyName, "delete"), context);

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(context.cachedSettingsCatalogPolicies).toEqual([]);
  });

  it("maps repeated settings catalog delete backend errors to the manual-delete guidance", async () => {
    vi.useFakeTimers();
    const policyName = "[IHD] Flaky Settings Catalog";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("SettingsCatalog");

    const client = createClient();
    vi.mocked(client.get).mockResolvedValue({ value: [] });
    vi.mocked(client.delete).mockRejectedValue(new Error("[400] An error has occurred"));

    const promise = executeCISBaselineTask(createTask(policyName, "delete"), {
      client,
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
      cachedSettingsCatalogPolicies: [
        {
          id: "settings-policy-id",
          name: policyName,
          description: "Imported by Intune Hydration Kit",
        },
      ],
    });

    await vi.runAllTimersAsync();
    const result = await promise;
    vi.useRealTimers();

    expect(result).toMatchObject({
      success: false,
      skipped: false,
      error:
        "Microsoft Intune backend error - some Settings Catalog policies cannot be deleted via Graph API. Delete manually in Intune portal.",
    });
    expect(client.delete).toHaveBeenCalledTimes(5);
  });

  it("surfaces unexpected CIS delete errors through the top-level handler", async () => {
    const policyName = "[IHD] Broken CIS V1 Delete";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        "@odata.type": "#microsoft.graph.windows10CompliancePolicy",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("V1Compliance");

    const client = createClient();
    vi.mocked(client.get).mockRejectedValue(new Error("tenant lookup failed"));

    const result = await executeCISBaselineTask(createTask(policyName, "delete"), {
      client,
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
    });

    expect(result).toMatchObject({
      success: false,
      skipped: false,
      error: "tenant lookup failed",
    });
  });

  it("deletes settings catalog policies found via partial-match fallback", async () => {
    const policyName = "CIS Browser Policy";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
      },
    ]);
    mockDetectCISPolicyType.mockReturnValue("SettingsCatalog");

    const client = createClient();
    vi.mocked(client.get).mockResolvedValue({ value: [] });

    const context: ExecutionContext = {
      client,
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
      cachedSettingsCatalogPolicies: [
        {
          id: "settings-policy-id",
          name: `${policyName} - v1`,
          description: "Imported by Intune Hydration Kit",
        },
      ],
    };

    const result = await executeCISBaselineTask(createTask(policyName, "delete"), context);

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(client.delete).toHaveBeenCalledWith(
      "/deviceManagement/configurationPolicies/settings-policy-id"
    );
    expect(context.cachedSettingsCatalogPolicies).toEqual([]);
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
