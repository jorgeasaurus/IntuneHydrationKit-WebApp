"use client";

import { getWin32AppTemplates } from "@/templates/win32Apps";
import {
  BEST_EFFORT_NOTE,
  EXISTING_WINGET_APP_NOTE,
  PINNED_DETECTION_NOTE,
  useWinGetVersionCatalog,
} from "@/components/wizard/winGetVersionChoices";
import { findWinGetCatalogApp } from "@/lib/winget/versionCatalog";
import type { WizardState } from "@/types/hydration";

interface PinnedApp {
  templateId: string;
  name: string;
  packageIdentifier: string;
  version: string;
}

/** The pinned WinGet apps of a create run, in template order. Delete runs do not pin versions. */
function getPinnedApps(state: WizardState): PinnedApp[] {
  if (state.operationMode !== "create" || !state.selectedTargets.includes("win32Apps")) return [];
  const selection = state.categorySelections?.win32Apps;
  const versions = selection?.wingetVersions;
  if (!selection || !versions) return [];
  const selected = new Set(selection.selectedItems);
  return getWin32AppTemplates().flatMap((template) => {
    const version = versions[template.id];
    if (version === undefined || !template.winget || !selected.has(template.displayName)) return [];
    return [{
      templateId: template.id,
      name: template.winget.displayName,
      packageIdentifier: template.packageIdentifier,
      version,
    }];
  });
}

/** The review step list of the WinGet apps with a pinned version. Nothing shows when no app is pinned. */
export function WinGetVersionsReview({ state }: { state: WizardState }): React.JSX.Element | null {
  const pinned = getPinnedApps(state);
  const { catalog } = useWinGetVersionCatalog(pinned.length > 0);
  if (pinned.length === 0) return null;

  const label = (app: PinnedApp): string | null => {
    if (!catalog) return null;
    const entry = findWinGetCatalogApp(catalog, app.packageIdentifier)?.versions.find(
      (version) => version.version === app.version,
    );
    if (!entry) return "Not in the catalog: the app will fail";
    return entry.bestEffort ? "Best effort" : null;
  };

  return (
    <section
      aria-labelledby="winget-versions-review-title"
      className="rounded-2xl border border-border/80 bg-background/60 p-5 space-y-3"
    >
      <h3 id="winget-versions-review-title" className="text-sm font-semibold">
        WinGet apps with a pinned version ({pinned.length})
      </h3>
      <ul className="space-y-1 text-sm">
        {pinned.map((app) => {
          const status = label(app);
          return (
            <li key={app.templateId} className="flex flex-wrap items-baseline gap-x-2">
              <span>{app.name}</span>
              <span className="font-mono text-xs">{app.version}</span>
              {status ? (
                <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 text-[11px] font-mono uppercase tracking-[0.18em] text-amber-100">
                  {status}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">{BEST_EFFORT_NOTE}</p>
      <p className="text-xs text-muted-foreground">{PINNED_DETECTION_NOTE}</p>
      <p className="text-xs text-muted-foreground">
        The packages of these apps are built in this browser. {EXISTING_WINGET_APP_NOTE}
      </p>
    </section>
  );
}
