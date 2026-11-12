import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../setup/msw-handlers";

vi.mock("@/lib/auth/authUtils", () => ({
  assertActiveAccountMatches: vi.fn(),
  getAccessToken: vi.fn().mockResolvedValue("mock-access-token"),
}));

import { GraphClient } from "@/lib/graph/client";
import { executeTasks } from "@/lib/hydration/engine";
import {
  beginExecution,
  cancelExecution,
  forceResetExecutionSessionForTests,
  getExecutionState,
  pauseExecution,
  recordPauseWait,
  resumeExecution,
  shouldCancelExecution,
  shouldPauseExecution,
} from "@/lib/hydration/executionStateStore";
import type { ActivityMessage, ExecutionContext } from "@/lib/hydration/types";
import { cacheTemplates, clearCategoryCache } from "@/lib/templates/loader";
import type { HydrationTask } from "@/types/hydration";

const GRAPH_BASE = "https://graph.microsoft.com";
const GROUP = "[IHD] Windows Devices";
const FILTER = "[IHD] Corporate Windows";
const SESSION_MESSAGE = "Session expired — click Resume to sign in again and continue.";

function sessionError() {
  return Object.assign(new Error("Session expired. Please sign out and sign in again."), {
    name: "InteractionRequiredError",
    status: 401,
  });
}

function task(category: "groups" | "filters", itemName: string): HydrationTask {
  return { id: `${category}-1`, category, operation: "create", itemName, status: "pending" };
}

