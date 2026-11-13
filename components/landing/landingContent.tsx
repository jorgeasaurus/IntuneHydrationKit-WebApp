import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { TaskCategory } from "@/types/hydration";
import {
  Activity,
  Box,
  Cloud,
  Database,
  Layers,
  Lock,
  Radar,
  Shield,
  ShieldCheck,
  Terminal,
  Users,
  Zap,
} from "lucide-react";

const appVersion = process.env.NEXT_PUBLIC_APP_VERSION;

if (!appVersion) {
  throw new Error("NEXT_PUBLIC_APP_VERSION must be injected at build time.");
}

export const APP_VERSION = `v${appVersion}`;
const FAQ_LINK_CLASS_NAME = "text-hydrate hover:underline";

export type FaqItem = {
  question: string;
  answer: ReactNode;
};

export type FeatureItem = {
  icon: LucideIcon;
  title: string;
  description: string;
  signal: string;
};

export type StepItem = {
  step: string;
  icon: LucideIcon;
  title: string;
  description: string;
};

export type ConfigurationGroup = {
  icon: LucideIcon;
  title: string;
  label: string;
  total: number;
  unit: string;
  items: Array<{ value: number | string; label: string }>;
};

/**
 * Template counts for each catalog category on the landing page.
 *
 * These are literals so the landing bundle does not load template payloads or
 * manifests. `__tests__/unit/landing/landingCounts.test.ts` loads the real
 * catalog (`lib/templates/catalog.ts`, the source for /templates) and fails
 * when a value drifts. Update these values when templates change.
 */
export const LANDING_TEMPLATE_COUNTS = {
  groups: 67,
  filters: 44,
  compliance: 10,
  appProtection: 10,
  win32Apps: 4,
  conditionalAccess: 20,
  enrollment: 4,
  notification: 1,
  baseline: 102,
  cisBaseline: 728,
} as const satisfies Record<TaskCategory, number>;

export const LANDING_TEMPLATE_TOTAL = Object.values(LANDING_TEMPLATE_COUNTS).reduce(
  (total, count) => total + count,
  0
);

const TEMPLATE_TOTAL_LABEL = LANDING_TEMPLATE_TOTAL.toLocaleString("en-US");

export const HERO_STATS = [
  { value: TEMPLATE_TOTAL_LABEL, label: "deployable objects" },
  { value: "4", label: "guided stages" },
  { value: "3", label: "operation modes" },
  { value: "0", label: "enabled CA by default" },
] as const;

export const MOBILE_RUN_STEPS = [
  { label: "Scope", value: `${TEMPLATE_TOTAL_LABEL} objects` },
  { label: "Execute", value: "Preview ready" },
  { label: "Report", value: "Evidence export" },
] as const;

export const FEATURES: readonly FeatureItem[] = [
  {
    icon: ShieldCheck,
    title: "Guarded by default",
    description:
      "Hydration markers, assignment checks, disabled Conditional Access creates, and duplicate detection keep each run reversible.",
    signal: "Safety rails",
  },
  {
    icon: Zap,
    title: "Deployment intelligence",
    description:
      "Pre-fetched tenant caches, license checks, and unsupported-feature skips keep the run focused on actions that can succeed.",
    signal: "Smart skips",
  },
  {
    icon: Cloud,
    title: "Commercial cloud console",
    description:
      "The web app supports the Global commercial cloud only. Use the PowerShell module for sovereign clouds such as GCC High, DoD, and China 21Vianet.",
    signal: "Global web",
  },
  {
    icon: Activity,
    title: "Operator evidence",
    description:
      "Preview mode, execution logs, downloadable reports, and result summaries give admins proof before and after changes.",
    signal: "Audit ready",
  },
] as const;

export const STEPS: readonly StepItem[] = [
  {
    step: "01",
    icon: Lock,
    title: "Authenticate",
    description: "Connect to Microsoft Graph and confirm tenant readiness.",
  },
  {
    step: "02",
    icon: Radar,
    title: "Scope",
    description: "Choose exact categories, baselines, and policies for the run.",
  },
  {
    step: "03",
    icon: Terminal,
    title: "Execute",
    description: "Preview, create, or delete with clear progress and skips.",
  },
  {
    step: "04",
    icon: Database,
    title: "Report",
    description: "Export deployment evidence and review every task outcome.",
  },
] as const;

const counts = LANDING_TEMPLATE_COUNTS;

