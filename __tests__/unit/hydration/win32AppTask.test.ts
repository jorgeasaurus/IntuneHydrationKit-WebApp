import { beforeEach, describe, expect, it, vi } from "vitest";

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

const task: HydrationTask = {
  id: "7-zip",
  category: "win32Apps",
  operation: "create",
  itemName: "7-Zip - [IHD]",
  status: "pending",
};

const createContext = (isPreview = false): ExecutionContext => ({
  client: { delete: vi.fn(), get: vi.fn().mockResolvedValue({}) } as unknown as ExecutionContext["client"],
  operationMode: "create",
  isPreview,
  stopOnFirstError: false,
});

describe("executeWin32AppTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mockGetWin32LobApps.mockResolvedValue([]);
  });

  it("previews the module-generated app without loading package assets", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await executeWin32AppTask(task, createContext(true));

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockCreateWin32AppFromPackage).not.toHaveBeenCalled();
  });

  it("loads and publishes the PowerShell module package, detection script, and icon", async () => {
    const packageBlob = new Blob(["package"]);
    const iconBytes = new Uint8Array([1, 2, 3]);
    const parsedPackage = {
      setupFile: "Install-WinGetPackage.ps1",
      encryptedContent: new Blob(["encrypted"]),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(packageBlob, { status: 200 }))
      .mockResolvedValueOnce(new Response("Write-Output 'detected'", { status: 200 }))
      .mockResolvedValueOnce(new Response(iconBytes, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    mockReadIntuneWinPackage.mockResolvedValue(parsedPackage);
    mockCreateWin32AppFromPackage.mockResolvedValue({ id: "created-app" });

    const context = createContext();
    const result = await executeWin32AppTask(task, context);

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/win32-apps/7-zip.intunewin",
      "/win32-apps/7-zip/Detect-WinGetPackage.ps1",
      "/win32-apps/7-zip.png",
    ]);
    expect(mockCreateWin32AppFromPackage).toHaveBeenCalledWith(
      context.client,
      expect.objectContaining({ packageIdentifier: "7zip.7zip" }),
      parsedPackage,
      "Write-Output 'detected'",
      "AQID"
    );
    expect(result).toMatchObject({ success: true, skipped: false, createdId: "created-app" });
  });

  it("skips an owned legacy-name app but not an unrelated same-name app", async () => {
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
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(new Blob(["package"]), { status: 200 }))
      .mockResolvedValueOnce(new Response("detected", { status: 200 }))
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: vi.fn().mockRejectedValue(new Error("icon body unavailable")),
      } as unknown as Response));
    mockReadIntuneWinPackage.mockResolvedValue({ setupFile: "Install-WinGetPackage.ps1" });
    mockCreateWin32AppFromPackage.mockResolvedValue({ id: "new-owned-app" });

    await expect(executeWin32AppTask(task, createContext())).resolves.toMatchObject({
      success: true,
      skipped: false,
      createdId: "new-owned-app",
    });
  });

  it("deletes every owned current or legacy name match", async () => {
    mockGetWin32LobApps.mockResolvedValue([
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
    ]);
    const context = createContext();
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
    vi.mocked(context.client.get).mockResolvedValue(legacyDetails);

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
});
