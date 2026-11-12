import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExecutionContext } from "@/lib/hydration/types";
import type { HydrationTask } from "@/types/hydration";

/**
 * Regression tests for create-mode duplicate detection.
 * Template names carry the "[IHD] " prefix, which a Graph $filter cannot query.
 * Existence checks must use the prefetched tenant caches in sequential and batch paths.
 */

const { mockGetCachedTemplates, mockGetAllTemplateCacheKeys } = vi.hoisted(() => ({
  mockGetCachedTemplates: vi.fn(),
  mockGetAllTemplateCacheKeys: vi.fn(),
}));

vi.mock("@/lib/templates/loader", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/templates/loader")>();
  return {
    ...actual,
    getCachedTemplates: mockGetCachedTemplates,
    getAllTemplateCacheKeys: mockGetAllTemplateCacheKeys,
  };
});

import { executeCISBaselineTask } from "@/lib/hydration/taskExecutors/cisBaselineTask";
import { executeComplianceTask } from "@/lib/hydration/taskExecutors/complianceTask";
import { executeBaselineTask } from "@/lib/hydration/taskExecutors/baselineTask";
import { executeTasksInBatches } from "@/lib/hydration/batchExecutor";

const SETTINGS_CATALOG_TEMPLATE = {
  name: "[IHD] CIS Settings Catalog",
  displayName: "[IHD] CIS Settings Catalog",
  platforms: "windows10",
  technologies: "mdm",
  settings: [],
  _cisFilePath: "cis/settings-catalog.json",
};
const V2_COMPLIANCE_TEMPLATE = {
  "@odata.type": "#microsoft.graph.deviceManagementCompliancePolicy",
  name: "[IHD] CIS V2 Compliance",
  displayName: "[IHD] CIS V2 Compliance",
  platforms: "linux",
  technologies: "linuxMdm",
  settings: [{ "@odata.type": "#microsoft.graph.deviceManagementConfigurationSetting" }],
  _cisFilePath: "cis/v2-compliance.json",
};
const DEVICE_CONFIGURATION_TEMPLATE = {
  "@odata.type": "#microsoft.graph.windows10CustomConfiguration",
  displayName: "[IHD] CIS Device Configuration",
  _cisFilePath: "cis/device-configuration.json",
};
const LINUX_COMPLIANCE_TEMPLATE = {
  name: "[IHD] Linux Compliance",
  displayName: "[IHD] Linux Compliance",
  platforms: "linux",
  technologies: "linuxMdm",
  settings: [],
};
const CIS_TEMPLATES = [SETTINGS_CATALOG_TEMPLATE, V2_COMPLIANCE_TEMPLATE, DEVICE_CONFIGURATION_TEMPLATE];

function createClient() {
  return {
    get: vi.fn().mockResolvedValue({ value: [] }),
    getCollection: vi.fn().mockResolvedValue([]),
    post: vi.fn().mockResolvedValue({ id: "created-id" }),
    patch: vi.fn(),
    delete: vi.fn(),
    batch: vi.fn().mockResolvedValue({ responses: [] }),
  };
}

function createContext(client: ReturnType<typeof createClient>, overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    client: client as unknown as ExecutionContext["client"],
    operationMode: "create",
    isPreview: false,
    stopOnFirstError: true,
    ...overrides,
  };
}

function createTask(category: HydrationTask["category"], itemName: string, templatePath?: string): HydrationTask {
  return { id: `${category}-${itemName}`, category, operation: "create", itemName, templatePath, status: "pending" };
}

