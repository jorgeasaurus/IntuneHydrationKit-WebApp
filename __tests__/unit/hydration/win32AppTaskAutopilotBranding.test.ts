import { createDecipheriv } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExecutionContext } from "@/lib/hydration/types";
import type { IntuneWinPackage } from "@/lib/win32/intuneWinPackage";
import type { HydrationTask } from "@/types/hydration";

const { mockCreateWin32AppFromPackage, mockGetWin32LobApps } = vi.hoisted(() => ({
  mockCreateWin32AppFromPackage: vi.fn(),
  mockGetWin32LobApps: vi.fn(),
}));

vi.mock("@/lib/graph/win32Apps", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/graph/win32Apps")>();
  return {
    ...original,
    createWin32AppFromPackage: mockCreateWin32AppFromPackage,
    getWin32LobApps: mockGetWin32LobApps,
  };
});

// The prebuilt path reads a fetched Blob. A jsdom Blob has no arrayBuffer(), so the wrapper
// reads it with FileReader; the real reader parses the bytes.
vi.mock("@/lib/win32/intuneWinPackage", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/win32/intuneWinPackage")>();
  return {
    ...original,
    readIntuneWinPackage: async (file: Blob | ArrayBuffer) =>
      original.readIntuneWinPackage(file instanceof ArrayBuffer ? file : await readBlob(file)),
  };
});

import { executeWin32AppTask } from "@/lib/hydration/taskExecutors/win32AppTask";
import {
  buildAutopilotBrandingConfiguration,
  getDefaultAutopilotBrandingCustomization,
  type AutopilotBrandingCustomization,
} from "@/lib/win32/autopilotBrandingConfig";
import { AUTOPILOT_BRANDING_CONTENT_URL } from "@/lib/win32/autopilotBrandingPackage";
import { readStoredZipEntries } from "@/lib/win32/storedZip";
import { AUTOPILOT_BRANDING_WIN32_APP as template } from "@/templates/win32Apps";

const PUBLIC = join(process.cwd(), "public");
const DETECTION_SCRIPT = "Write-Output 'detected'";

