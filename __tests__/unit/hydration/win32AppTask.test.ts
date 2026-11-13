import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ExecutionContext } from "@/lib/hydration/types";
import type { HydrationTask } from "@/types/hydration";

const {
  mockCreateWin32AppFromPackage,
  mockGetWin32LobApps,
  mockReadIntuneWinPackage,
} = vi.hoisted(() => ({
  mockCreateWin32AppFromPackage: vi.fn(),
  mockGetWin32LobApps: vi.fn(),
  mockReadIntuneWinPackage: vi.fn(),
}));

vi.mock("@/lib/graph/win32Apps", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/graph/win32Apps")>();
  return {
    ...original,
    createWin32AppFromPackage: mockCreateWin32AppFromPackage,
    getWin32LobApps: mockGetWin32LobApps,
  };
});

vi.mock("@/lib/win32/intuneWinPackage", () => ({
  readIntuneWinPackage: mockReadIntuneWinPackage,
}));

import { executeWin32AppTask } from "@/lib/hydration/taskExecutors/win32AppTask";
import { getWin32AppTemplates } from "@/templates/win32Apps";

const task: HydrationTask = {
  id: "7-zip",
  category: "win32Apps",
  operation: "create",
  itemName: "7-Zip - [IHD]",
  status: "pending",
};

const createContext = (isPreview = false): ExecutionContext => ({
  client: {
    delete: vi.fn(),
    get: vi.fn(async (url: string) => (url.endsWith("/assignments") ? { value: [] } : {})),
  } as unknown as ExecutionContext["client"],
  operationMode: "create",
  isPreview,
  stopOnFirstError: false,
});

/** Answer a read of one app by ID from the given apps, and 404 for any other app. */
function serveApps(context: ExecutionContext, apps: Array<{ id: string } & Record<string, unknown>>): void {
  vi.mocked(context.client.get).mockImplementation(async (url: string) => {
    if (url.endsWith("/assignments")) return { value: [] };
    const app = apps.find((candidate) => url.endsWith(`/mobileApps/${candidate.id}`));
    if (app) return app;
    throw Object.assign(new Error("Resource not found"), { status: 404 });
  });
}

