import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { executeNotificationTask } from "@/lib/hydration/taskExecutors/notificationTask";
import { executeTasks } from "@/lib/hydration/engine";
import { cacheTemplates, clearCategoryCache } from "@/lib/templates/loader";
import { RunCancelledError } from "@/lib/utils/retry";
import type { ExecutionContext } from "@/lib/hydration/types";
import type { HydrationTask } from "@/types/hydration";

const ENDPOINT = "/deviceManagement/notificationMessageTemplates";

const TEMPLATE = {
  displayName: "[IHD] First Alert",
  brandingOptions: "includeCompanyLogo,includeCompanyName,includeContactInformation",
  roleScopeTagIds: ["0"],
  localizedMessages: [
    { isDefault: true, locale: "en-US", messageTemplate: "Your device is not compliant.", subject: "First Warning" },
    { isDefault: false, locale: "de-DE", messageTemplate: "Ihr Gerät ist nicht konform.", subject: "Erste Warnung" },
  ],
};

function createTask(operation: HydrationTask["operation"] = "create"): HydrationTask {
  return { id: "notification-1", category: "notification", operation, itemName: TEMPLATE.displayName, status: "pending" };
}

function createClient() {
  return {
    get: vi.fn(),
    getCollection: vi.fn().mockResolvedValue([]),
    post: vi.fn<(endpoint: string, body: unknown) => Promise<Record<string, unknown>>>(async (endpoint) =>
      endpoint === ENDPOINT ? { id: "new-id", displayName: TEMPLATE.displayName } : { id: "message-id" }
    ),
    delete: vi.fn(),
    patch: vi.fn(),
  };
}

function createContext(client = createClient(), overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    client: client as unknown as ExecutionContext["client"],
    operationMode: "create",
    isPreview: false,
    stopOnFirstError: false,
    cachedNotificationTemplates: [],
    ...overrides,
  };
}