function publicBytes(url: string): ArrayBuffer {
  const bytes = readFileSync(join(PUBLIC, url));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** Serve the kit files that the executor loads. */
function stubFetch() {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === template.detectionScriptUrl) return new Response(DETECTION_SCRIPT, { status: 200 });
    return new Response(publicBytes(url), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function readBlob(blob: Blob): Promise<ArrayBuffer> {
  // jsdom Blob has no arrayBuffer(); FileReader reads it.
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

async function decryptConfiguration(packageFile: IntuneWinPackage): Promise<string> {
  const encrypted = Buffer.from(await readBlob(packageFile.encryptedContent));
  const decipher = createDecipheriv(
    "aes-256-cbc",
    Buffer.from(packageFile.encryptionInfo.encryptionKey, "base64"),
    Buffer.from(packageFile.encryptionInfo.initializationVector, "base64"),
  );
  const content = Buffer.concat([decipher.update(encrypted.subarray(48)), decipher.final()]);
  const entries = readStoredZipEntries(content.buffer.slice(content.byteOffset, content.byteOffset + content.length));
  return new TextDecoder().decode(entries.find((entry) => entry.name === "AutopilotBranding.json")!.content);
}

const customization: AutopilotBrandingCustomization = {
  removedApps: ["Clipchamp.Clipchamp", "MSTeams"],
  enabledTasks: ["Hide-ABWidgets", "Update-ABApps"],
};

function createTask(overrides: Partial<HydrationTask> = {}): HydrationTask {
  return {
    id: "task-1",
    category: "win32Apps",
    operation: "create",
    itemName: template.displayName,
    status: "pending",
    ...overrides,
  } as HydrationTask;
}

const createContext = (isPreview = false): ExecutionContext => ({
  client: {
    delete: vi.fn(),
    get: vi.fn(async (url: string) => (url.endsWith("/assignments") ? { value: [] } : {})),
  } as unknown as ExecutionContext["client"],
  operationMode: "create",
  isPreview,
  stopOnFirstError: false,
});

describe("executeWin32AppTask for a customized Autopilot Branding app", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    sessionStorage.clear();
    mockGetWin32LobApps.mockResolvedValue([]);
    mockCreateWin32AppFromPackage.mockResolvedValue({ id: "created-app", displayName: template.displayName });
  });

  it("uploads a package built in the browser with a truthful description and notes", async () => {
    const fetchMock = stubFetch();
    const context = createContext();

    const result = await executeWin32AppTask(createTask({ autopilotBranding: customization }), context);

    expect(result).toMatchObject({ success: true, skipped: false, createdId: "created-app" });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([AUTOPILOT_BRANDING_CONTENT_URL, template.detectionScriptUrl]);
    const [, appTemplate, packageFile, detectionScript] = mockCreateWin32AppFromPackage.mock.calls[0];
    expect(appTemplate).toMatchObject({
      displayName: template.displayName,
      packageIdentifier: template.packageIdentifier,
      installCommandLine: template.installCommandLine,
      uninstallCommandLine: template.uninstallCommandLine,
    });
    expect(appTemplate.description).toContain("customized cleanup-only configuration");
    expect(appTemplate.description).toContain("Clipchamp (Clipchamp.Clipchamp), Microsoft Teams (new) (MSTeams)");
    expect(appTemplate.notes).toContain("IntuneHydrationKitTemplateId: autopilot-branding");
    expect(appTemplate.notes).toContain(
      "Enabled tasks: Hide-ABWidgets, Remove-ABProvisionedApps, Update-ABApps",
    );
    expect(detectionScript).toBe(DETECTION_SCRIPT);
    expect(packageFile.setupFile).toBe("AutopilotBranding.ps1");

    const baseConfiguration = new TextDecoder().decode(
      readStoredZipEntries(publicBytes(AUTOPILOT_BRANDING_CONTENT_URL)).find(
        (entry) => entry.name === "AutopilotBranding.json",
      )!.content,
    );
    expect(await decryptConfiguration(packageFile)).toBe(
      buildAutopilotBrandingConfiguration(baseConfiguration, customization),
    );
  });

  it.each([
    ["no customization", undefined],
    ["the default choices", getDefaultAutopilotBrandingCustomization()],
  ])("uploads the prebuilt package with %s, as before", async (_label, value) => {
    const fetchMock = stubFetch();
    const context = createContext();

    await executeWin32AppTask(createTask(value ? { autopilotBranding: value } : {}), context);

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([template.packageUrl, template.detectionScriptUrl]);
    expect(mockCreateWin32AppFromPackage).toHaveBeenCalledWith(
      context.client,
      template,
      expect.objectContaining({ setupFile: "AutopilotBranding.ps1" }),
      DETECTION_SCRIPT,
      undefined,
    );
  });

  it.each([
    ["an unknown app", { removedApps: ["Contoso.App"], enabledTasks: [] }],
    ["a task outside the ten", { removedApps: [], enabledTasks: ["Set-ABTheme"] }],
    ["an unknown key", { ...customization, wallpaperPath: "Assets/a.jpg" }],
  ])("fails without fetching or uploading for %s", async (_label, value) => {
    const fetchMock = stubFetch();

    const result = await executeWin32AppTask(
      createTask({ autopilotBranding: value as unknown as AutopilotBrandingCustomization }),
      createContext(),
    );

    expect(result).toMatchObject({ success: false, skipped: false });
    expect(result.error).toContain("The Autopilot Branding customization is not valid, so the app was not created.");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockCreateWin32AppFromPackage).not.toHaveBeenCalled();
  });

  it("fails when another app has a customization", async () => {
    const fetchMock = stubFetch();

    const result = await executeWin32AppTask(
      createTask({ itemName: "7-Zip - [IHD]", autopilotBranding: customization }),
      createContext(),
    );

    expect(result).toMatchObject({ success: false, error: "Only the Autopilot Branding app can have a configuration customization." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("previews a customized app without fetching or building a package", async () => {
    const fetchMock = stubFetch();

    const result = await executeWin32AppTask(createTask({ autopilotBranding: customization }), createContext(true));

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockCreateWin32AppFromPackage).not.toHaveBeenCalled();
  });

  it("skips a customized app that already exists", async () => {
    const fetchMock = stubFetch();
    mockGetWin32LobApps.mockResolvedValue([{ id: "existing", displayName: template.displayName }]);

    const result = await executeWin32AppTask(createTask({ autopilotBranding: customization }), createContext());

    expect(result).toMatchObject({ success: true, skipped: true, error: "Already exists" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
