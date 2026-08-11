import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
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

export const HERO_STATS = [
  { value: "927", label: "deployable objects" },
  { value: "4", label: "guided stages" },
  { value: "3", label: "operation modes" },
  { value: "0", label: "enabled CA by default" },
] as const;

export const MOBILE_RUN_STEPS = [
  { label: "Scope", value: "927 objects" },
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
      "The web app targets Global commercial tenants while the PowerShell module covers GCC High, DoD, Germany, and China.",
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

export const CONFIGURATION_GROUPS: readonly ConfigurationGroup[] = [
  {
    icon: Layers,
    title: "Configuration Profiles",
    label: "Primary",
    total: 805,
    unit: "profiles",
    items: [
      { value: 798, label: "Settings Catalog policies" },
      { value: 3, label: "Driver Update profiles" },
      { value: 3, label: "Update Rings" },
      { value: "CIS + OIB", label: "baseline sources" },
    ],
  },
  {
    icon: Shield,
    title: "Security Policies",
    label: "Control",
    total: 46,
    unit: "policies",
    items: [
      { value: 20, label: "Conditional Access" },
      { value: 16, label: "Compliance" },
      { value: 10, label: "App Protection" },
    ],
  },
  {
    icon: Users,
    title: "Groups & Targeting",
    label: "Target",
    total: 74,
    unit: "objects",
    items: [
      { value: 47, label: "Device groups" },
      { value: 24, label: "Assignment filters" },
      { value: 3, label: "Enrollment profiles" },
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
    question: "Does this work with government cloud environments?",
    answer:
      "Not in the web app yet. Use the IntuneHydrationKit PowerShell module for GCC High, DoD, Germany, and China.",
  },
  {
    question: "What happens if an object already exists?",
    answer:
      "Create mode checks existing tenant objects by display name and skips matches, making repeated deployments idempotent.",
  },
];
