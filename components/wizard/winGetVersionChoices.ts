import { useEffect, useState } from "react";
import {
  fetchWinGetVersionCatalog,
  findWinGetCatalogApp,
  getPinnableVersions,
  type WinGetVersionCatalog,
} from "@/lib/winget/versionCatalog";
import type { Win32AppTemplate } from "@/templates/win32Apps";

/** One-line explanation of "Best effort", for every place where a version is chosen or reviewed. */
export const BEST_EFFORT_NOTE =
  "Best effort: an older version. The vendor can remove or replace its download at any time. If this occurs, the install fails.";

/** One-line explanation of the detection rule of a pinned version. */
export const PINNED_DETECTION_NOTE =
  "A pinned app shows as installed when the device has that version or a newer one, so an app that updates itself is not reported as failed.";

export const EXISTING_WINGET_APP_NOTE =
  "Create skips an app that already exists. To change the version of an existing app, delete it and create it again.";

/** Option value of "Latest" (no pinned version). */
export const LATEST_VALUE = "";

export interface WinGetCatalogState {
  catalog: WinGetVersionCatalog | null;
  /** Message when the catalog did not load. Only "Latest" can be selected then. */
  error: string | null;
}

/** Load the WinGet version catalog once while `enabled` is true. */
export function useWinGetVersionCatalog(enabled: boolean): WinGetCatalogState {
  const [state, setState] = useState<WinGetCatalogState>({ catalog: null, error: null });
  const loaded = state.catalog !== null || state.error !== null;

  useEffect(() => {
    if (!enabled || loaded) return;
    let active = true;
    fetchWinGetVersionCatalog().then(
      (catalog) => {
        if (active) setState({ catalog, error: null });
      },
      (error: unknown) => {
        if (active) setState({ catalog: null, error: error instanceof Error ? error.message : String(error) });
      },
    );
    return () => {
      active = false;
    };
  }, [enabled, loaded]);

  return state;
}

interface VersionOption {
  value: string;
  label: string;
}

/** The options of the picker: Latest, then the versions that the kit can pin, newest first. */
export function getWinGetVersionOptions(
  template: Win32AppTemplate,
  catalog: WinGetVersionCatalog | null,
  current: string | undefined,
): VersionOption[] {
  const app = catalog ? findWinGetCatalogApp(catalog, template.packageIdentifier) : undefined;
  const options: VersionOption[] = [{ value: LATEST_VALUE, label: "Latest" }];
  for (const version of app ? getPinnableVersions(app) : []) {
    options.push({
      value: version.version,
      label: version.bestEffort ? `${version.version} (Best effort)` : version.version,
    });
  }
  // A pinned version that is not (or not yet) in the list stays visible, so the choice is never hidden.
  if (current !== undefined && !options.some((option) => option.value === current)) {
    options.push({
      value: current,
      label: catalog ? `${current} (not in the catalog: the app will fail)` : current,
    });
  }
  return options;
}
