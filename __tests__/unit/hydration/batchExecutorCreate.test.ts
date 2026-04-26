import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExecutionContext } from "@/lib/hydration/types";
import type { HydrationTask } from "@/types/hydration";

const {
  mockGetCachedTemplates,
  mockGetAllTemplateCacheKeys,
  mockGetConditionalAccessPolicyByName,
  mockDetectCISPolicyType,
} = vi.hoisted(() => ({
  mockGetCachedTemplates: vi.fn(),
  mockGetAllTemplateCacheKeys: vi.fn(),
  mockGetConditionalAccessPolicyByName: vi.fn(),
  mockDetectCISPolicyType: vi.fn(),
}));

vi.mock("@/lib/templates/loader", async () => {
  const actual = await vi.importActual("@/lib/templates/loader");
  return {
    ...actual,
    getAllTemplateCacheKeys: mockGetAllTemplateCacheKeys,
    getCachedTemplates: mockGetCachedTemplates,
  };
});

vi.mock("@/templates", async () => {
  const actual = await vi.importActual("@/templates");
  return {
    ...actual,
    getConditionalAccessPolicyByName: mockGetConditionalAccessPolicyByName,
  };
});

vi.mock("@/lib/hydration/policyDetection", async () => {
  const actual = await vi.importActual("@/lib/hydration/policyDetection");
  return {
    ...actual,
    detectCISPolicyType: mockDetectCISPolicyType,
  };
});

import { executeTasksInBatches } from "@/lib/hydration/batchExecutor";

describe("executeTasksInBatches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips preview create for conditional access when the API fallback finds an existing policy", async () => {
    const policyName = "[IHD] Require password change for high-risk users";

    mockGetCachedTemplates.mockImplementation((category?: string) => {
      if (category === "conditionalAccess") {
        return [
          {
            displayName: policyName,
            state: "disabled",
            conditions: {},
            grantControls: { operator: "OR", builtInControls: ["mfa"] },
          },
        ];
      }
      return undefined;
    });
    mockGetConditionalAccessPolicyByName.mockReturnValue(undefined);

    const task: HydrationTask = {
      id: "batch-preview-existing-ca",
      category: "conditionalAccess",
      operation: "create",
      itemName: policyName,
      status: "pending",
    };

    const client = {
      get: vi.fn(),
      post: vi.fn(),
      delete: vi.fn(),
      getCollection: vi.fn().mockImplementation((endpoint: string) => {
        if (endpoint === "/identity/conditionalAccess/policies") {
          return Promise.resolve([
            {
              id: "ca-id",
              displayName: policyName,
              state: "disabled",
            },
          ]);
        }
        return Promise.resolve([]);
      }),
      patch: vi.fn(),
      batch: vi.fn(),
    } as unknown as ExecutionContext["client"];

    const context: ExecutionContext = {
      client,
      operationMode: "create",
      isPreview: true,
      stopOnFirstError: false,
      cachedConditionalAccessPolicies: [],
    };

    const results = await executeTasksInBatches([task], context);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      success: false,
      skipped: true,
      error: "Already exists",
    });
    expect(client.batch).not.toHaveBeenCalled();
  });

  it("skips preview create for CIS security intents when the API fallback finds an existing policy", async () => {
    const policyName = "[IHD] Baseline - MacOS - Firewall";

    mockGetCachedTemplates.mockImplementation((category?: string) => {
      if (category === "cisBaseline") {
        return [
          {
            "@odata.type": "#microsoft.graph.deviceManagementIntent",
            displayName: policyName,
            description: "",
            templateId: "template-1",
            roleScopeTagIds: ["0"],
            settings: [],
          },
        ];
      }
      if (category === "cisBaseline-cis-endpoint-security") {
        return [
          {
            "@odata.type": "#microsoft.graph.deviceManagementIntent",
            displayName: policyName,
            description: "",
            templateId: "template-1",
            roleScopeTagIds: ["0"],
            settings: [],
          },
        ];
      }
      return undefined;
    });
    mockGetConditionalAccessPolicyByName.mockReturnValue(undefined);
    mockDetectCISPolicyType.mockReturnValue("SecurityIntent");
    mockGetAllTemplateCacheKeys.mockReturnValue([
      "intune-hydration-templates-cisBaseline-cis-endpoint-security",
    ]);

    const task: HydrationTask = {
      id: "batch-preview-existing-security-intent",
      category: "cisBaseline",
      operation: "create",
      itemName: policyName,
      status: "pending",
    };

    const client = {
      get: vi.fn(),
      post: vi.fn(),
      delete: vi.fn(),
      getCollection: vi.fn().mockImplementation((endpoint: string) => {
        if (endpoint === "/deviceManagement/intents?$select=id,displayName") {
          return Promise.resolve([
            {
              id: "intent-id",
              displayName: policyName,
            },
          ]);
        }
        return Promise.resolve([]);
      }),
      patch: vi.fn(),
      batch: vi.fn(),
    } as unknown as ExecutionContext["client"];

    const context: ExecutionContext = {
      client,
      operationMode: "create",
      isPreview: true,
      stopOnFirstError: false,
      cachedSecurityIntents: [],
    };

    const results = await executeTasksInBatches([task], context);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      success: false,
      skipped: true,
      error: `SecurityIntent "${policyName}" already exists`,
    });
    expect(client.batch).not.toHaveBeenCalled();
  });

  it("does not retry an entire create batch when the batch request itself fails", async () => {
    const policyName = "[IHD] Require password change for high-risk users";

    mockGetCachedTemplates.mockImplementation((category?: string) => {
      if (category === "conditionalAccess") {
        return [
          {
            displayName: policyName,
            state: "disabled",
            conditions: {},
            grantControls: { operator: "OR", builtInControls: ["mfa"] },
          },
        ];
      }
      return undefined;
    });
    mockGetConditionalAccessPolicyByName.mockReturnValue(undefined);

    const task: HydrationTask = {
      id: "batch-create-http-failure",
      category: "conditionalAccess",
      operation: "create",
      itemName: policyName,
      status: "pending",
    };

    const batchError = new Error("[503] Service unavailable");
    const client = {
      get: vi.fn(),
      post: vi.fn(),
      delete: vi.fn(),
      getCollection: vi.fn().mockResolvedValue([]),
      patch: vi.fn(),
      batch: vi.fn().mockRejectedValue(batchError),
    } as unknown as ExecutionContext["client"];

    const context: ExecutionContext = {
      client,
      operationMode: "create",
      isPreview: false,
      stopOnFirstError: false,
      cachedConditionalAccessPolicies: [],
    };

    const results = await executeTasksInBatches([task], context);

    expect(client.batch).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      success: false,
      skipped: false,
      error: "[503] Service unavailable",
    });
  });
});
