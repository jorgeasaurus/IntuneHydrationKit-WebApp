import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { executeDeleteTask, resolveDeleteTarget } from "@/lib/hydration/deleteResolver";
import { executeNotificationTask } from "@/lib/hydration/taskExecutors/notificationTask";
import { cacheTemplates, clearCategoryCache } from "@/lib/templates/loader";
import { hasNotificationTemplateMarker } from "@/lib/utils/hydrationMarker";
import type { ExecutionContext } from "@/lib/hydration/types";
import type { HydrationTask } from "@/types/hydration";

const ENDPOINT = "/deviceManagement/notificationMessageTemplates";
const V1_REFERENCES =
  "/deviceManagement/deviceCompliancePolicies?$select=id,displayName&$expand=scheduledActionsForRule($expand=scheduledActionConfigurations)";
const V2_REFERENCES =
  "/deviceManagement/compliancePolicies?$select=id,name&$expand=scheduledActionsForRule($expand=scheduledActionConfigurations)";
const ENROLLMENT_CONFIGURATIONS = "/deviceManagement/deviceEnrollmentConfigurations";
const NOTIFICATION_TYPE = "#microsoft.graph.deviceEnrollmentNotificationConfiguration";
const KIT_NAME = "[IHD] First Alert";

type TenantTemplate = { id: string; displayName?: string };

function createTask(itemName = KIT_NAME): HydrationTask {
  return { id: `notification-${itemName}`, category: "notification", operation: "delete", itemName, status: "pending" };
}

function blockAction(templateId: string) {
  return {
    scheduledActionConfigurations: [
      { actionType: "block", notificationTemplateId: "00000000-0000-0000-0000-000000000000" },
      { actionType: "notification", notificationTemplateId: templateId },
    ],
  };
}

/**
 * Client that serves the template by ID from `tenant` and the compliance policy lists
 * from `v1Policies` / `v2Policies`.
 */
