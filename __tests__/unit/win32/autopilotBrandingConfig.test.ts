import { createDecipheriv } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { isOwnedWin32App } from "@/lib/graph/win32Apps";
import { addHydrationMarker } from "@/lib/utils/hydrationMarker";
import {
  AUTOPILOT_BRANDING_APP_NAMES,
  AUTOPILOT_BRANDING_APPS,
  AUTOPILOT_BRANDING_KEPT_APPS,
  AUTOPILOT_BRANDING_TASKS,
  CONTROLLED_TASK_NAMES,
  buildAutopilotBrandingConfiguration,
  getCustomizedAutopilotBrandingTemplate,
  getDefaultAutopilotBrandingCustomization,
  isDefaultAutopilotBrandingCustomization,
  parseAutopilotBrandingCustomization,
} from "@/lib/win32/autopilotBrandingConfig";
import {
  AUTOPILOT_BRANDING_CONFIGURATION_ENTRY,
  MAX_WIN32_UPLOAD_BYTES,
  buildAutopilotBrandingPackage,
} from "@/lib/win32/autopilotBrandingPackage";
import { readIntuneWinPackage } from "@/lib/win32/intuneWinPackage";
import { readStoredZipEntries } from "@/lib/win32/storedZip";
import { AUTOPILOT_BRANDING_WIN32_APP, KIT_TEMPLATE_ID_NOTE } from "@/templates/win32Apps";

const ROOT = join(process.cwd(), "public/win32-apps/autopilot-branding");

