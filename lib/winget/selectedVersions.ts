import { getWin32AppTemplateByName } from "@/templates/win32Apps";

/**
 * The pinned WinGet versions of the selected Win32 apps, sorted by template ID, or undefined
 * when no selected app has a pinned version. A version of an app that is not selected is removed.
 *
 * @param selectedAppNames Display names of the selected Win32 apps.
 * @param versions Pinned versions by Win32 app template ID.
 */
export function getSelectedWinGetVersions(
  selectedAppNames: Iterable<string>,
  versions: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!versions) return undefined;
  const selectedIds = new Set<string>();
  for (const name of selectedAppNames) {
    const template = getWin32AppTemplateByName(name);
    if (template?.winget) selectedIds.add(template.id);
  }
  const kept = Object.keys(versions)
    .filter((id) => selectedIds.has(id))
    .sort()
    .map((id) => [id, versions[id]] as const);
  return kept.length > 0 ? Object.fromEntries(kept) : undefined;
}
