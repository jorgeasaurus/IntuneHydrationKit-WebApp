/**
 * User customization of the Autopilot Branding (Cleanup) app.
 *
 * The customization can only change two things in the kit cleanup-only configuration:
 * - The apps that Remove-ABProvisionedApps removes, from the 36 names of the upstream default list.
 * - Which of the nine other cleanup tasks of the kit configuration run.
 * It cannot enable any other task, change a task parameter, or add a file to the package.
 *
 * The base configuration is the AutopilotBranding.json file in the package content
 * (public/win32-apps/autopilot-branding/content.zip). The AutopilotBranding module wrote that file
 * from the kit configuration, and cleared the file parameters of the disabled tasks.
 */

import { z } from "@/lib/utils/zod";
import {
  AUTOPILOT_BRANDING_VERSION,
  AUTOPILOT_BRANDING_WIN32_APP,
  KIT_TEMPLATE_ID_NOTE,
  type Win32AppTemplate,
} from "@/templates/win32Apps";

export interface AutopilotBrandingApp {
  /** Appx package name (or Store ID) in Remove-ABProvisionedApps.AppNames. */
  packageName: string;
  /** Plain name. Without one, the UI shows the package name only. */
  label?: string;
}

/** Upstream default Remove-ABProvisionedApps.AppNames of AutopilotBranding 4.0.7, in upstream order. */
export const AUTOPILOT_BRANDING_APPS = [
  { packageName: "Clipchamp.Clipchamp", label: "Clipchamp" },
  { packageName: "Microsoft.BingNews", label: "Microsoft News" },
  { packageName: "Microsoft.BingWeather", label: "Weather" },
  { packageName: "Microsoft.GamingApp", label: "Xbox" },
  { packageName: "Microsoft.GetHelp", label: "Get Help" },
  { packageName: "Microsoft.GetStarted", label: "Tips" },
  { packageName: "Microsoft.Messaging", label: "Messaging" },
  { packageName: "Microsoft.Microsoft3DViewer", label: "3D Viewer" },
  { packageName: "Microsoft.MicrosoftOfficeHub", label: "Microsoft 365 (Office)" },
  { packageName: "Microsoft.MicrosoftSolitaireCollection", label: "Solitaire Collection" },
  { packageName: "Microsoft.MixedReality.Portal", label: "Mixed Reality Portal" },
  { packageName: "Microsoft.MSPaint", label: "Paint 3D" },
  { packageName: "Microsoft.News", label: "Microsoft News" },
  { packageName: "Microsoft.OneConnect", label: "Mobile Plans" },
  { packageName: "Microsoft.OutlookForWindows", label: "Outlook (new)" },
  { packageName: "Microsoft.People", label: "People" },
  { packageName: "Microsoft.PowerAutomateDesktop", label: "Power Automate" },
  { packageName: "Microsoft.Print3D", label: "Print 3D" },
  { packageName: "Microsoft.SkypeApp", label: "Skype" },
  { packageName: "microsoft.windowscommunicationsapps", label: "Mail and Calendar" },
  { packageName: "Microsoft.WindowsFeedbackHub", label: "Feedback Hub" },
  { packageName: "Microsoft.WindowsMaps", label: "Maps" },
  { packageName: "Microsoft.XboxApp", label: "Xbox Console Companion" },
  { packageName: "Microsoft.YourPhone", label: "Phone Link" },
  { packageName: "Microsoft.ZuneMusic", label: "Media Player (Groove Music)" },
  { packageName: "Microsoft.ZuneVideo", label: "Movies & TV" },
  { packageName: "Microsoft.Xbox.TCUI", label: "Xbox sign-in UI (TCUI)" },
  { packageName: "Microsoft.XboxGameOverlay", label: "Xbox Game Bar plugin" },
  { packageName: "Microsoft.XboxGamingOverlay", label: "Xbox Game Bar" },
  { packageName: "Microsoft.XboxIdentityProvider", label: "Xbox Identity Provider" },
  { packageName: "Microsoft.XboxSpeechToTextOverlay", label: "Xbox speech to text overlay" },
  { packageName: "MicrosoftCorporationII.MicrosoftFamily", label: "Microsoft Family Safety" },
  { packageName: "MicrosoftTeams", label: "Microsoft Teams (personal)" },
  { packageName: "MSTeams", label: "Microsoft Teams (new)" },
  { packageName: "Microsoft.M365Companions", label: "Microsoft 365 companion apps" },
  { packageName: "9NHT9RB2F4HD", label: "Microsoft Copilot" },
] as const satisfies readonly AutopilotBrandingApp[];