interface Configuration {
  Description: string;
  Tasks: Record<string, { Enabled: boolean; Parameters: Record<string, unknown> }>;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

const contentZip = toArrayBuffer(readFileSync(join(ROOT, "content.zip")));
const contentEntries = readStoredZipEntries(contentZip);
const baseText = new TextDecoder().decode(
  contentEntries.find((entry) => entry.name === AUTOPILOT_BRANDING_CONFIGURATION_ENTRY)!.content,
);
const base = JSON.parse(baseText) as Configuration;
const committed = JSON.parse(readFileSync(join(ROOT, "AutopilotBranding.json"), "utf8")) as Configuration;
/** Upstream default list of AutopilotBranding 4.0.7 (Template/AutopilotBranding.json). */
const UPSTREAM_APP_NAMES = [
  "Clipchamp.Clipchamp", "Microsoft.BingNews", "Microsoft.BingWeather", "Microsoft.GamingApp", "Microsoft.GetHelp",
  "Microsoft.GetStarted", "Microsoft.Messaging", "Microsoft.Microsoft3DViewer", "Microsoft.MicrosoftOfficeHub",
  "Microsoft.MicrosoftSolitaireCollection", "Microsoft.MixedReality.Portal", "Microsoft.MSPaint", "Microsoft.News",
  "Microsoft.OneConnect", "Microsoft.OutlookForWindows", "Microsoft.People", "Microsoft.PowerAutomateDesktop",
  "Microsoft.Print3D", "Microsoft.SkypeApp", "microsoft.windowscommunicationsapps", "Microsoft.WindowsFeedbackHub",
  "Microsoft.WindowsMaps", "Microsoft.XboxApp", "Microsoft.YourPhone", "Microsoft.ZuneMusic", "Microsoft.ZuneVideo",
  "Microsoft.Xbox.TCUI", "Microsoft.XboxGameOverlay", "Microsoft.XboxGamingOverlay", "Microsoft.XboxIdentityProvider",
  "Microsoft.XboxSpeechToTextOverlay", "MicrosoftCorporationII.MicrosoftFamily", "MicrosoftTeams", "MSTeams",
  "Microsoft.M365Companions", "9NHT9RB2F4HD",
];

function build(customization: unknown): Configuration {
  return JSON.parse(buildAutopilotBrandingConfiguration(baseText, customization)) as Configuration;
}

function enabledTasks(configuration: Configuration): string[] {
  return Object.entries(configuration.Tasks).filter(([, task]) => task.Enabled).map(([name]) => name);
}

describe("Autopilot Branding customization catalog", () => {
  it("lists the 36 upstream app names in upstream order", () => {
    expect(AUTOPILOT_BRANDING_APP_NAMES).toEqual(UPSTREAM_APP_NAMES);
    expect(AUTOPILOT_BRANDING_APPS.every((app) => !("label" in app) || app.label.length > 0)).toBe(true);
  });

  it("starts with the 29 apps of the kit configuration and keeps the seven work apps", () => {
    const defaults = getDefaultAutopilotBrandingCustomization();
    expect(defaults.removedApps).toEqual(committed.Tasks["Remove-ABProvisionedApps"].Parameters.AppNames);
    expect(defaults.removedApps).toHaveLength(29);
    expect(AUTOPILOT_BRANDING_KEPT_APPS).toHaveLength(7);
    for (const app of AUTOPILOT_BRANDING_KEPT_APPS) expect(defaults.removedApps).not.toContain(app);
  });

  it("controls exactly the ten cleanup tasks of the kit configuration", () => {
    expect(new Set(CONTROLLED_TASK_NAMES)).toEqual(new Set(enabledTasks(committed)));
    expect(AUTOPILOT_BRANDING_TASKS).toHaveLength(9);
    expect(AUTOPILOT_BRANDING_TASKS.every((task) => task.description.length > 0)).toBe(true);
  });
});

describe("buildAutopilotBrandingConfiguration", () => {
  it("reproduces the packaged configuration exactly with the default choices", () => {
    // The packaged file is the kit configuration that the AutopilotBranding module wrote.
    expect(buildAutopilotBrandingConfiguration(baseText, getDefaultAutopilotBrandingCustomization())).toBe(baseText);
    const generated = build(getDefaultAutopilotBrandingCustomization());
    expect(enabledTasks(generated)).toEqual(enabledTasks(committed));
    expect(generated.Tasks["Remove-ABProvisionedApps"].Parameters.AppNames)
      .toEqual(committed.Tasks["Remove-ABProvisionedApps"].Parameters.AppNames);
  });

  it("applies the chosen apps in upstream order and switches the chosen tasks", () => {
    const generated = build({
      removedApps: ["MSTeams", "Clipchamp.Clipchamp", "Microsoft.YourPhone"],
      enabledTasks: ["Update-ABApps", "Hide-ABWidgets"],
    });

    expect(generated.Tasks["Remove-ABProvisionedApps"]).toEqual({
      Enabled: true,
      Parameters: { AppNames: ["Clipchamp.Clipchamp", "Microsoft.YourPhone", "MSTeams"], RemoveInstalledPackages: true },
    });
    expect(enabledTasks(generated)).toEqual(["Hide-ABWidgets", "Remove-ABProvisionedApps", "Update-ABApps"]);
    // The parameters of every task stay as they are in the base, including the cleared file parameters.
    for (const [name, task] of Object.entries(generated.Tasks)) {
      if (name !== "Remove-ABProvisionedApps") expect(task.Parameters, name).toEqual(base.Tasks[name].Parameters);
    }
    expect(generated.Tasks["Set-ABTheme"].Parameters).toMatchObject({ ThemePath: "", WallpaperPath: "" });
    expect(generated.Tasks["Disable-ABAutoInstalledApps"].Parameters).toEqual({ DevHome: true, OutlookNew: false });
  });

  it("disables the removal task when no app is selected", () => {
    const generated = build({ removedApps: [], enabledTasks: ["Update-ABEdge"] });
    expect(generated.Tasks["Remove-ABProvisionedApps"]).toMatchObject({ Enabled: false, Parameters: { AppNames: [] } });
    expect(enabledTasks(generated)).toEqual(["Update-ABEdge"]);
  });

  it.each([
    ["an unknown app", { removedApps: ["Contoso.App"], enabledTasks: [] }],
    ["an unknown task", { removedApps: [], enabledTasks: ["Set-ABTheme"] }],
    ["the removal task as a toggle", { removedApps: [], enabledTasks: ["Remove-ABProvisionedApps"] }],
    ["an unknown key", { removedApps: ["Clipchamp.Clipchamp"], enabledTasks: [], wallpaper: "a.jpg" }],
    ["a duplicate app", { removedApps: ["Clipchamp.Clipchamp", "Clipchamp.Clipchamp"], enabledTasks: [] }],
    ["no app and no task", { removedApps: [], enabledTasks: [] }],
    ["a missing field", { removedApps: ["Clipchamp.Clipchamp"] }],
    ["a value that is not an object", "Clipchamp.Clipchamp"],
  ])("rejects %s", (_label, customization) => {
    expect(() => buildAutopilotBrandingConfiguration(baseText, customization)).toThrow(
      "The Autopilot Branding customization is not valid",
    );
  });

  it("never enables a task outside the ten, even from a changed base", () => {
    const changedBase = structuredClone(base);
    changedBase.Tasks["Set-ABTheme"].Enabled = true;
    expect(() => buildAutopilotBrandingConfiguration(JSON.stringify(changedBase), getDefaultAutopilotBrandingCustomization()))
      .toThrow("does not enable exactly the kit cleanup tasks");

    const allTasks = build({
      removedApps: [...AUTOPILOT_BRANDING_APP_NAMES],
      enabledTasks: AUTOPILOT_BRANDING_TASKS.map((task) => task.name),
    });
    expect(new Set(enabledTasks(allTasks))).toEqual(new Set(CONTROLLED_TASK_NAMES));
  });
});

describe("customization helpers", () => {
  it("knows the default choices in any order", () => {
    const defaults = getDefaultAutopilotBrandingCustomization();
    expect(isDefaultAutopilotBrandingCustomization({
      removedApps: [...defaults.removedApps].reverse(),
      enabledTasks: [...defaults.enabledTasks].reverse(),
    })).toBe(true);
    expect(isDefaultAutopilotBrandingCustomization({ ...defaults, enabledTasks: defaults.enabledTasks.slice(1) })).toBe(false);
  });

  it("returns the choices in catalog order", () => {
    expect(parseAutopilotBrandingCustomization({
      removedApps: ["MSTeams", "Clipchamp.Clipchamp"],
      enabledTasks: ["Update-ABApps", "Hide-ABWidgets"],
    })).toEqual({
      removedApps: ["Clipchamp.Clipchamp", "MSTeams"],
      enabledTasks: ["Hide-ABWidgets", "Update-ABApps"],
    });
  });

  it("describes a customized app truthfully and keeps both ownership markers", () => {
    const template = getCustomizedAutopilotBrandingTemplate({
      removedApps: ["Microsoft.MicrosoftSolitaireCollection", "9NHT9RB2F4HD"],
      enabledTasks: ["Hide-ABWidgets"],
    });

    expect(template.displayName).toBe(AUTOPILOT_BRANDING_WIN32_APP.displayName);
    expect(template.description).toContain("customized cleanup-only configuration");
    expect(template.description).toContain("it removes 2 in-box apps, and hides Widgets.");
    expect(template.description).toContain(
      "Apps that it removes: Solitaire Collection (Microsoft.MicrosoftSolitaireCollection), 9NHT9RB2F4HD.",
    );
    expect(template.description).not.toContain("updates Edge");
    expect(template.notes).toContain(`${KIT_TEMPLATE_ID_NOTE} autopilot-branding`);
    expect(template.notes).toContain(
      "Configuration: Intune Hydration Kit cleanup-only, customized. Enabled tasks: Hide-ABWidgets, Remove-ABProvisionedApps",
    );
    expect(isOwnedWin32App({
      id: "app",
      displayName: template.displayName,
      description: addHydrationMarker(template.description),
      notes: template.notes,
    })).toBe(true);
  });

  it("says that no app is removed when the list is empty", () => {
    const template = getCustomizedAutopilotBrandingTemplate({ removedApps: [], enabledTasks: ["Update-ABEdge"] });
    expect(template.description).toContain("it updates Edge.");
    expect(template.description).toContain("It removes no apps.");
    expect(template.notes).toContain("Enabled tasks: Update-ABEdge");
  });
});

describe("buildAutopilotBrandingPackage", () => {
  it("builds a package from content.zip with the generated configuration, far below the upload limit", async () => {
    const customization = { removedApps: ["Clipchamp.Clipchamp"], enabledTasks: ["Hide-ABWidgets"] };
    const packageBytes = await buildAutopilotBrandingPackage(contentZip, customization);
    const packageFile = await readIntuneWinPackage(toArrayBuffer(packageBytes));
    expect(packageFile.setupFile).toBe("AutopilotBranding.ps1");
    expect(packageBytes.length).toBeLessThan(MAX_WIN32_UPLOAD_BYTES / 8);

    // jsdom Blob has no arrayBuffer(), so the test reads the encrypted entry from the package directly.
    const encrypted = Buffer.from(readStoredZipEntries(toArrayBuffer(packageBytes))[0].content);
    expect(encrypted.length).toBe(packageFile.encryptedContent.size);
    const decipher = createDecipheriv(
      "aes-256-cbc",
      Buffer.from(packageFile.encryptionInfo.encryptionKey, "base64"),
      Buffer.from(packageFile.encryptionInfo.initializationVector, "base64"),
    );
    const content = Buffer.concat([decipher.update(encrypted.subarray(48)), decipher.final()]);
    const entries = readStoredZipEntries(toArrayBuffer(content));

    // The same files as the prebuilt content; only AutopilotBranding.json differs.
    expect(entries.map((entry) => entry.name)).toEqual(contentEntries.map((entry) => entry.name));
    for (const entry of entries) {
      const original = contentEntries.find((candidate) => candidate.name === entry.name)!;
      if (entry.name === AUTOPILOT_BRANDING_CONFIGURATION_ENTRY) {
        expect(new TextDecoder().decode(entry.content)).toBe(buildAutopilotBrandingConfiguration(baseText, customization));
      } else {
        expect(Buffer.from(entry.content).equals(Buffer.from(original.content)), entry.name).toBe(true);
      }
    }
  });

  it("fails closed on an invalid customization", async () => {
    await expect(buildAutopilotBrandingPackage(contentZip, { removedApps: ["Contoso.App"], enabledTasks: [] }))
      .rejects.toThrow("not valid");
  });
});
