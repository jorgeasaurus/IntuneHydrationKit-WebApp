import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExecutionContext } from "@/lib/hydration/types";
import type { HydrationTask } from "@/types/hydration";

const {
  mockGetCachedTemplates,
  mockCreateCompliancePolicy,
  mockCompliancePolicyExists,
  mockCreateV2CompliancePolicy,
} = vi.hoisted(() => ({
  mockGetCachedTemplates: vi.fn(),
  mockCreateCompliancePolicy: vi.fn(),
  mockCompliancePolicyExists: vi.fn(),
  mockCreateV2CompliancePolicy: vi.fn(),
}));

vi.mock("@/lib/templates/loader", () => ({
  getCachedTemplates: mockGetCachedTemplates,
}));

vi.mock("@/lib/graph/compliance", () => ({
  createCompliancePolicy: mockCreateCompliancePolicy,
  compliancePolicyExists: mockCompliancePolicyExists,
}));

vi.mock("@/lib/hydration/policyCreators", () => ({
  createV2CompliancePolicy: mockCreateV2CompliancePolicy,
}));

import { executeComplianceTask } from "@/lib/hydration/taskExecutors/complianceTask";

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
    category: "compliance",
    operation,
    itemName,
    status: "pending",
  };
}

describe("executeComplianceTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCachedTemplates.mockReturnValue(undefined);
    mockCompliancePolicyExists.mockResolvedValue(false);
  });

  it("returns a failure when no compliance template can be resolved", async () => {
    const result = await executeComplianceTask(createTask("Missing Compliance"), {
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

  it("creates Linux compliance policies through the V2 compliance endpoint", async () => {
    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: "[IHD] Linux Compliance",
        description: "Linux Compliance, non-custom Imported by Intune Hydration Kit",
        platforms: "linux",
        technologies: "linuxMdm",
      },
    ]);
    mockCreateV2CompliancePolicy.mockResolvedValue({ id: "linux-policy-id" });

    const client = createClient();
    const context: ExecutionContext = {
      client,
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
      cachedV2CompliancePolicies: [],
    };

    const result = await executeComplianceTask(createTask("[IHD] Linux Compliance"), context);

    expect(result).toMatchObject({
      success: true,
      skipped: false,
      createdId: "linux-policy-id",
    });
    expect(context.cachedV2CompliancePolicies).toContainEqual({
      id: "linux-policy-id",
      name: "[IHD] Linux Compliance",
      description: "Linux Compliance, non-custom Imported by Intune Hydration Kit",
    });
  });

  it("skips V2 creates when a matching cached policy already exists", async () => {
    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: "Linux Compliance",
        description: "Imported by Intune Hydration Kit",
        platforms: "linux",
        technologies: "linuxMdm",
      },
    ]);

    const result = await executeComplianceTask(createTask("[IHD] Linux Compliance"), {
      client: createClient(),
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
      cachedV2CompliancePolicies: [
        {
          id: "existing-linux-policy",
          name: "[IHD] Linux Compliance",
          description: "Imported by Intune Hydration Kit",
        },
      ],
    });

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error: "Already exists",
    });
  });

  it("supports preview creates for V2 compliance policies", async () => {
    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: "[IHD] Linux Preview",
        description: "Imported by Intune Hydration Kit",
        platforms: "linux",
        technologies: "linuxMdm",
      },
    ]);

    const result = await executeComplianceTask(createTask("[IHD] Linux Preview"), {
      client: createClient(),
      operationMode: "create",
      isPreview: true,
      stopOnFirstError: false,
      cachedV2CompliancePolicies: [],
    });

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(mockCreateV2CompliancePolicy).not.toHaveBeenCalled();
  });

  it("supports preview creates for V1 policies loaded from JSON", async () => {
    const policyName = "[IHD] Windows Compliance";
    const template = {
      "@odata.type": "#microsoft.graph.windows10CompliancePolicy",
      displayName: "Windows Compliance",
      description: "Imported by Intune Hydration Kit",
    };

    mockGetCachedTemplates.mockReturnValue([template]);

    const result = await executeComplianceTask(createTask(policyName), {
      client: createClient(),
      operationMode: "create",
      isPreview: true,
      stopOnFirstError: false,
      cachedCompliancePolicies: [],
    });

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(mockCreateCompliancePolicy).not.toHaveBeenCalled();
  });

  it("marks V1 creates successful after a 504 when the policy appears on verification", async () => {
    vi.useFakeTimers();
    const policyName = "Windows 11 Compliance";

    mockGetCachedTemplates.mockReturnValue([
      {
        "@odata.type": "#microsoft.graph.windows10CompliancePolicy",
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
      },
    ]);
    mockCreateCompliancePolicy.mockRejectedValue(new Error("504 Gateway Timeout"));
    mockCompliancePolicyExists.mockResolvedValueOnce(true);

    const client = createClient();
    vi.mocked(client.get).mockResolvedValue({
      value: [{ id: "created-policy-id", displayName: policyName }],
    });

    const promise = executeComplianceTask(createTask(policyName), {
      client,
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
      cachedCompliancePolicies: [],
    });

    await vi.runAllTimersAsync();
    const result = await promise;
    vi.useRealTimers();

    expect(result).toMatchObject({
      success: true,
      skipped: false,
      createdId: "created-policy-id",
    });
  });

  it("returns the original 504 error when create verification still cannot find the V1 policy", async () => {
    vi.useFakeTimers();
    const policyName = "Windows 11 Compliance";

    mockGetCachedTemplates.mockReturnValue([
      {
        "@odata.type": "#microsoft.graph.windows10CompliancePolicy",
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
      },
    ]);
    mockCreateCompliancePolicy.mockRejectedValue(new Error("504 Gateway Timeout"));
    mockCompliancePolicyExists.mockResolvedValueOnce(false);

    const promise = executeComplianceTask(createTask(policyName), {
      client: createClient(),
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
      cachedCompliancePolicies: [],
    });

    await vi.runAllTimersAsync();
    const result = await promise;
    vi.useRealTimers();

    expect(result).toMatchObject({
      success: false,
      skipped: false,
      error: "504 Gateway Timeout",
    });
  });

});