export type AutopilotBrandingAppName = (typeof AUTOPILOT_BRANDING_APPS)[number]["packageName"];

export const AUTOPILOT_BRANDING_APP_NAMES = AUTOPILOT_BRANDING_APPS.map(
  (app) => app.packageName,
) as readonly AutopilotBrandingAppName[] as [AutopilotBrandingAppName, ...AutopilotBrandingAppName[]];

/** Apps of the upstream default list that the kit configuration keeps, because work devices often use them. */
export const AUTOPILOT_BRANDING_KEPT_APPS = [
  "Microsoft.MicrosoftOfficeHub",
  "Microsoft.MSPaint",
  "Microsoft.OutlookForWindows",
  "Microsoft.PowerAutomateDesktop",
  "Microsoft.YourPhone",
  "MSTeams",
  "Microsoft.M365Companions",
] as const satisfies readonly AutopilotBrandingAppName[];

export const REMOVE_APPS_TASK = "Remove-ABProvisionedApps";

export interface AutopilotBrandingTask {
  name: string;
  label: string;
  /** One-line description for the customize dialog. */
  description: string;
  /** What the task does, as a phrase for the app description ("During OOBE it ..."). */
  action: string;
}

/** The cleanup tasks other than app removal that the kit configuration enables, in configuration order. */
export const AUTOPILOT_BRANDING_TASKS = [
  {
    name: "Disable-ABStartOnFirstLogon",
    label: "Do not open Start at first sign-in",
    description: "Stops Start from opening the first time a new user signs in.",
    action: "stops Start from opening at the first sign-in of a new user",
  },
  {
    name: "Hide-ABWidgets",
    label: "Hide Widgets",
    description: "Hides the Widgets button on the taskbar.",
    action: "hides Widgets",
  },
  {
    name: "Disable-ABCopilotPWA",
    label: "Block the Copilot app",
    description: "Prevents the Copilot app (PWA) from being installed for new users.",
    action: "blocks the Copilot app from being installed",
  },
  {
    name: "Disable-ABEdgeDesktopShortcut",
    label: "No Edge desktop shortcut",
    description: "Stops Edge from creating a desktop shortcut.",
    action: "removes the Edge desktop shortcut",
  },
  {
    name: "Update-ABEdge",
    label: "Update Edge",
    description: "Installs the latest Stable Edge for Business for the device architecture.",
    action: "updates Edge",
  },
  {
    name: "Remove-ABEdgeBookmarks",
    label: "Remove OEM Edge bookmarks",
    description: "Removes OEM Edge bookmarks from the default profile.",
    action: "removes OEM Edge bookmarks",
  },
  {
    name: "Disable-ABNetworkLocationFlyout",
    label: "Turn off the network location fly-out",
    description: "Turns off the network location fly-out.",
    action: "turns off the network location fly-out",
  },
  {
    name: "Disable-ABAutoInstalledApps",
    label: "Block Dev Home",
    description: "Stops Dev Home from being installed automatically. The new Outlook is not blocked.",
    action: "blocks Dev Home from being installed",
  },
  {
    name: "Update-ABApps",
    label: "Update in-box apps",
    description: "Updates the in-box apps and starts a Microsoft Store update scan.",
    action: "updates the in-box apps",
  },
] as const satisfies readonly AutopilotBrandingTask[];

export type AutopilotBrandingTaskName = (typeof AUTOPILOT_BRANDING_TASKS)[number]["name"];

const TASK_NAMES = AUTOPILOT_BRANDING_TASKS.map((task) => task.name) as readonly AutopilotBrandingTaskName[] as [
  AutopilotBrandingTaskName,
  ...AutopilotBrandingTaskName[],
];

/** The ten tasks that the customization controls. No other task can be enabled. */
export const CONTROLLED_TASK_NAMES: readonly string[] = [REMOVE_APPS_TASK, ...TASK_NAMES];

/** The user choices. Absent (undefined) means the kit configuration without change. */
export interface AutopilotBrandingCustomization {
  /** Apps that Remove-ABProvisionedApps removes. Empty disables the task. */
  removedApps: AutopilotBrandingAppName[];
  /** Tasks of AUTOPILOT_BRANDING_TASKS that run. */
  enabledTasks: AutopilotBrandingTaskName[];
}