export const CONFIGURATION_GROUPS: readonly ConfigurationGroup[] = [
  {
    icon: Layers,
    title: "Security Baselines",
    label: "Primary",
    total: counts.baseline + counts.cisBaseline,
    unit: "policies",
    items: [
      { value: counts.cisBaseline, label: "CIS benchmark policies" },
      { value: counts.baseline, label: "OpenIntuneBaseline policies" },
      { value: "CIS + OIB", label: "baseline sources" },
    ],
  },
  {
    icon: Shield,
    title: "Security Policies",
    label: "Control",
    total:
      counts.conditionalAccess +
      counts.compliance +
      counts.appProtection +
      counts.notification,
    unit: "policies",
    items: [
      { value: counts.conditionalAccess, label: "Conditional Access" },
      { value: counts.compliance, label: "Compliance" },
      { value: counts.appProtection, label: "App Protection" },
      { value: counts.notification, label: "Compliance notification" },
    ],
  },
  {
    icon: Users,
    title: "Targeting & Onboarding",
    label: "Target",
    total: counts.groups + counts.filters + counts.enrollment + counts.win32Apps,
    unit: "objects",
    items: [
      { value: counts.groups, label: "Entra groups" },
      { value: counts.filters, label: "Assignment filters" },
      { value: counts.enrollment, label: "Enrollment profiles" },
      { value: counts.win32Apps, label: "Win32 apps" },
    ],
  },
  {
    icon: Box,
    title: "Operator Controls",
    label: "Adjust",
    total: 4,
    unit: "controls",
    items: [
      { value: "Select", label: "specific categories" },
      { value: "Preview", label: "before deployment" },
      { value: "Report", label: "execution evidence" },
      { value: "Custom", label: "baseline repository" },
    ],
  },
] as const;

export const PERMISSIONS = [
  "DeviceManagementConfiguration.ReadWrite.All",
  "DeviceManagementServiceConfig.ReadWrite.All",
  "DeviceManagementManagedDevices.ReadWrite.All",
  "DeviceManagementScripts.ReadWrite.All",
  "DeviceManagementApps.ReadWrite.All",
  "Group.ReadWrite.All",
  "Policy.Read.All",
  "Policy.ReadWrite.ConditionalAccess",
  "Application.Read.All",
  "Directory.ReadWrite.All",
  "LicenseAssignment.Read.All",
  "Organization.Read.All",
] as const;

export const FAQ_ITEMS: readonly FaqItem[] = [
  {
    question: "Can I use this tool without a commercial license?",
    answer:
      "You may evaluate the software under its EULA. Production, internal business, consulting, managed-service, modification, and redistribution use require a separately purchased written license.",
  },
  {
    question: "Is this tool safe to use in production?",
    answer:
      "Yes, with operator discipline. Test in a dev tenant first, then rely on markers, duplicate detection, disabled Conditional Access creates, and delete safeguards.",
  },
  {
    question: "What permissions do I need?",
    answer:
      "You need Global Administrator or Intune Administrator access with the ability to grant delegated Microsoft Graph permissions during sign-in.",
  },
  {
    question: "What licenses are required?",
    answer:
      "At minimum, you need an Intune license. Risk-based Conditional Access policies require Premium P2. Driver Update profiles require Windows E3/E5.",
  },
  {
    question: "Can I undo or rollback changes?",
    answer:
      "Yes. Delete mode removes objects created by this tool after verifying hydration markers, assignments, and Conditional Access disabled state.",
  },
  {
    question: "What is OpenIntuneBaseline?",
    answer: (
      <>
        OpenIntuneBaseline is an open-source policy baseline for Windows, macOS,
        BYOD, and Windows 365.{" "}
        <a
          href="https://github.com/skiptotheendpoint/OpenIntuneBaseline"
          target="_blank"
          rel="noopener noreferrer"
          className={FAQ_LINK_CLASS_NAME}
        >
          Explore OpenIntuneBaseline
        </a>
        .
      </>
    ),
  },
  {
    question: "What are the CIS Baselines in this app?",
    answer: (
      <>
        The CIS Baselines package Intune-ready templates derived from the Intune
        Baselines project.{" "}
        <a
          href="https://github.com/jorgeasaurus/IntuneBaselines"
          target="_blank"
          rel="noopener noreferrer"
          className={FAQ_LINK_CLASS_NAME}
        >
          View IntuneBaselines
        </a>
        .
      </>
    ),
  },
  {
    question: "Does this work with government or sovereign clouds?",
    answer: (
      <>
        No. The web app supports the Global (commercial) cloud only. For US
        Government (GCC High, DoD), China (21Vianet), and other sovereign
        clouds, use the IntuneHydrationKit PowerShell module.{" "}
        <a
          href="https://github.com/jorgeasaurus/IntuneHydrationKit"
          target="_blank"
          rel="noopener noreferrer"
          className={FAQ_LINK_CLASS_NAME}
        >
          View the PowerShell module on GitHub
        </a>
        .
      </>
    ),
  },
  {
    question: "What happens if an object already exists?",
    answer:
      "Create mode checks existing tenant objects by display name and skips matches, making repeated deployments idempotent.",
  },
];
