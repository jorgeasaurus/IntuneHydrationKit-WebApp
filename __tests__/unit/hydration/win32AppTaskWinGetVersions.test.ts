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

// A jsdom Blob has no arrayBuffer(), so the wrapper reads it with FileReader; the real reader parses the bytes.
vi.mock("@/lib/win32/intuneWinPackage", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/win32/intuneWinPackage")>();
  return {
    ...original,
    readIntuneWinPackage: async (file: Blob | ArrayBuffer) =>
      original.readIntuneWinPackage(file instanceof ArrayBuffer ? file : await readBlob(file)),
  };
});

import { executeWin32AppTask } from "@/lib/hydration/taskExecutors/win32AppTask";
import { isOwnedWin32App } from "@/lib/graph/win32Apps";
import { addHydrationMarker } from "@/lib/utils/hydrationMarker";
import { readStoredZipEntries } from "@/lib/win32/storedZip";
import { MAX_WIN32_UPLOAD_BYTES } from "@/lib/win32/intuneWinWriter";
import { buildWinGetPackage } from "@/lib/win32/wingetPackage";
import { getWinGetScripts } from "@/lib/win32/wingetScripts";
import { WINGET_VERSION_CATALOG_URL } from "@/lib/winget/versionCatalog";
import { getWin32AppTemplateByName, SEVEN_ZIP_WIN32_APP, WINGET_CATALOG_WIN32_APPS } from "@/templates/win32Apps";
import type { Win32AppTemplate } from "@/templates/win32Apps";

const PUBLIC = join(process.cwd(), "public");
const catalog = JSON.parse(readFileSync(join(PUBLIC, "winget-versions.json"), "utf8"));
const NOTEPAD = getWin32AppTemplateByName("Notepad++ - [IHD]")!;

function versionsOf(template: Win32AppTemplate): string[] {
  return catalog.apps
    .find((app: { packageIdentifier: string }) => app.packageIdentifier === template.packageIdentifier)
    .versions.map((version: { version: string }) => version.version);
}