function hasNoDuplicates(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

/** Strict schema: unknown keys, unknown names, and duplicates are rejected, never removed. */
export const autopilotBrandingCustomizationSchema = z
  .strictObject({
    removedApps: z
      .array(z.enum(AUTOPILOT_BRANDING_APP_NAMES))
      .refine(hasNoDuplicates, { message: "An app is in the list more than once." }),
    enabledTasks: z
      .array(z.enum(TASK_NAMES))
      .refine(hasNoDuplicates, { message: "A task is in the list more than once." }),
  })
  .refine((value) => value.removedApps.length > 0 || value.enabledTasks.length > 0, {
    message: "Select at least one app to remove or one cleanup task.",
  });

const KEPT_APPS = new Set<string>(AUTOPILOT_BRANDING_KEPT_APPS);

export function getDefaultAutopilotBrandingCustomization(): AutopilotBrandingCustomization {
  return {
    removedApps: AUTOPILOT_BRANDING_APP_NAMES.filter((name) => !KEPT_APPS.has(name)),
    enabledTasks: [...TASK_NAMES],
  };
}

/** The same choices in catalog order. */
export function normalizeAutopilotBrandingCustomization(
  customization: AutopilotBrandingCustomization,
): AutopilotBrandingCustomization {
  const apps = new Set<string>(customization.removedApps);
  const tasks = new Set<string>(customization.enabledTasks);
  return {
    removedApps: AUTOPILOT_BRANDING_APP_NAMES.filter((name) => apps.has(name)),
    enabledTasks: TASK_NAMES.filter((name) => tasks.has(name)),
  };
}

function sameMembers(a: readonly string[], b: readonly string[]): boolean {
  const set = new Set(a);
  return set.size === b.length && b.every((value) => set.has(value));
}

/** True when the choices are the kit configuration without change. */
export function isDefaultAutopilotBrandingCustomization(customization: AutopilotBrandingCustomization): boolean {
  const defaults = getDefaultAutopilotBrandingCustomization();
  return (
    sameMembers(customization.removedApps, defaults.removedApps) &&
    sameMembers(customization.enabledTasks, defaults.enabledTasks)
  );
}

export class AutopilotBrandingCustomizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AutopilotBrandingCustomizationError";
  }
}

/**
 * Validate a stored or received customization. Returns the choices in catalog order.
 * Throws AutopilotBrandingCustomizationError with a message for the user.
 */
export function parseAutopilotBrandingCustomization(value: unknown): AutopilotBrandingCustomization {
  const parsed = autopilotBrandingCustomizationSchema.safeParse(value);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => issue.message).join(" ");
    throw new AutopilotBrandingCustomizationError(
      `The Autopilot Branding customization is not valid, so the app was not created. ${details}`.trim(),
    );
  }
  return normalizeAutopilotBrandingCustomization(parsed.data);
}

interface BrandingTaskEntry {
  Enabled: boolean;
  Parameters: Record<string, unknown>;
}

interface BrandingConfiguration {
  Tasks: Record<string, BrandingTaskEntry>;
}

function readBaseConfiguration(baseConfigurationText: string): BrandingConfiguration {
  let parsed: unknown;
  try {
    parsed = JSON.parse(baseConfigurationText);
  } catch {
    throw new Error("The Autopilot Branding base configuration is not valid JSON.");
  }
  const tasks = (parsed as { Tasks?: unknown } | null)?.Tasks;
  if (!tasks || typeof tasks !== "object" || Array.isArray(tasks)) {
    throw new Error("The Autopilot Branding base configuration has no Tasks object.");
  }
  const configuration = parsed as BrandingConfiguration;
  const enabled = Object.entries(configuration.Tasks)
    .filter(([, task]) => task?.Enabled === true)
    .map(([name]) => name);
  // Fail closed when the base is not the kit cleanup-only configuration.
  if (!sameMembers(enabled, CONTROLLED_TASK_NAMES)) {
    throw new Error("The Autopilot Branding base configuration does not enable exactly the kit cleanup tasks.");
  }
  return configuration;
}

/**
 * Apply the customization to the base configuration and return the JSON text for the package.
 * Only the Enabled values of the ten controlled tasks and the AppNames list change. Every other
 * task and every parameter (including the cleared file parameters) stay as they are in the base.
 */
