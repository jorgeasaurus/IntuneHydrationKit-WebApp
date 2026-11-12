import type { BaselinePolicy } from "@/lib/templates/loader";

/**
 * Find the baseline template for a task. A task with a template path resolves by file path only,
 * so a selected file never runs as a different file that shares its name. Tasks without a path
 * (for example restored older runs) fall back to the policy name.
 */
export function findBaselineTemplateForTask(
  templates: readonly BaselinePolicy[],
  task: { itemName: string; templatePath?: string }
): BaselinePolicy | undefined {
  if (task.templatePath) {
    return templates.find((template) => template._oibFilePath === task.templatePath);
  }
  return templates.find((template) => template.name === task.itemName || template.displayName === task.itemName);
}