function publicBytes(url: string): ArrayBuffer {
  const bytes = readFileSync(join(PUBLIC, url));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function stubFetch() {
  const fetchMock = vi.fn(async (url: string) => new Response(publicBytes(url), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function readBlob(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

async function decryptContent(packageFile: IntuneWinPackage): Promise<Map<string, string>> {
  const encrypted = Buffer.from(await readBlob(packageFile.encryptedContent));
  const decipher = createDecipheriv(
    "aes-256-cbc",
    Buffer.from(packageFile.encryptionInfo.encryptionKey, "base64"),
    Buffer.from(packageFile.encryptionInfo.initializationVector, "base64"),
  );
  const content = Buffer.concat([decipher.update(encrypted.subarray(48)), decipher.final()]);
  const entries = readStoredZipEntries(content.buffer.slice(content.byteOffset, content.byteOffset + content.length));
  return new Map(entries.map((entry) => [entry.name, new TextDecoder().decode(entry.content)]));
}

function createTask(template: Win32AppTemplate, overrides: Partial<HydrationTask> = {}): HydrationTask {
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

function uploadedCall() {
  const [, uploadedTemplate, packageFile, detectionScript, icon] = mockCreateWin32AppFromPackage.mock.calls[0];
  return { uploadedTemplate: uploadedTemplate as Win32AppTemplate, packageFile: packageFile as IntuneWinPackage, detectionScript: detectionScript as string, icon };
}

describe("executeWin32AppTask for WinGet versions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    sessionStorage.clear();
    mockGetWin32LobApps.mockResolvedValue([]);
    mockCreateWin32AppFromPackage.mockResolvedValue({ id: "created-app", displayName: "created" });
  });

  it("uploads the prebuilt package of a starter app for the latest version, with the same calls as before", async () => {
    const fetchMock = stubFetch();

    await expect(executeWin32AppTask(createTask(SEVEN_ZIP_WIN32_APP), createContext())).resolves.toMatchObject({
      success: true,
      createdId: "created-app",
    });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/win32-apps/7-zip.intunewin",
      "/win32-apps/7-zip/Detect-WinGetPackage.ps1",
      "/win32-apps/7-zip.png",
    ]);
    const { uploadedTemplate, detectionScript } = uploadedCall();
    expect(uploadedTemplate).toBe(SEVEN_ZIP_WIN32_APP);
    expect(detectionScript).toBe(readFileSync(join(PUBLIC, "win32-apps/7-zip/Detect-WinGetPackage.ps1"), "utf8"));
  });

  it("builds a package in the browser for a pinned starter app, with the version in the app and the notes", async () => {
    const version = versionsOf(SEVEN_ZIP_WIN32_APP)[1];
    const fetchMock = stubFetch();

    await expect(
      executeWin32AppTask(createTask(SEVEN_ZIP_WIN32_APP, { wingetVersion: version }), createContext()),
    ).resolves.toMatchObject({ success: true, createdId: "created-app" });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([WINGET_VERSION_CATALOG_URL, "/win32-apps/7-zip.png"]);
    const { uploadedTemplate, packageFile, detectionScript, icon } = uploadedCall();
    expect(uploadedTemplate.displayName).toBe(SEVEN_ZIP_WIN32_APP.displayName);
    expect(uploadedTemplate.version).toBe(version);
    expect(uploadedTemplate.notes).toContain(`WinGetPackageVersion: ${version}`);
    expect(uploadedTemplate.notes).not.toContain("WinGetPackageVersion: latest");
    expect(uploadedTemplate.notes).toContain("WinGetPackageIdentifier: 7zip.7zip");
    expect(isOwnedWin32App({
      id: "x",
      displayName: uploadedTemplate.displayName,
      description: addHydrationMarker(uploadedTemplate.description),
      notes: uploadedTemplate.notes,
    } as Parameters<typeof isOwnedWin32App>[0])).toBe(true);
    expect(icon).toBeTruthy();

    const scripts = getWinGetScripts(SEVEN_ZIP_WIN32_APP.winget!, version);
    expect(detectionScript).toBe(scripts.detection);
    expect(packageFile.setupFile).toBe("Install-WinGetPackage.ps1");
    const content = await decryptContent(packageFile);
    expect([...content.keys()]).toEqual([
      "Detect-WinGetPackage.ps1",
      "Install-WinGetPackage.ps1",
      "Uninstall-WinGetPackage.ps1",
    ]);
    expect(content.get("Install-WinGetPackage.ps1")).toBe(scripts.install);
    expect(content.get("Install-WinGetPackage.ps1")).toContain(`--exact --version ${version} --silent`);
    expect(content.get("Uninstall-WinGetPackage.ps1")).toBe(scripts.uninstall);
    expect(content.get("Detect-WinGetPackage.ps1")).toBe(scripts.detection);
  });

  it("builds a package in the browser for a catalog app with the latest version and no icon", async () => {
    const fetchMock = stubFetch();

    await expect(executeWin32AppTask(createTask(NOTEPAD), createContext())).resolves.toMatchObject({ success: true });

    // No catalog check for the latest version, no prebuilt package, no committed script, no icon.
    expect(fetchMock).not.toHaveBeenCalled();
    const { uploadedTemplate, packageFile, detectionScript, icon } = uploadedCall();
    expect(uploadedTemplate).toBe(NOTEPAD);
    expect(uploadedTemplate.notes).toContain("WinGetPackageVersion: latest");
    expect(icon).toBeUndefined();
    expect(detectionScript).not.toContain("MinimumVersion");
    expect((await decryptContent(packageFile)).get("Install-WinGetPackage.ps1")).toContain(
      "winget install --id Notepad++.Notepad++ --exact --silent --scope machine",
    );
    expect(packageFile.unencryptedContentSize).toBeLessThan(4 * 1024 * 1024);
  });

  it("builds a pinned catalog app", async () => {
    const version = versionsOf(NOTEPAD)[0];
    stubFetch();

    await expect(
      executeWin32AppTask(createTask(NOTEPAD, { wingetVersion: version }), createContext()),
    ).resolves.toMatchObject({ success: true });
    const { uploadedTemplate, detectionScript } = uploadedCall();
    expect(uploadedTemplate.version).toBe(version);
    expect(detectionScript).toContain(`$MinimumVersion = '${version}'`);
  });

  it.each([
    ["a version that is not in the catalog", "0.0.0.1", /is not in the WinGet version catalog/],
    ["a version text that is not safe", "1.0 --force", /WinGet version of 7-Zip - \[IHD\] is not valid/],
  ])("fails before any package is fetched or built for %s", async (_, version, message) => {
    const fetchMock = stubFetch();

    const result = await executeWin32AppTask(createTask(SEVEN_ZIP_WIN32_APP, { wingetVersion: version }), createContext());

    expect(result).toMatchObject({ success: false, skipped: false });
    expect(result.error).toMatch(message);
    expect(fetchMock.mock.calls.map(([url]) => url).filter((url) => url !== WINGET_VERSION_CATALOG_URL)).toEqual([]);
    expect(mockCreateWin32AppFromPackage).not.toHaveBeenCalled();
  });

  it("fails a pinned version that has no machine-scope x64 installer", async () => {
    const original = structuredClone(catalog);
    const app = original.apps.find((entry: { packageIdentifier: string }) => entry.packageIdentifier === "7zip.7zip");
    const version = app.versions[1];
    version.installers = version.installers.map((installer: { scope: string | null }) => ({ ...installer, scope: "user" }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(original))));

    const result = await executeWin32AppTask(
      createTask(SEVEN_ZIP_WIN32_APP, { wingetVersion: version.version }),
      createContext(),
    );
    expect(result.error).toMatch(/has no machine-scope x64 installer/);
    expect(mockCreateWin32AppFromPackage).not.toHaveBeenCalled();
  });

  it("fails a WinGet version on an app that is not a WinGet app", async () => {
    const fetchMock = stubFetch();
    const autopilot = getWin32AppTemplateByName("Autopilot Branding (Cleanup) - [IHD]")!;

    const result = await executeWin32AppTask(createTask(autopilot, { wingetVersion: "1.0" }), createContext());
    expect(result.error).toMatch(/is not a WinGet app/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("builds and uploads nothing in preview", async () => {
    const fetchMock = stubFetch();

    for (const task of [
      createTask(NOTEPAD),
      createTask(SEVEN_ZIP_WIN32_APP, { wingetVersion: versionsOf(SEVEN_ZIP_WIN32_APP)[0] }),
    ]) {
      await expect(executeWin32AppTask(task, createContext(true))).resolves.toMatchObject({ success: true, skipped: false });
    }
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([WINGET_VERSION_CATALOG_URL]);
    expect(mockCreateWin32AppFromPackage).not.toHaveBeenCalled();
  });

  it("skips a pinned app that exists by name", async () => {
    stubFetch();
    mockGetWin32LobApps.mockResolvedValue([{ id: "existing", displayName: SEVEN_ZIP_WIN32_APP.displayName }]);

    await expect(
      executeWin32AppTask(
        createTask(SEVEN_ZIP_WIN32_APP, { wingetVersion: versionsOf(SEVEN_ZIP_WIN32_APP)[0] }),
        createContext(),
      ),
    ).resolves.toMatchObject({ success: true, skipped: true, error: "Already exists" });
    expect(mockCreateWin32AppFromPackage).not.toHaveBeenCalled();
  });

  it("keeps every browser-built package far below the 4 MiB upload limit", async () => {
    expect(WINGET_CATALOG_WIN32_APPS).toHaveLength(15);
    for (const template of [...WINGET_CATALOG_WIN32_APPS, SEVEN_ZIP_WIN32_APP]) {
      const { packageBytes } = await buildWinGetPackage(template, versionsOf(template)[0]);
      expect(packageBytes.length).toBeLessThan(MAX_WIN32_UPLOAD_BYTES / 64);
    }
  });
});
