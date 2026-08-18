import type { TaskCategory } from "@/types/hydration";

export const TASK_CATEGORY_LABELS: Record<TaskCategory, string> = {
  groups: "Dynamic Groups",
  filters: "Device Filters",
  compliance: "Compliance Policies",
  appProtection: "App Protection",
  win32Apps: "Win32 Apps",
  conditionalAccess: "Conditional Access",
  enrollment: "Enrollment Profiles",
  notification: "Notifications",
  baseline: "OpenIntuneBaseline",
  cisBaseline: "CIS Baselines",
};

export function getTaskCategoryLabel(category: string): string {
  return TASK_CATEGORY_LABELS[category as TaskCategory] ?? category;
}