describe("executeWin32AppTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    sessionStorage.clear();
    mockGetWin32LobApps.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("previews the module-generated app without loading package assets", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await executeWin32AppTask(task, createContext(true));

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockCreateWin32AppFromPackage).not.toHaveBeenCalled();
  });

  it("reuses the Win32 app collection across tasks in one execution", async () => {
    const context = createContext(true);

    await executeWin32AppTask(task, context);
    await executeWin32AppTask(
      { ...task, id: "google-chrome", itemName: "Google Chrome - [IHD]" },
      context
    );

    expect(mockGetWin32LobApps).toHaveBeenCalledTimes(1);
  });

  it("ignores malformed recent-app session hints", async () => {
    sessionStorage.setItem("intune-hydration-recent-win32-apps", "null");

    await expect(executeWin32AppTask(task, createContext(true))).resolves.toMatchObject({
      success: true,
      skipped: false,
    });
  });

  it.each(getWin32AppTemplates().filter((template) => template.packageUrl))("loads, publishes, and deletes the $displayName package", async (template) => {
    const packageBlob = new Blob(["package"]);
    const iconBytes = new Uint8Array([1, 2, 3]);
    const parsedPackage = {
      setupFile: template.setupFilePath,
      encryptedContent: new Blob(["encrypted"]),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(packageBlob, { status: 200 }))
      .mockResolvedValueOnce(new Response("Write-Output 'detected'", { status: 200 }))
      .mockResolvedValueOnce(new Response(iconBytes, { status: 200 }));
    // A template without an icon makes no icon request.
    const expectedUrls = [template.packageUrl, template.detectionScriptUrl, template.iconUrl].filter(Boolean);
    vi.stubGlobal("fetch", fetchMock);
    mockReadIntuneWinPackage.mockResolvedValue(parsedPackage);
    const createdId = `created-${template.id}`;
    mockCreateWin32AppFromPackage.mockResolvedValue({ id: createdId });

    const context = createContext();
    const appTask = { ...task, id: template.id, itemName: template.displayName };
    const result = await executeWin32AppTask(appTask, context);

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(expectedUrls);
    expect(mockCreateWin32AppFromPackage).toHaveBeenCalledWith(
      context.client,
      expect.objectContaining({ packageIdentifier: template.packageIdentifier }),
      parsedPackage,
      "Write-Output 'detected'",
      template.iconUrl ? "AQID" : undefined
    );
    expect(result).toMatchObject({ success: true, skipped: false, createdId });

    vi.mocked(context.client.get).mockImplementation(async (url: string) =>
      url.endsWith("/assignments")
        ? { value: [] }
        : {
            id: createdId,
            displayName: template.displayName,
            description: "Imported by Intune Hydration Kit",
            notes: template.notes,
          }
    );
    await expect(executeWin32AppTask(
      { ...appTask, operation: "delete" },
      context
    )).resolves.toMatchObject({ success: true, skipped: false });
    expect(context.client.get).toHaveBeenCalledWith(
      `/deviceAppManagement/mobileApps/${createdId}`,
      "beta"
    );
    expect(context.client.delete).toHaveBeenCalledWith(
      `/deviceAppManagement/mobileApps/${createdId}`,
      "beta"
    );
  });

  it("identifies the unavailable supplied asset by URL", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(new Blob(["package"]), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 404, statusText: "Not Found" })));
    mockReadIntuneWinPackage.mockResolvedValue({ setupFile: "Install-WinGetPackage.ps1" });

    await expect(executeWin32AppTask(task, createContext())).rejects.toThrow(
      "Unable to load the supplied Win32 detection script from /win32-apps/7-zip/Detect-WinGetPackage.ps1: 404 Not Found"
    );
  });

  it("skips any matching app name without requiring hydration ownership", async () => {
    mockGetWin32LobApps.mockResolvedValueOnce([
      {
        id: "owned-app",
        displayName: "[IHD] 7-Zip",
        description: "Imported by Intune Hydration Kit",
        notes: "Imported from WinGet",
      },
    ]);

    await expect(executeWin32AppTask(task, createContext())).resolves.toMatchObject({
      success: true,
      skipped: true,
      error: "Already exists",
    });

    mockGetWin32LobApps.mockResolvedValueOnce([
      {
        id: "unrelated-app",
        displayName: "7-Zip - [IHD]",
        description: "Managed by another tool",
      },
    ]);
    await expect(executeWin32AppTask(task, createContext())).resolves.toMatchObject({
      success: true,
      skipped: true,
      error: "Already exists",
    });
    expect(mockCreateWin32AppFromPackage).not.toHaveBeenCalled();
  });

  it("deletes every owned current or legacy name match", async () => {
    const tenantApps = [
      {
        id: "current-app",
        displayName: "7-Zip - [IHD]",
        description: "Imported by Intune Hydration Kit",
        notes: "Imported from WinGet",
      },
      {
        id: "legacy-app",
        displayName: "[IHD] 7-Zip",
        description: "Imported by Intune-Hydration-Kit",
        notes: "WinGetPackageIdentifier: 7zip.7zip",
      },
      {
        id: "unowned-app",
        displayName: "7-Zip",
        description: "Managed elsewhere",
      },
    ];
    mockGetWin32LobApps.mockResolvedValue(tenantApps);
    const context = createContext();
    serveApps(context, tenantApps);
    const deleteTask = { ...task, operation: "delete" as const };

    const result = await executeWin32AppTask(deleteTask, context);

    expect(context.client.delete).toHaveBeenCalledTimes(2);
    expect(context.client.delete).toHaveBeenNthCalledWith(
      1,
      "/deviceAppManagement/mobileApps/current-app",
      "beta"
    );
    expect(context.client.delete).toHaveBeenNthCalledWith(
      2,
      "/deviceAppManagement/mobileApps/legacy-app",
      "beta"
    );
    expect(result).toMatchObject({ success: true, skipped: false });
  });

  it("explains that an unowned matching app is protected from deletion", async () => {
    vi.useFakeTimers();
    mockGetWin32LobApps.mockResolvedValue([
      {
        id: "unowned-app",
        displayName: "7-Zip - [IHD]",
        description: "Managed by another tool",
      },
    ]);

    const resultPromise = executeWin32AppTask(
      { ...task, operation: "delete" },
      createContext()
    );
    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toMatchObject({
      success: false,
      skipped: true,
      skipKind: "blocked",
      error: "Matching app is not owned by Intune Hydration Kit",
    });
  });

  it("reports that no app exists when delete discovery finds no name match", async () => {
    vi.useFakeTimers();
    mockGetWin32LobApps.mockResolvedValue([]);

    const resultPromise = executeWin32AppTask(
      { ...task, operation: "delete" },
      createContext()
    );
    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toMatchObject({
      success: false,
      skipped: true,
      skipKind: "noOp",
      error: "Not found in tenant",
    });
  });

  it("ignores a legacy candidate that disappears before its ownership check", async () => {
    const currentApp = {
      id: "current-app",
      displayName: "7-Zip - [IHD]",
      description: "Imported by Intune Hydration Kit",
      notes: "Imported from WinGet",
    };
    mockGetWin32LobApps.mockResolvedValue([
      currentApp,
      {
        id: "missing-legacy-app",
        displayName: "[IHD] 7-Zip",
        description: "Imported by Intune-Hydration-Kit",
        notes: "File archiver utility",
      },
    ]);
    const context = createContext();
    serveApps(context, [currentApp]);

    await expect(executeWin32AppTask(
      { ...task, operation: "delete" },
      context
    )).resolves.toMatchObject({ success: true, skipped: false });

    expect(context.client.delete).toHaveBeenCalledTimes(1);
    expect(context.client.delete).toHaveBeenCalledWith(
      "/deviceAppManagement/mobileApps/current-app",
      "beta"
    );
  });

  it("retries an immediate delete until a newly created app is visible", async () => {
    vi.useFakeTimers();
    mockGetWin32LobApps.mockResolvedValue([]);
    sessionStorage.setItem("intune-hydration-recent-win32-apps", JSON.stringify({
      "7-zip - [ihd]": {
        id: "newly-visible-app",
        displayName: "7-Zip - [IHD]",
        createdAt: Date.now(),
      },
    }));
    const context = createContext();
    const newApp = {
      id: "newly-visible-app",
      displayName: "7-Zip - [IHD]",
      description: "Imported by Intune Hydration Kit",
      notes: "Imported from WinGet",
    };
    serveApps(context, [newApp]);
    vi.mocked(context.client.get)
      .mockRejectedValueOnce(Object.assign(new Error("Resource not found"), { status: 404 }));

    const resultPromise = executeWin32AppTask(
      { ...task, operation: "delete" },
      context
    );
    await vi.advanceTimersByTimeAsync(2000);
    const result = await resultPromise;

    // The retry reads the collection again: the first answer is from before the wait.
    expect(mockGetWin32LobApps).toHaveBeenCalledTimes(2);
    // Two reads of the recent app, one assignment read, then the read before the DELETE
    expect(context.client.get).toHaveBeenCalledTimes(4);
    expect(context.client.delete).toHaveBeenCalledWith(
      "/deviceAppManagement/mobileApps/newly-visible-app",
      "beta"
    );
    expect(result).toMatchObject({ success: true, skipped: false });
  });

  it("deletes the exact legacy PSADT proof app after loading its full metadata", async () => {
    const legacyListRecord = {
      id: "legacy-7zip",
      displayName: "7-Zip - [IHD]",
      description: "7-Zip is a file archiver with a high compression ratio. - Imported by Intune Hydration Kit",
      notes: "File archiver utility",
      publisher: "Igor Pavlov",
      owner: "Igor Pavlov",
      developer: "Igor Pavlov",
    };
    const legacyDetails = {
      ...legacyListRecord,
      "@odata.type": "#microsoft.graph.win32LobApp",
      informationUrl: "https://www.7-zip.org",
      privacyInformationUrl: "https://www.7-zip.org",
      fileName: "7zip-25.01.intunewin",
      size: 2315712,
      setupFilePath: "Deploy-Application.exe",
      installCommandLine: "Deploy-Application.exe install",
      uninstallCommandLine: "Deploy-Application.exe uninstall",
      allowAvailableUninstall: false,
    };
    mockGetWin32LobApps.mockResolvedValue([legacyListRecord]);
    const context = createContext();
    vi.mocked(context.client.get).mockImplementation(async (url: string) =>
      url.endsWith("/assignments") ? { value: [] } : legacyDetails
    );

    const result = await executeWin32AppTask(
      { ...task, operation: "delete" },
      context
    );

    expect(context.client.get).toHaveBeenCalledWith(
      "/deviceAppManagement/mobileApps/legacy-7zip",
      "beta"
    );
    expect(context.client.delete).toHaveBeenCalledWith(
      "/deviceAppManagement/mobileApps/legacy-7zip",
      "beta"
    );
    expect(result).toMatchObject({ success: true, skipped: false });
  });

  it("does not delete an app whose kit marker is gone when it is read again", async () => {
    const listed = {
      id: "current-app",
      displayName: "7-Zip - [IHD]",
      description: "Imported by Intune Hydration Kit",
      notes: "Imported from WinGet",
    };
    mockGetWin32LobApps.mockResolvedValue([listed]);
    const context = createContext();
    serveApps(context, [{ ...listed, description: "Now managed by hand", notes: "" }]);

    const result = await executeWin32AppTask({ ...task, operation: "delete" }, context);

    expect(context.client.delete).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: false, skipped: true, skipKind: "blocked" });
  });

  it("does not delete any app when one of them cannot be read again", async () => {
    const listed = {
      id: "current-app",
      displayName: "7-Zip - [IHD]",
      description: "Imported by Intune Hydration Kit",
      notes: "Imported from WinGet",
    };
    mockGetWin32LobApps.mockResolvedValue([listed]);
    const context = createContext();
    vi.mocked(context.client.get).mockImplementation(async (url: string) => {
      if (url.endsWith("/assignments")) return { value: [] };
      throw Object.assign(new Error("Service unavailable"), { status: 503 });
    });

    const result = await executeWin32AppTask({ ...task, operation: "delete" }, context);

    expect(context.client.delete).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: false, skipped: false });
    expect(result.error).toMatch(/Safety checks did not complete/);
  });

  it("waits for an app that this session created before it creates the app again", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
    mockGetWin32LobApps.mockResolvedValue([]);
    sessionStorage.setItem("intune-hydration-recent-win32-apps", JSON.stringify({
      "7-zip - [ihd]": { id: "new-app", displayName: "7-Zip - [IHD]", createdAt: Date.now() },
    }));
    const context = createContext();
    serveApps(context, [{
      id: "new-app",
      displayName: "7-Zip - [IHD]",
      description: "Imported by Intune Hydration Kit",
      notes: "Imported from WinGet",
    }]);
    vi.mocked(context.client.get)
      .mockRejectedValueOnce(Object.assign(new Error("Resource not found"), { status: 404 }));

    const resultPromise = executeWin32AppTask(task, context);
    await vi.advanceTimersByTimeAsync(2000);

    await expect(resultPromise).resolves.toMatchObject({ success: true, skipped: true, error: "Already exists" });
    expect(mockCreateWin32AppFromPackage).not.toHaveBeenCalled();
  });

  it("does not create the app when the app that this session created cannot be read", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const hint = JSON.stringify({
      "7-zip - [ihd]": { id: "new-app", displayName: "7-Zip - [IHD]", createdAt: Date.now() },
    });
    sessionStorage.setItem("intune-hydration-recent-win32-apps", hint);
    const context = createContext();
    vi.mocked(context.client.get).mockRejectedValue(Object.assign(new Error("Service unavailable"), { status: 503 }));

    await expect(executeWin32AppTask(task, context)).rejects.toThrow("Service unavailable");

    expect(mockCreateWin32AppFromPackage).not.toHaveBeenCalled();
    // The hint stays for the next attempt.
    expect(sessionStorage.getItem("intune-hydration-recent-win32-apps")).toBe(hint);
  });

  it("remembers the incomplete app of a failed create, so a retry does not create a second app", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("content")));
    mockReadIntuneWinPackage.mockResolvedValue({ setupFile: getWin32AppTemplates()[0].setupFilePath });
    mockCreateWin32AppFromPackage.mockRejectedValue(
      Object.assign(new Error("upload failed"), { incompleteAppId: "incomplete-app" })
    );
    const context = createContext();
    const firstTask = { ...task, itemName: getWin32AppTemplates()[0].displayName };

    await expect(executeWin32AppTask(firstTask, context)).rejects.toThrow("upload failed");

    serveApps(context, [{
      id: "incomplete-app",
      displayName: firstTask.itemName,
      description: "Imported by Intune Hydration Kit",
      notes: "Imported from WinGet",
    }]);
    await expect(executeWin32AppTask(firstTask, { ...context, cachedWin32LobApps: undefined }))
      .resolves.toMatchObject({ skipped: true, error: "Already exists" });
    expect(mockCreateWin32AppFromPackage).toHaveBeenCalledTimes(1);
  });
});