export function buildAutopilotBrandingConfiguration(baseConfigurationText: string, customization: unknown): string {
  const choices = parseAutopilotBrandingCustomization(customization);
  const configuration = readBaseConfiguration(baseConfigurationText);
  const output = structuredClone(configuration);
  const enabledTasks = new Set<string>(choices.enabledTasks);

  for (const name of TASK_NAMES) {
    output.Tasks[name].Enabled = enabledTasks.has(name);
  }
  const removeTask = output.Tasks[REMOVE_APPS_TASK];
  removeTask.Parameters = { ...removeTask.Parameters, AppNames: [...choices.removedApps] };
  removeTask.Enabled = choices.removedApps.length > 0;

  for (const [name, task] of Object.entries(output.Tasks)) {
    if (task.Enabled && !CONTROLLED_TASK_NAMES.includes(name)) {
      throw new Error(`The Autopilot Branding configuration must not enable ${name}.`);
    }
  }
  return JSON.stringify(output, null, 2);
}

/** The ten controlled tasks in the order of the configuration file. */
const CONFIGURATION_ORDER: readonly string[] = [
  TASK_NAMES[0],
  TASK_NAMES[1],
  REMOVE_APPS_TASK,
  ...TASK_NAMES.slice(2),
];

/** Names of the tasks that run, in the order of the configuration file. */
export function getEnabledTaskNames(customization: AutopilotBrandingCustomization): string[] {
  const enabled = new Set<string>(customization.enabledTasks);
  if (customization.removedApps.length > 0) enabled.add(REMOVE_APPS_TASK);
  return CONFIGURATION_ORDER.filter((name) => enabled.has(name));
}

/** Plain name of an app for the UI and the app description: "Label (package)" or the package name. */
export function formatAutopilotBrandingApp(packageName: string): string {
  const app = AUTOPILOT_BRANDING_APPS.find((candidate) => candidate.packageName === packageName) as
    | AutopilotBrandingApp
    | undefined;
  return app?.label ? `${app.label} (${packageName})` : packageName;
}

function joinPhrases(phrases: string[]): string {
  if (phrases.length <= 1) return phrases.join("");
  return `${phrases.slice(0, -1).join(", ")}, and ${phrases[phrases.length - 1]}`;
}

/**
 * The app template for a customized configuration. The description and the notes tell what the
 * package does. Both ownership markers stay: the create path adds the hydration marker to the
 * description, and the notes keep the template ID line.
 */
export function getCustomizedAutopilotBrandingTemplate(customization: unknown): Win32AppTemplate {
  const choices = parseAutopilotBrandingCustomization(customization);
  const base = AUTOPILOT_BRANDING_WIN32_APP;
  const enabled = new Set<string>(choices.enabledTasks);
  const actions = [
    ...(choices.removedApps.length > 0
      ? [`removes ${choices.removedApps.length} in-box ${choices.removedApps.length === 1 ? "app" : "apps"}`]
      : []),
    ...AUTOPILOT_BRANDING_TASKS.filter((task) => enabled.has(task.name)).map((task) => task.action),
  ];
  const removedList = choices.removedApps.length > 0
    ? ` Apps that it removes: ${choices.removedApps.map(formatAutopilotBrandingApp).join(", ")}.`
    : " It removes no apps.";
  const description =
    "Autopilot Branding by Michael Niehaus, with a customized cleanup-only configuration. " +
    `During Windows Autopilot (OOBE) it ${joinPhrases(actions)}. ` +
    "It sets no wallpaper, theme, Start layout, OEM information, language, or time zone, and installs no apps. " +
    "On a device that has completed OOBE it makes no change. " +
    "Assign it as a required app that blocks the Enrollment Status Page." +
    removedList;
  const notes = [
    `${KIT_TEMPLATE_ID_NOTE} ${base.id}`,
    "Source: https://github.com/mtniehaus/AutopilotBranding",
    `AutopilotBrandingVersion: ${AUTOPILOT_BRANDING_VERSION}`,
    "License: MIT (c) Michael Niehaus",
    `Configuration: Intune Hydration Kit cleanup-only, customized. Enabled tasks: ${getEnabledTaskNames(choices).join(", ")}`,
    "To apply your own branding, build a package at https://mtniehaus.github.io/AutopilotBranding/ and replace the app content. The commands and the detection rule stay the same.",
  ].join("\n");
  return { ...base, description, notes };
}