describe("executeNotificationTask (create)", () => {
  beforeEach(() => {
    cacheTemplates("notification", [structuredClone(TEMPLATE)]);
  });

  afterEach(() => {
    clearCategoryCache("notification");
    vi.restoreAllMocks();
  });

  it("creates the template, then one localized message per locale", async () => {
    const client = createClient();
    const context = createContext(client);

    const result = await executeNotificationTask(createTask(), context);

    expect(result).toEqual({ task: expect.anything(), success: true, skipped: false, createdId: "new-id" });
    expect(client.post).toHaveBeenCalledTimes(3);
    const [endpoint, body] = client.post.mock.calls[0];
    expect(endpoint).toBe(ENDPOINT);
    expect(body).toEqual({
      displayName: TEMPLATE.displayName,
      brandingOptions: TEMPLATE.brandingOptions,
      roleScopeTagIds: ["0"],
    });
    expect(client.post).toHaveBeenNthCalledWith(2, `${ENDPOINT}/new-id/localizedNotificationMessages`, TEMPLATE.localizedMessages[0]);
    expect(client.post).toHaveBeenNthCalledWith(3, `${ENDPOINT}/new-id/localizedNotificationMessages`, TEMPLATE.localizedMessages[1]);
    expect(context.cachedNotificationTemplates).toEqual([{ id: "new-id", displayName: TEMPLATE.displayName }]);
  });

  it.each([
    ["the same name in another case", "[ihd] FIRST ALERT"],
    ["the name without the [IHD] prefix (older version)", "First Alert"],
  ])("skips when a template with %s exists", async (_label, existingName) => {
    const client = createClient();
    const context = createContext(client, { cachedNotificationTemplates: [{ id: "old-id", displayName: existingName }] });

    const result = await executeNotificationTask(createTask(), context);

    expect(result).toMatchObject({ success: true, skipped: true, skipKind: "noOp", error: "Already exists" });
    expect(client.post).not.toHaveBeenCalled();
  });

  it("does not skip for a different template name", async () => {
    const client = createClient();
    const context = createContext(client, {
      cachedNotificationTemplates: [{ id: "other-id", displayName: "[IHD] First Alert - Copy" }],
    });

    const result = await executeNotificationTask(createTask(), context);

    expect(result).toMatchObject({ success: true, skipped: false });
  });

  it("fails without a create when the tenant templates could not be read", async () => {
    const client = createClient();
    const context = createContext(client, {
      cachedNotificationTemplates: undefined,
      prefetchErrors: { cachedNotificationTemplates: "[403] Forbidden" },
    });

    await expect(executeNotificationTask(createTask(), context)).rejects.toThrow(
      /Could not read the existing notification templates from the tenant \(\[403\] Forbidden\)/
    );
    expect(client.post).not.toHaveBeenCalled();
  });

  it("reports a failure with the locale when a localized message fails", async () => {
    const client = createClient();
    client.post.mockImplementation(async (endpoint: string, body: unknown) => {
      if (endpoint === ENDPOINT) return { id: "new-id", displayName: TEMPLATE.displayName };
      if ((body as { locale: string }).locale === "de-DE") throw new Error("[400] Invalid locale");
      return { id: "message-id" };
    });
    const context = createContext(client);

    const result = await executeNotificationTask(createTask(), context);

    expect(result.success).toBe(false);
    expect(result.skipped).toBe(false);
    expect(result.createdId).toBe("new-id");
    expect(result.error).toContain("1 localized message(s) failed (de-DE: [400] Invalid locale)");
    expect(result.error).toContain("The template is incomplete");
    // The other message is still sent, and the created template stays in the cache.
    expect(client.post).toHaveBeenCalledTimes(3);
    expect(context.cachedNotificationTemplates).toHaveLength(1);
  });

  it("stops at once when the run is cancelled during a localized message", async () => {
    const client = createClient();
    client.post.mockImplementation(async (endpoint: string) => {
      if (endpoint === ENDPOINT) return { id: "new-id" };
      throw new RunCancelledError();
    });

    await expect(executeNotificationTask(createTask(), createContext(client))).rejects.toBeInstanceOf(RunCancelledError);
    expect(client.post).toHaveBeenCalledTimes(2);
  });

  it("fails when the template create gives no ID", async () => {
    const client = createClient();
    client.post.mockResolvedValue({});

    await expect(executeNotificationTask(createTask(), createContext(client))).rejects.toThrow(/did not return an ID/);
    expect(client.post).toHaveBeenCalledTimes(1);
  });

  it("reports a missing template", async () => {
    clearCategoryCache("notification");
    const client = createClient();

    const result = await executeNotificationTask(createTask(), createContext(client));

    expect(result).toMatchObject({ success: false, skipped: false, error: expect.stringContaining("Template not found") });
    expect(client.post).not.toHaveBeenCalled();
  });

  it("previews a create with no Graph request", async () => {
    const client = createClient();

    const result = await executeNotificationTask(createTask(), createContext(client, { isPreview: true }));

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(client.post).not.toHaveBeenCalled();
    expect(client.get).not.toHaveBeenCalled();
    expect(client.delete).not.toHaveBeenCalled();
  });
});

describe("executeTasks with notification tasks", () => {
  beforeEach(() => {
    cacheTemplates("notification", [structuredClone(TEMPLATE)]);
  });

  afterEach(() => {
    clearCategoryCache("notification");
  });

  it("prefetches the tenant templates and creates a new template", async () => {
    const client = createClient();
    const context = createContext(client, { cachedNotificationTemplates: undefined });
    const task = createTask();

    const [result] = await executeTasks([task], context);

    expect(client.getCollection).toHaveBeenCalledWith(`${ENDPOINT}?$select=id,displayName`);
    expect(result).toMatchObject({ success: true, createdId: "new-id" });
    expect(task.status).toBe("success");
  });

  it("fails the task without a create when the prefetch fails", async () => {
    const client = createClient();
    client.getCollection.mockRejectedValue(new Error("[403] Forbidden"));
    const context = createContext(client, { cachedNotificationTemplates: undefined });
    const task = createTask();

    const [result] = await executeTasks([task], context);

    expect(result.success).toBe(false);
    expect(task.status).toBe("failed");
    expect(task.error).toContain("to prevent a duplicate object");
    expect(client.post).not.toHaveBeenCalled();
  });

  it("marks the task failed when a localized message fails", async () => {
    const client = createClient();
    client.post.mockImplementation(async (endpoint: string) => {
      if (endpoint === ENDPOINT) return { id: "new-id" };
      throw new Error("[500] Internal error");
    });
    const task = createTask();

    await executeTasks([task], createContext(client, { cachedNotificationTemplates: undefined }));

    expect(task.status).toBe("failed");
    expect(task.error).toContain("localized message(s) failed");
  });
});
