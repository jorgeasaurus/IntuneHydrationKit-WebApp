import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExecutionContext } from "@/lib/hydration/types";
import type { HydrationTask } from "@/types/hydration";

const {
  mockGetCachedTemplates,
  mockGetCompliancePolicyByName,
  mockCreateCompliancePolicy,
  mockDeleteCompliancePolicyByName,
  mockCompliancePolicyExists,
  mockCreateV2CompliancePolicy,
  mockV2CompliancePolicyExists,
} = vi.hoisted(() => ({
  mockGetCachedTemplates: vi.fn(),
  mockGetCompliancePolicyByName: vi.fn(),
  mockCreateCompliancePolicy: vi.fn(),
  mockDeleteCompliancePolicyByName: vi.fn(),
  mockCompliancePolicyExists: vi.fn(),
  mockCreateV2CompliancePolicy: vi.fn(),
  mockV2CompliancePolicyExists: vi.fn(),
}));

vi.mock("@/lib/templates/loader", () => ({
  getCachedTemplates: mockGetCachedTemplates,
}));

vi.mock("@/templates", () => ({
  getCompliancePolicyByName: mockGetCompliancePolicyByName,
}));

vi.mock("@/lib/graph/compliance", () => ({
  createCompliancePolicy: mockCreateCompliancePolicy,
  deleteCompliancePolicyByName: mockDeleteCompliancePolicyByName,
  compliancePolicyExists: mockCompliancePolicyExists,
}));

vi.mock("@/lib/hydration/policyCreators", () => ({
  createV2CompliancePolicy: mockCreateV2CompliancePolicy,
  v2CompliancePolicyExists: mockV2CompliancePolicyExists,
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
    mockGetCompliancePolicyByName.mockReturnValue(undefined);
    mockCompliancePolicyExists.mockResolvedValue(false);
    mockV2CompliancePolicyExists.mockResolvedValue(false);
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
    expect(mockV2CompliancePolicyExists).not.toHaveBeenCalled();
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
    });

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(mockCreateV2CompliancePolicy).not.toHaveBeenCalled();
  });

  it("supports preview creates for V1 policies resolved via the stripped prefix fallback", async () => {
    const policyName = "[IHD] Windows Compliance";
    const template = {
      "@odata.type": "#microsoft.graph.windows10CompliancePolicy",
      displayName: "Windows Compliance",
      description: "Imported by Intune Hydration Kit",
    };

    mockGetCompliancePolicyByName.mockImplementation((name: string) =>
      name === "Windows Compliance" ? template : undefined
    );

    const result = await executeComplianceTask(createTask(policyName), {
      client: createClient(),
      operationMode: "create",
      isPreview: true,
      stopOnFirstError: false,
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
    mockCompliancePolicyExists.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    const client = createClient();
    vi.mocked(client.get).mockResolvedValue({
      value: [{ id: "created-policy-id", displayName: policyName }],
    });

    const promise = executeComplianceTask(createTask(policyName), {
      client,
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
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
    mockCompliancePolicyExists.mockResolvedValueOnce(false).mockResolvedValueOnce(false);

    const promise = executeComplianceTask(createTask(policyName), {
      client: createClient(),
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
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

  it("skips deleting V2 policies that still have active assignments", async () => {
    const policyName = "[IHD] Linux Compliance";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        platforms: "linux",
        technologies: "linuxMdm",
      },
    ]);

    const client = createClient();
    vi.mocked(client.get).mockResolvedValue({ value: [{ id: "assignment-id" }] });

    const result = await executeComplianceTask(createTask(policyName, "delete"), {
      client,
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
      cachedV2CompliancePolicies: [
        {
          id: "v2-policy-id",
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

  it("fetches V2 compliance policies before skipping unmarked deletes", async () => {
    const policyName = "[IHD] Linux Compliance";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        platforms: "linux",
        technologies: "linuxMdm",
      },
    ]);

    const client = createClient();
    vi.mocked(client.getCollection).mockResolvedValue([
      {
        id: "v2-policy-id",
        name: policyName,
        description: "Created manually",
      },
    ]);

    const context: ExecutionContext = {
      client,
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
    };

    const result = await executeComplianceTask(createTask(policyName, "delete"), context);

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error: "Not created by Hydration Kit",
    });
    expect(context.cachedV2CompliancePolicies).toEqual([
      {
        id: "v2-policy-id",
        name: policyName,
        description: "Created manually",
      },
    ]);
  });

  it("supports preview deletes for marked V2 compliance policies", async () => {
    const policyName = "[IHD] Linux Compliance";

    mockGetCachedTemplates.mockReturnValue([
      {
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
        platforms: "linux",
        technologies: "linuxMdm",
      },
    ]);

    const client = createClient();
    const result = await executeComplianceTask(createTask(policyName, "delete"), {
      client,
      operationMode: "delete",
      isPreview: true,
      stopOnFirstError: false,
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

  it("propagates delete helper skip reasons for V1 policies", async () => {
    const policyName = "Windows 11 Compliance";

    mockGetCachedTemplates.mockReturnValue([
      {
        "@odata.type": "#microsoft.graph.windows10CompliancePolicy",
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
      },
    ]);
    mockCompliancePolicyExists.mockResolvedValue(true);
    mockDeleteCompliancePolicyByName.mockResolvedValue({
      skipped: true,
      reason: "Policy has 2 active assignment(s)",
    });

    const result = await executeComplianceTask(createTask(policyName, "delete"), {
      client: createClient(),
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
    });

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error: "Policy has 2 active assignment(s)",
    });
  });

  it("marks V1 deletes successful after a 504 when verification shows the policy is gone", async () => {
    vi.useFakeTimers();
    const policyName = "Windows 11 Compliance";

    mockGetCachedTemplates.mockReturnValue([
      {
        "@odata.type": "#microsoft.graph.windows10CompliancePolicy",
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
      },
    ]);
    mockCompliancePolicyExists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    mockDeleteCompliancePolicyByName.mockRejectedValue(new Error("504 Gateway Timeout"));

    const promise = executeComplianceTask(createTask(policyName, "delete"), {
      client: createClient(),
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
    });

    await vi.runAllTimersAsync();
    const result = await promise;
    vi.useRealTimers();

    expect(result).toMatchObject({ success: true, skipped: false });
  });

  it("keeps the original 504 error when V1 delete verification still finds the policy", async () => {
    vi.useFakeTimers();
    const policyName = "Windows 11 Compliance";

    mockGetCachedTemplates.mockReturnValue([
      {
        "@odata.type": "#microsoft.graph.windows10CompliancePolicy",
        displayName: policyName,
        description: "Imported by Intune Hydration Kit",
      },
    ]);
    mockCompliancePolicyExists.mockResolvedValueOnce(true).mockResolvedValueOnce(true);
    mockDeleteCompliancePolicyByName.mockRejectedValue(new Error("504 Gateway Timeout"));

    const promise = executeComplianceTask(createTask(policyName, "delete"), {
      client: createClient(),
      operationMode: "delete",
      isPreview: false,
      stopOnFirstError: false,
    });

    await vi.runAllTimersAsync();
    const result = await promise;
    vi.useRealTimers();

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      error: "504 Gateway Timeout",
    });
  });
});