async function waitFor(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error("Timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function startRun(overrides: Partial<ExecutionContext> = {}) {
  const runId = beginExecution({
    tenantId: "tenant",
    homeAccountId: "home",
    operationMode: "create",
    isPreview: false,
    selectedObjectCount: 1,
  });
  if (runId === null) throw new Error("Run did not start");
  const messages: ActivityMessage[] = [];
  const context: ExecutionContext = {
    client: new GraphClient(),
    operationMode: "create",
    isPreview: false,
    stopOnFirstError: false,
    cachedIntuneGroups: [],
    cachedFilters: [],
    onStatusUpdate: (message) => messages.push(message),
    shouldCancel: () => shouldCancelExecution(runId),
    shouldPause: () => shouldPauseExecution(runId),
    onPauseWait: (waiting) => recordPauseWait(runId, waiting),
    ...overrides,
  };
  return { runId, context, messages };
}

describe("run controls in the engine", () => {
  beforeEach(async () => {
    forceResetExecutionSessionForTests();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const auth = await import("@/lib/auth/authUtils");
    vi.mocked(auth.getAccessToken).mockReset().mockResolvedValue("mock-access-token");
    cacheTemplates("groups", [{ displayName: GROUP, description: "d", membershipRule: '(device.deviceOSType -eq "Windows")' }]);
    cacheTemplates("filters", [{ displayName: FILTER, description: "d", platform: "windows10AndLater", rule: '(device.osVersion -startsWith "10")' }]);
  });

  afterEach(() => {
    clearCategoryCache("groups");
    clearCategoryCache("filters");
    forceResetExecutionSessionForTests();
    vi.restoreAllMocks();
  });

  it("pauses the run when the sign-in session is lost, keeps the tasks pending, and continues after Resume", async () => {
    const auth = await import("@/lib/auth/authUtils");
    vi.mocked(auth.getAccessToken).mockRejectedValueOnce(sessionError());
    let batches = 0;
    server.use(
      http.post(`${GRAPH_BASE}/v1.0/$batch`, () => {
        batches++;
        return HttpResponse.json({ responses: [{ id: "req-0", status: 201, body: { id: "group-1", displayName: GROUP } }] });
      })
    );
    const { runId, context, messages } = startRun();
    const groupTask = task("groups", GROUP);

    const run = executeTasks([groupTask], context);
    await waitFor(() => getExecutionState().phase === "paused");

    expect(groupTask.status).toBe("pending");
    expect(messages.filter((m) => m.message === SESSION_MESSAGE)).toHaveLength(1);
    expect(batches).toBe(0);

    resumeExecution(runId);
    const results = await run;

    expect(results).toEqual([expect.objectContaining({ success: true, createdId: "group-1" })]);
    expect(groupTask.status).toBe("success");
    expect(batches).toBe(1);
  });

  it("does not spin while the session stays lost; each Resume tries once, and Cancel ends the run", async () => {
    const auth = await import("@/lib/auth/authUtils");
    vi.mocked(auth.getAccessToken).mockRejectedValue(sessionError());
    const { runId, context, messages } = startRun();
    const groupTask = task("groups", GROUP);

    const run = executeTasks([groupTask], context);
    await waitFor(() => getExecutionState().phase === "paused");
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(vi.mocked(auth.getAccessToken)).toHaveBeenCalledTimes(1);

    resumeExecution(runId);
    await waitFor(() => vi.mocked(auth.getAccessToken).mock.calls.length === 2 && getExecutionState().phase === "paused");
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(vi.mocked(auth.getAccessToken)).toHaveBeenCalledTimes(2);
    expect(messages.filter((m) => m.message === SESSION_MESSAGE)).toHaveLength(2);

    cancelExecution(runId);
    const results = await run;

    expect(results).toEqual([expect.objectContaining({ skipped: true, skipKind: "cancelled" })]);
    expect(groupTask.status).toBe("skipped");
  });

  it("stops a Retry-After wait within about one second when the run is cancelled", async () => {
    let posts = 0;
    server.use(
      http.post(`${GRAPH_BASE}/beta/deviceManagement/assignmentFilters`, () => {
        posts++;
        return HttpResponse.json({ error: { message: "Throttled" } }, { status: 429, headers: { "Retry-After": "60" } });
      })
    );
    // stopOnFirstError uses the sequential path, where the Graph client owns the retry wait.
    const { runId, context } = startRun({ stopOnFirstError: true });
    const filterTask = task("filters", FILTER);

    const run = executeTasks([filterTask], context);
    await waitFor(() => posts === 1);
    const cancelledAt = Date.now();
    cancelExecution(runId);
    const results = await run;

    expect(Date.now() - cancelledAt).toBeLessThan(1000);
    expect(posts).toBe(1);
    expect(results).toEqual([expect.objectContaining({ skipped: true, skipKind: "cancelled" })]);
  });

  it("detaches the run controls from the client when the run ends", async () => {
    const { context } = startRun();
    const setExecutionControls = vi.spyOn(context.client, "setExecutionControls");
    server.use(
      http.post(`${GRAPH_BASE}/v1.0/$batch`, () =>
        HttpResponse.json({ responses: [{ id: "req-0", status: 201, body: { id: "group-1", displayName: GROUP } }] })
      )
    );

    await executeTasks([task("groups", GROUP)], context);

    expect(setExecutionControls).toHaveBeenCalledTimes(2);
    expect(setExecutionControls).toHaveBeenLastCalledWith(undefined);
  });

  it("records no paused time when Pause is clicked during the last task", async () => {
    const { runId, context } = startRun({ stopOnFirstError: true });
    server.use(
      http.post(`${GRAPH_BASE}/beta/deviceManagement/assignmentFilters`, () => {
        pauseExecution(runId);
        return HttpResponse.json({ id: "filter-1", displayName: FILTER }, { status: 201 });
      })
    );

    const results = await executeTasks([task("filters", FILTER)], context);

    expect(results).toEqual([expect.objectContaining({ success: true })]);
    expect(getExecutionState().phase).toBe("paused");
    expect(getExecutionState().pausedMs).toBe(0);
    expect(getExecutionState().pauseStartedAt).toBeNull();
  });

  it("records the time that the engine really waits while paused", async () => {
    const { runId, context } = startRun({ stopOnFirstError: true });
    let posts = 0;
    server.use(
      http.post(`${GRAPH_BASE}/beta/deviceManagement/assignmentFilters`, () => {
        posts++;
        if (posts === 1) pauseExecution(runId);
        return HttpResponse.json({ id: `filter-${posts}`, displayName: posts === 1 ? FILTER : `${FILTER} 2` }, { status: 201 });
      })
    );
    cacheTemplates("filters", [
      { displayName: FILTER, description: "d", platform: "windows10AndLater", rule: '(device.osVersion -startsWith "10")' },
      { displayName: `${FILTER} 2`, description: "d", platform: "windows10AndLater", rule: '(device.osVersion -startsWith "11")' },
    ]);
    const second = { ...task("filters", `${FILTER} 2`), id: "filters-2" };

    const run = executeTasks([task("filters", FILTER), second], context);
    await waitFor(() => getExecutionState().pauseStartedAt !== null);
    expect(posts).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 400));
    resumeExecution(runId);
    await run;

    expect(posts).toBe(2);
    expect(getExecutionState().pauseStartedAt).toBeNull();
    expect(getExecutionState().pausedMs).toBeGreaterThanOrEqual(350);
    expect(getExecutionState().pausedMs).toBeLessThan(3000);
  });
});