function createClient({
  tenant = [{ id: "tmpl-id", displayName: KIT_NAME }] as TenantTemplate[],
  v1Policies = [] as Array<Record<string, unknown>>,
  v2Policies = [] as Array<Record<string, unknown>>,
  enrollmentConfigurations = [] as Array<Record<string, unknown>>,
} = {}) {
  return {
    get: vi.fn(async (endpoint: string) => {
      const id = endpoint.split("/").pop();
      const match = tenant.find((item) => item.id === id);
      if (!match) throw Object.assign(new Error("[404] ResourceNotFound"), { status: 404 });
      return match;
    }),
    getCollection: vi.fn(async (endpoint: string) => {
      if (endpoint === V1_REFERENCES) return v1Policies;
      if (endpoint === V2_REFERENCES) return v2Policies;
      if (endpoint === ENROLLMENT_CONFIGURATIONS) return enrollmentConfigurations;
      throw new Error(`Unexpected list read ${endpoint}`);
    }),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

function createContext(
  client: ReturnType<typeof createClient>,
  overrides: Partial<ExecutionContext> = {}
): ExecutionContext {
  return {
    client: client as unknown as ExecutionContext["client"],
    operationMode: "delete",
    isPreview: false,
    stopOnFirstError: false,
    cachedNotificationTemplates: [{ id: "tmpl-id", displayName: KIT_NAME }],
    ...overrides,
  };
}

describe("notification template delete", () => {
  beforeEach(() => {
    cacheTemplates("notification", [{ displayName: KIT_NAME, localizedMessages: [] }]);
  });

  afterEach(() => {
    clearCategoryCache("notification");
  });

  it("deletes a kit template that no compliance policy uses", async () => {
    const client = createClient({
      v1Policies: [{ id: "p1", displayName: "Other policy", scheduledActionsForRule: [blockAction("other-id")] }],
      v2Policies: [{ id: "p2", name: "Linux", scheduledActionsForRule: [] }],
      enrollmentConfigurations: [
        { "@odata.type": "#microsoft.graph.windows10EnrollmentCompletionPageConfiguration", id: "esp", displayName: "ESP" },
        {
          "@odata.type": NOTIFICATION_TYPE,
          id: "en1",
          displayName: "Other notification",
          notificationMessageTemplateId: "other-id",
          notificationTemplates: ["email_other-id"],
        },
      ],
    });
    const context = createContext(client);

    const result = await executeNotificationTask(createTask(), context);

    expect(result).toEqual({ task: expect.anything(), success: true, skipped: false });
    // The resolver reads the template again before the delete.
    expect(client.get).toHaveBeenCalledWith(`${ENDPOINT}/tmpl-id`, "beta");
    expect(client.getCollection).toHaveBeenCalledWith(V1_REFERENCES);
    expect(client.getCollection).toHaveBeenCalledWith(V2_REFERENCES);
    expect(client.getCollection).toHaveBeenCalledWith(ENROLLMENT_CONFIGURATIONS);
    expect(client.delete).toHaveBeenCalledWith(`${ENDPOINT}/tmpl-id`, "beta");
    expect(context.cachedNotificationTemplates).toEqual([]);
  });

  it("resolves with the reference count in the checks", async () => {
    const resolution = await resolveDeleteTarget(createTask(), createContext(createClient()));

    expect(resolution).toMatchObject({
      action: "delete",
      target: { id: "tmpl-id", url: `${ENDPOINT}/tmpl-id`, apiVersion: "beta", assignmentsUrl: null },
      checks: { marker: "present", assignments: "notApplicable", references: 0 },
    });
  });

  it.each([
    ["has no [IHD] prefix", "First Alert"],
    ["is an [IHD] name that is not a kit template", "[IHD] My Own Alert"],
  ])("blocks a template whose name %s", async (_label, tenantName) => {
    const client = createClient({ tenant: [{ id: "tmpl-id", displayName: tenantName }] });
    const context = createContext(client, { cachedNotificationTemplates: [{ id: "tmpl-id", displayName: tenantName }] });

    const result = await executeDeleteTask(createTask(tenantName), context);

    expect(result).toMatchObject({ success: false, skipped: true, skipKind: "blocked" });
    expect(result.error).toContain("Not created by Intune Hydration Kit");
    expect(client.delete).not.toHaveBeenCalled();
  });

  it("blocks when the marker was removed after the prefetch (the re-read checks the display name)", async () => {
    const client = createClient({ tenant: [{ id: "tmpl-id", displayName: "First Alert (renamed)" }] });

    const result = await executeDeleteTask(createTask(), createContext(client));

    expect(result).toMatchObject({ skipped: true, skipKind: "blocked" });
    expect(result.error).toContain("display name");
    expect(client.getCollection).not.toHaveBeenCalled();
    expect(client.delete).not.toHaveBeenCalled();
  });

  it.each([
    [
      "a compliance policy",
      { v1Policies: [{ id: "p1", displayName: "Windows Compliance", scheduledActionsForRule: [blockAction("TMPL-ID")] }] },
      "Windows Compliance",
    ],
    [
      "a Settings Catalog compliance policy",
      { v2Policies: [{ id: "p2", name: "Linux Compliance", scheduledActionsForRule: [blockAction("tmpl-id")] }] },
      "Linux Compliance",
    ],
  ])("blocks a template that %s uses", async (_label, lists, policyName) => {
    const client = createClient(lists);

    const resolution = await resolveDeleteTarget(createTask(), createContext(client));

    expect(resolution).toMatchObject({
      action: "skip",
      skipKind: "blocked",
      checks: { marker: "present", references: 1 },
    });
    expect(resolution.action === "skip" && resolution.reason).toContain(policyName);
    expect(client.delete).not.toHaveBeenCalled();
  });

  it.each([
    [
      "notificationMessageTemplateId",
      { notificationMessageTemplateId: "TMPL-ID", notificationTemplates: [] },
    ],
    [
      "a notificationTemplates entry",
      { notificationMessageTemplateId: "00000000-0000-0000-0000-000000000000", notificationTemplates: ["push_tmpl-id"] },
    ],
    [
      "a notificationTemplates entry on a configuration identified by its configuration type",
      { deviceEnrollmentConfigurationType: "enrollmentNotificationsConfiguration", notificationTemplates: ["email_tmpl-id"] },
    ],
  ])("blocks a template that an enrollment notification uses through %s", async (_label, fields) => {
    const odataType = "deviceEnrollmentConfigurationType" in fields ? {} : { "@odata.type": NOTIFICATION_TYPE };
    const client = createClient({
      enrollmentConfigurations: [{ ...odataType, id: "en1", displayName: "Enrollment Alert", ...fields }],
    });

    const result = await executeDeleteTask(createTask(), createContext(client));

    expect(result).toMatchObject({ success: false, skipped: true, skipKind: "blocked" });
    expect(result.error).toContain('enrollment notification "Enrollment Alert"');
    expect(client.delete).not.toHaveBeenCalled();
  });

  it("fails without a delete when the enrollment configurations cannot be read", async () => {
    const client = createClient();
    client.getCollection.mockImplementation(async (endpoint: string) => {
      if (endpoint === ENROLLMENT_CONFIGURATIONS) throw new Error("[403] Forbidden");
      return [];
    });

    const result = await executeDeleteTask(createTask(), createContext(client));

    expect(result).toMatchObject({ success: false, skipped: false });
    expect(result.error).toContain("[403] Forbidden");
    expect(client.delete).not.toHaveBeenCalled();
  });

  it.each([
    ["has no type", { id: "x", displayName: "Unknown" }, "Could not determine the type"],
    [
      "is a notification without template fields",
      { "@odata.type": NOTIFICATION_TYPE, id: "en1", displayName: "Partial" },
      "Could not read the notification templates",
    ],
  ])("fails without a delete when an enrollment configuration %s", async (_label, configuration, message) => {
    const client = createClient({ enrollmentConfigurations: [configuration] });

    const result = await executeDeleteTask(createTask(), createContext(client));

    expect(result).toMatchObject({ success: false, skipped: false });
    expect(result.error).toContain(message);
    expect(client.delete).not.toHaveBeenCalled();
  });

  it("skips a template that is not in the tenant", async () => {
    const client = createClient();

    const result = await executeDeleteTask(createTask(), createContext(client, { cachedNotificationTemplates: [] }));

    expect(result).toMatchObject({ success: false, skipped: true, skipKind: "noOp", error: "Not found in tenant" });
    expect(client.delete).not.toHaveBeenCalled();
  });

  it("skips a template that was deleted after the prefetch", async () => {
    const client = createClient({ tenant: [] });

    const result = await executeDeleteTask(createTask(), createContext(client));

    expect(result).toMatchObject({ skipped: true, skipKind: "noOp" });
    expect(client.delete).not.toHaveBeenCalled();
  });

  it("fails without a delete when the template cannot be read again", async () => {
    const client = createClient();
    client.get.mockRejectedValue(Object.assign(new Error("[500] Internal error"), { status: 500 }));

    const result = await executeDeleteTask(createTask(), createContext(client));

    expect(result).toMatchObject({ success: false, skipped: false });
    expect(result.error).toContain("Safety checks did not complete");
    expect(client.delete).not.toHaveBeenCalled();
  });

  it("fails without a delete when the compliance policies cannot be read", async () => {
    const client = createClient();
    client.getCollection.mockImplementation(async (endpoint: string) => {
      if (endpoint === V1_REFERENCES) return [];
      throw new Error("[400] Expand is not supported");
    });

    const result = await executeDeleteTask(createTask(), createContext(client));

    expect(result).toMatchObject({ success: false, skipped: false });
    expect(result.error).toContain("Expand is not supported");
    expect(client.delete).not.toHaveBeenCalled();
  });

  it.each([
    ["without its action list", { v1Policies: [{ id: "p1", displayName: "No actions" }] }],
    [
      "with an action without its configurations",
      { v2Policies: [{ id: "p2", name: "No configurations", scheduledActionsForRule: [{}] }] },
    ],
  ])("fails without a delete when a policy comes back %s", async (_label, lists) => {
    const client = createClient(lists);

    const result = await executeDeleteTask(createTask(), createContext(client));

    expect(result).toMatchObject({ success: false, skipped: false });
    expect(result.error).toContain("Could not read the noncompliance actions");
    expect(client.delete).not.toHaveBeenCalled();
  });

  it("fails when the tenant templates were not prefetched", async () => {
    const client = createClient();

    const result = await executeDeleteTask(
      createTask(),
      createContext(client, { cachedNotificationTemplates: undefined, prefetchErrors: { cachedNotificationTemplates: "[403]" } })
    );

    expect(result).toMatchObject({ success: false, skipped: false });
    expect(result.error).toContain("notification templates");
    expect(client.delete).not.toHaveBeenCalled();
  });

  it("fails when the kit templates are not loaded, because the marker cannot be checked", async () => {
    clearCategoryCache("notification");
    const client = createClient();

    const result = await executeDeleteTask(createTask(), createContext(client));

    expect(result).toMatchObject({ success: false, skipped: false });
    expect(result.error).toContain("notification templates are not loaded");
    expect(client.delete).not.toHaveBeenCalled();
  });

  it("runs the same checks in preview mode with GET requests only", async () => {
    const used = createClient({
      v1Policies: [{ id: "p1", displayName: "Windows Compliance", scheduledActionsForRule: [blockAction("tmpl-id")] }],
    });
    const unused = createClient();

    const blocked = await executeDeleteTask(createTask(), createContext(used, { isPreview: true }));
    const wouldDelete = await executeDeleteTask(createTask(), createContext(unused, { isPreview: true }));

    expect(blocked).toMatchObject({ skipped: true, skipKind: "blocked", error: expect.stringMatching(/^Would skip: /) });
    expect(wouldDelete).toEqual({ task: expect.anything(), success: true, skipped: false });
    for (const client of [used, unused]) {
      expect(client.delete).not.toHaveBeenCalled();
      expect(client.post).not.toHaveBeenCalled();
      expect(client.patch).not.toHaveBeenCalled();
    }
    expect(unused.get).toHaveBeenCalledWith(`${ENDPOINT}/tmpl-id`, "beta");
  });
});

describe("hasNotificationTemplateMarker", () => {
  it.each([
    [KIT_NAME, true],
    ["[IHD] FIRST ALERT", true],
    ["First Alert", false],
    ["[ihd] First Alert", false],
    ["[IHD] Other Alert", false],
    [undefined, false],
  ])("%s -> %s", (name, expected) => {
    expect(hasNotificationTemplateMarker(name, [KIT_NAME])).toBe(expected);
  });

  it("does not accept a kit name list entry without the prefix", () => {
    expect(hasNotificationTemplateMarker("[IHD] First Alert", ["First Alert"])).toBe(false);
  });
});