describe("create duplicate detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllTemplateCacheKeys.mockReturnValue(["intune-hydration-templates-cisBaseline"]);
    mockGetCachedTemplates.mockImplementation((key: string) => {
      if (key === "cisBaseline") return CIS_TEMPLATES;
      if (key === "compliance") return [LINUX_COMPLIANCE_TEMPLATE, { "@odata.type": "#microsoft.graph.windows10CompliancePolicy", displayName: "[IHD] Windows Compliance" }];
      return null;
    });
  });

  describe("sequential CIS creates", () => {
    it.each([
      ["Settings Catalog", SETTINGS_CATALOG_TEMPLATE, { cachedSettingsCatalogPolicies: [{ id: "sc-1", name: SETTINGS_CATALOG_TEMPLATE.name }] }],
      ["V2 Compliance", V2_COMPLIANCE_TEMPLATE, { cachedV2CompliancePolicies: [{ id: "v2-1", name: V2_COMPLIANCE_TEMPLATE.name }] }],
      ["Device Configuration", DEVICE_CONFIGURATION_TEMPLATE, { cachedDeviceConfigurations: [{ id: "dc-1", displayName: DEVICE_CONFIGURATION_TEMPLATE.displayName }] }],
    ])("skips an existing %s policy found in the tenant cache", async (_label, template, caches) => {
      const client = createClient();
      const result = await executeCISBaselineTask(
        createTask("cisBaseline", template.displayName, template._cisFilePath),
        createContext(client, caches as Partial<ExecutionContext>),
      );

      expect(result).toMatchObject({ success: true, skipped: true, skipKind: "noOp" });
      expect(client.post).not.toHaveBeenCalled();
    });

    it("fails instead of creating when the tenant cache was not loaded", async () => {
      const client = createClient();
      const result = await executeCISBaselineTask(
        createTask("cisBaseline", SETTINGS_CATALOG_TEMPLATE.displayName, SETTINGS_CATALOG_TEMPLATE._cisFilePath),
        createContext(client, { prefetchErrors: { cachedSettingsCatalogPolicies: "Forbidden" } }),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Settings Catalog policies");
      expect(result.error).toContain("Forbidden");
      expect(client.post).not.toHaveBeenCalled();
    });

    it("adds a created policy to the tenant cache so a second task with the same name is skipped", async () => {
      const client = createClient();
      const context = createContext(client, { cachedDeviceConfigurations: [] });
      const task = createTask("cisBaseline", DEVICE_CONFIGURATION_TEMPLATE.displayName, DEVICE_CONFIGURATION_TEMPLATE._cisFilePath);

      expect(await executeCISBaselineTask(task, context)).toMatchObject({ success: true, skipped: false });
      expect(await executeCISBaselineTask({ ...task, id: "again" }, context)).toMatchObject({ skipped: true });
      expect(client.post).toHaveBeenCalledTimes(1);
    });
  });

  describe("compliance creates", () => {
    it("skips an existing Linux (V2) compliance policy found in the tenant cache", async () => {
      const client = createClient();
      const result = await executeComplianceTask(
        createTask("compliance", LINUX_COMPLIANCE_TEMPLATE.displayName),
        createContext(client, { cachedV2CompliancePolicies: [{ id: "v2-1", name: LINUX_COMPLIANCE_TEMPLATE.name }] }),
      );

      expect(result).toMatchObject({ success: true, skipped: true, skipKind: "noOp" });
      expect(client.post).not.toHaveBeenCalled();
    });

    it("fails a Linux (V2) compliance create when the V2 cache was not loaded", async () => {
      // The engine turns the thrown error into a failed task.
      const client = createClient();
      await expect(
        executeComplianceTask(createTask("compliance", LINUX_COMPLIANCE_TEMPLATE.displayName), createContext(client)),
      ).rejects.toThrow("V2 Compliance policies");
      expect(client.post).not.toHaveBeenCalled();
    });

    it("skips an existing V1 compliance policy found in the tenant cache", async () => {
      const client = createClient();
      const result = await executeComplianceTask(
        createTask("compliance", "[IHD] Windows Compliance"),
        createContext(client, { cachedCompliancePolicies: [{ id: "v1-1", displayName: "[ihd] windows compliance" }] }),
      );

      expect(result).toMatchObject({ success: true, skipped: true, skipKind: "noOp" });
      expect(client.post).not.toHaveBeenCalled();
    });
  });

  it("fails an OpenIntuneBaseline Settings Catalog create when the cache was not loaded", async () => {
    const client = createClient();
    const result = await executeBaselineTask(
      createTask("baseline", "[IHD] OIB Policy"),
      createContext(client, {
        cachedBaselineTemplates: [
          { name: "[IHD] OIB Policy", displayName: "[IHD] OIB Policy", _oibPolicyType: "SettingsCatalog", _oibPlatform: "WINDOWS", _oibFilePath: "a.json" },
        ],
      }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Settings Catalog policies");
    expect(client.post).not.toHaveBeenCalled();
  });

  describe("batch creates", () => {
    it("checks CIS existence against the cache without a Graph query", async () => {
      const client = createClient();
      const results = await executeTasksInBatches(
        [createTask("cisBaseline", SETTINGS_CATALOG_TEMPLATE.displayName, SETTINGS_CATALOG_TEMPLATE._cisFilePath)],
        createContext(client, {
          stopOnFirstError: false,
          cachedSettingsCatalogPolicies: [{ id: "sc-1", name: SETTINGS_CATALOG_TEMPLATE.name }],
        }),
      );

      expect(results[0]).toMatchObject({ skipped: true, skipKind: "noOp" });
      expect(client.get).not.toHaveBeenCalled();
      expect(client.batch).not.toHaveBeenCalled();
    });

    it("sends a task to the sequential executor when its tenant cache was not loaded", async () => {
      const client = createClient();
      const results = await executeTasksInBatches(
        [createTask("cisBaseline", SETTINGS_CATALOG_TEMPLATE.displayName, SETTINGS_CATALOG_TEMPLATE._cisFilePath)],
        createContext(client, { stopOnFirstError: false }),
      );

      expect(results[0].error).toBe("NEEDS_SEQUENTIAL_EXECUTION");
      expect(client.batch).not.toHaveBeenCalled();
    });

    it("adds batch-created device configurations to the device configuration cache", async () => {
      const client = createClient();
      client.batch.mockResolvedValue({
        responses: [{ id: "req-0", status: 201, body: { id: "dc-new", displayName: DEVICE_CONFIGURATION_TEMPLATE.displayName } }],
      });
      const context = createContext(client, {
        stopOnFirstError: false,
        cachedDeviceConfigurations: [],
        cachedGroupPolicyConfigurations: [],
      });

      await executeTasksInBatches(
        [createTask("cisBaseline", DEVICE_CONFIGURATION_TEMPLATE.displayName, DEVICE_CONFIGURATION_TEMPLATE._cisFilePath)],
        context,
      );

      expect(context.cachedDeviceConfigurations).toEqual([
        expect.objectContaining({ id: "dc-new", displayName: DEVICE_CONFIGURATION_TEMPLATE.displayName }),
      ]);
      expect(context.cachedGroupPolicyConfigurations).toEqual([]);
    });
  });
});
