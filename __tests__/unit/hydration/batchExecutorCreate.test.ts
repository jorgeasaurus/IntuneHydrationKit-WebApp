import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExecutionContext } from "@/lib/hydration/types";
import type { HydrationTask } from "@/types/hydration";

const {
  mockGetCachedTemplates,
  mockGetAllTemplateCacheKeys,
  mockDetectCISPolicyType,
} = vi.hoisted(() => ({
  mockGetCachedTemplates: vi.fn(),
  mockGetAllTemplateCacheKeys: vi.fn(),
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

vi.mock("@/lib/hydration/policyDetection", async () => {
  const actual = await vi.importActual("@/lib/hydration/policyDetection");
  return {
    ...actual,
    detectCISPolicyType: mockDetectCISPolicyType,
  };
});

import { executeTasksInBatches } from "@/lib/hydration/batchExecutor";
import { CONDITIONAL_ACCESS_POLICIES_ENDPOINT } from "@/lib/graph/conditionalAccess";

type ConditionalAccessTemplate = Record<string, unknown>;
type MockGraphClient = ExecutionContext["client"] & {
  batch: ReturnType<typeof vi.fn>;
  getCollection: ReturnType<typeof vi.fn>;
};

function mockConditionalAccessTemplate(template: ConditionalAccessTemplate): void {
  mockGetCachedTemplates.mockImplementation((category?: string) => {
    if (category === "conditionalAccess") {
      return [template];
    }
    return undefined;
  });
}

function accountRecoveryConditionalAccessTemplate(policyName: string): ConditionalAccessTemplate {
  return {
    displayName: policyName,
    state: "disabled",
    sessionControls: null,
    conditions: {
      locations: null,
      applications: {
        includeApplications: [],
        includeUserActions: ["urn:user:accountrecovery"],
        networkAccess: null,
      },
    },
    grantControls: {
      operator: "AND",
      builtInControls: ["verifiedID"],
      "authenticationStrength@odata.context": "https://graph.microsoft.com/beta/$metadata#conditionalAccess/templates('template-id')/details/grantControls/authenticationStrength/$entity",
      authenticationStrength: null,
    },
  };
}

function createConditionalAccessTask(id: string, itemName: string): HydrationTask {
  return {
    id,
    category: "conditionalAccess",
    operation: "create",
    itemName,
    status: "pending",
  };
}

function createBatchClient({
  batchResult,
  batchError,
  getCollection = vi.fn().mockResolvedValue([]),
}: {
  batchResult?: unknown;
  batchError?: Error;
  getCollection?: ReturnType<typeof vi.fn>;
} = {}): MockGraphClient {
  const batch = batchError
    ? vi.fn().mockRejectedValue(batchError)
    : vi.fn().mockResolvedValue(batchResult ?? {
        responses: [{ id: "req-0", status: 201, body: { id: "created-id" } }],
      });

  return {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    getCollection,
    patch: vi.fn(),
    batch,
  } as unknown as MockGraphClient;
}

function createCreateContext(
  client: ExecutionContext["client"],
  overrides: Partial<ExecutionContext> = {}
): ExecutionContext {
  return {
    client,
    operationMode: "create",
    isPreview: false,
    stopOnFirstError: false,
    cachedConditionalAccessPolicies: [],
    ...overrides,
  };
}

describe("executeTasksInBatches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips preview create for conditional access when the API fallback finds an existing policy", async () => {
    const policyName = "[IHD] Require password change for high-risk users";

    mockConditionalAccessTemplate({
      displayName: policyName,
      state: "disabled",
      conditions: {},
      grantControls: { operator: "OR", builtInControls: ["mfa"] },
    });
    const task = createConditionalAccessTask("batch-preview-existing-ca", policyName);
    const client = createBatchClient({
      getCollection: vi.fn().mockImplementation((endpoint: string) => {
        if (endpoint === CONDITIONAL_ACCESS_POLICIES_ENDPOINT) {
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
    });
    const context = createCreateContext(client, { isPreview: true });

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

  it("resolves CIS batch templates by selected file path when display names collide", async () => {
    mockGetCachedTemplates.mockImplementation((category?: string) => {
      if (category === "cisBaseline") {
        return [
          {
            displayName: "[IHD] Duplicate CIS Policy",
            name: "[IHD] Duplicate CIS Policy",
            description: "first",
            platforms: "windows10",
            technologies: "mdm",
            settings: [],
            _cisFilePath: "cis/path-a.json",
          },
          {
            displayName: "[IHD] Duplicate CIS Policy",
            name: "[IHD] Duplicate CIS Policy",
            description: "second",
            platforms: "windows10",
            technologies: "mdm",
            settings: [],
            _cisFilePath: "cis/path-b.json",
          },
        ];
      }
      return undefined;
    });
    mockGetAllTemplateCacheKeys.mockReturnValue(["intune-hydration-templates-cisBaseline"]);
    mockDetectCISPolicyType.mockReturnValue("SettingsCatalog");

    const task: HydrationTask = {
      id: "batch-create-cis-path",
      category: "cisBaseline",
      operation: "create",
      itemName: "[IHD] Duplicate CIS Policy",
      templatePath: "cis/path-b.json",
      status: "pending",
    };
    const client = createBatchClient();
    const context = createCreateContext(client);

    await executeTasksInBatches([task], context);

    expect(client.batch).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          body: expect.objectContaining({
            description: expect.stringContaining("second"),
          }),
        }),
      ],
      "beta"
    );
  });

  it("replaces OIB organization placeholders in batch Settings Catalog requests", async () => {
    const policyName = "[IHD] OneDrive configuration";
    const tenantId = "12345678-1234-1234-1234-123456789abc";
    mockGetCachedTemplates.mockImplementation((category?: string) => {
      if (category === "baseline") {
        return [
          {
            name: policyName,
            displayName: policyName,
            description: "Imported by Intune Hydration Kit",
            platforms: "windows10",
            technologies: "mdm",
            _oibPolicyType: "SettingsCatalog",
            settings: [
              {
                settingInstance: {
                  simpleSettingValue: { value: "%OrganizationId%" },
                },
              },
            ],
          },
        ];
      }
      return undefined;
    });

    const task: HydrationTask = {
      id: "batch-create-oib-onedrive",
      category: "baseline",
      operation: "create",
      itemName: policyName,
      status: "pending",
    };
    const client = createBatchClient();

    await executeTasksInBatches([task], createCreateContext(client, { tenantId }));

    expect(client.batch).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          body: expect.objectContaining({
            settings: [
              expect.objectContaining({
                settingInstance: {
                  simpleSettingValue: { value: tenantId },
                },
              }),
            ],
          }),
        }),
      ],
      "beta"
    );
  });

  it("does not retry an entire create batch when the batch request itself fails", async () => {
    const policyName = "[IHD] Require password change for high-risk users";

    mockConditionalAccessTemplate({
      displayName: policyName,
      state: "disabled",
      conditions: {},
      grantControls: { operator: "OR", builtInControls: ["mfa"] },
    });
    const task = createConditionalAccessTask("batch-create-http-failure", policyName);
    const batchError = new Error("[503] Service unavailable");
    const client = createBatchClient({ batchError });
    const context = createCreateContext(client);

    const results = await executeTasksInBatches([task], context);

    expect(client.batch).toHaveBeenCalledTimes(1);
    expect(client.batch).toHaveBeenCalledWith(expect.any(Array), "v1.0");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      success: false,
      skipped: false,
      error: "[503] Service unavailable",
    });
  });

  it("routes preview conditional access creates through the beta batch endpoint", async () => {
    const policyName = "[IHD] Secure account recovery with identity verification (Preview)";

    mockConditionalAccessTemplate(accountRecoveryConditionalAccessTemplate(policyName));
    const task = createConditionalAccessTask("batch-create-preview-ca-beta", policyName);
    const client = createBatchClient({
      batchResult: {
        responses: [{ id: "req-0", status: 201, body: { id: "preview-ca-id" } }],
      },
    });
    const context = createCreateContext(client);

    const results = await executeTasksInBatches([task], context);

    expect(client.batch).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          method: "POST",
          url: CONDITIONAL_ACCESS_POLICIES_ENDPOINT,
          body: expect.objectContaining({
            displayName: policyName,
            grantControls: expect.objectContaining({
              builtInControls: ["verifiedID"],
            }),
          }),
        }),
      ],
      "beta"
    );

    const batchMock = vi.mocked(client.batch);
    const requests = batchMock.mock.calls[0][0] as Array<{ body: Record<string, unknown> }>;
    const requestBody = requests[0].body;
    expect(requestBody).not.toHaveProperty("sessionControls");

    const conditions = requestBody.conditions as Record<string, unknown>;
    expect(conditions).not.toHaveProperty("locations");

    const applications = conditions.applications as Record<string, unknown>;
    expect(applications).not.toHaveProperty("networkAccess");
    expect(applications).toHaveProperty("includeUserActions", ["urn:user:accountrecovery"]);

    const grantControls = requestBody.grantControls as Record<string, unknown>;
    expect(grantControls).not.toHaveProperty("authenticationStrength@odata.context");
    expect(grantControls).not.toHaveProperty("authenticationStrength");
    expect(grantControls).toHaveProperty("builtInControls", ["verifiedID"]);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      success: true,
      skipped: false,
      createdId: "preview-ca-id",
    });
  });

  it("routes preview-named stable conditional access creates through the v1.0 batch endpoint", async () => {
    const policyName = "[IHD] Require compliant device (Preview)";

    mockConditionalAccessTemplate({
      displayName: policyName,
      state: "disabled",
      conditions: {
        applications: {
          includeApplications: ["All"],
        },
      },
      grantControls: {
        operator: "OR",
        builtInControls: ["mfa"],
      },
    });
    const task = createConditionalAccessTask("batch-create-preview-named-stable-ca-v1", policyName);
    const client = createBatchClient({
      batchResult: {
        responses: [{ id: "req-0", status: 201, body: { id: "stable-ca-id" } }],
      },
    });
    const context = createCreateContext(client);

    await executeTasksInBatches([task], context);

    expect(client.batch).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          method: "POST",
          url: CONDITIONAL_ACCESS_POLICIES_ENDPOINT,
          body: expect.objectContaining({
            displayName: policyName,
            grantControls: expect.objectContaining({
              builtInControls: ["mfa"],
            }),
          }),
        }),
      ],
      "v1.0"
    );
  });

  it("logs diagnostics for malformed conditional access batch create failures", async () => {
    const policyName = "[IHD] Secure account recovery with identity verification (Preview)";
    const malformedMessage = "The server could not process the request because it is malformed or incorrect.";
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      mockConditionalAccessTemplate(accountRecoveryConditionalAccessTemplate(policyName));
      const task = createConditionalAccessTask("batch-create-preview-ca-malformed", policyName);
      const client = createBatchClient({
        batchResult: {
          responses: [
            {
              id: "req-0",
              status: 400,
              body: {
                error: {
                  code: "BadRequest",
                  message: malformedMessage,
                },
              },
            },
          ],
        },
      });
      const context = createCreateContext(client);

      const results = await executeTasksInBatches([task], context);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[BatchExecutor] Conditional Access create failed diagnostics:",
        expect.objectContaining({
          task: expect.objectContaining({
            id: "batch-create-preview-ca-malformed",
            itemName: policyName,
            category: "conditionalAccess",
          }),
          request: expect.objectContaining({
            id: "req-0",
            method: "POST",
            url: CONDITIONAL_ACCESS_POLICIES_ENDPOINT,
            apiVersion: "beta",
            body: expect.objectContaining({
              displayName: policyName,
              grantControls: expect.objectContaining({
                builtInControls: ["verifiedID"],
              }),
            }),
          }),
          response: expect.objectContaining({
            id: "req-0",
            status: 400,
            code: "BadRequest",
            message: malformedMessage,
          }),
        })
      );
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        success: false,
        skipped: false,
        error: malformedMessage,
      });
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("skips AccountRecovery policies when the tenant is not authorized for the private preview", async () => {
    const policyName = "[IHD] Secure account recovery with identity verification (Preview)";
    const malformedMessage = "The server could not process the request because it is malformed or incorrect.";
    const innerMessage = "1101: The tenant must be explicitly authorized to use the private preview feature: AccountRecovery.";
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      mockConditionalAccessTemplate(accountRecoveryConditionalAccessTemplate(policyName));

      const onTaskComplete = vi.fn();
      const onTaskError = vi.fn();
      const task = createConditionalAccessTask("batch-create-account-recovery-private-preview", policyName);
      const client = createBatchClient({
        batchResult: {
          responses: [
            {
              id: "req-0",
              status: 400,
              body: {
                error: {
                  code: "BadRequest",
                  message: malformedMessage,
                  innerError: {
                    message: innerMessage,
                  },
                },
              },
            },
          ],
        },
      });
      const context = createCreateContext(client, {
        onTaskComplete,
        onTaskError,
      });

      const results = await executeTasksInBatches([task], context);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        success: false,
        skipped: true,
        error: "Requires tenant authorization for Microsoft Graph private preview feature: AccountRecovery",
      });
      expect(task).toMatchObject({
        status: "skipped",
        error: "Requires tenant authorization for Microsoft Graph private preview feature: AccountRecovery",
      });
      expect(onTaskComplete).toHaveBeenCalledWith(task);
      expect(onTaskError).not.toHaveBeenCalled();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
