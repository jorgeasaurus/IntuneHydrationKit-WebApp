"use client";

import type { WinGetVersionCatalog } from "@/lib/winget/versionCatalog";
import { NOT_OFFERED_WINGET_APPS, type Win32AppTemplate } from "@/templates/win32Apps";
import {
  BEST_EFFORT_NOTE,
  EXISTING_WINGET_APP_NOTE,
  getWinGetVersionOptions,
  LATEST_VALUE,
  PINNED_DETECTION_NOTE,
} from "@/components/wizard/winGetVersionChoices";

interface WinGetVersionPickerProps {
  template: Win32AppTemplate;
  /** The pinned version, or undefined for the latest version. */
  value: string | undefined;
  onChange: (version: string | undefined) => void;
  catalog: WinGetVersionCatalog | null;
}

/** Version select of one WinGet app in the Win32 apps list (create mode). */
export function WinGetVersionPicker({ template, value, onChange, catalog }: WinGetVersionPickerProps) {
  const appName = template.winget?.displayName ?? template.displayName;
  const options = getWinGetVersionOptions(template, catalog, value);
  return (
    <select
      aria-label={`Version of ${appName}`}
      value={value ?? LATEST_VALUE}
      onChange={(event) => onChange(event.target.value === LATEST_VALUE ? undefined : event.target.value)}
      className="h-7 max-w-[13rem] shrink-0 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {options.map((option) => (
        <option key={option.value || "latest"} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** Notes under the Win32 apps list: opt-in apps, versions, and apps that are not offered. */
export function WinGetCatalogNotes({ catalogError }: { catalogError: string | null }) {
  return (
    <div className="space-y-1 text-xs text-muted-foreground" aria-live="polite">
      <p>
        WinGet catalog apps are opt-in: Select All does not select them. Select each app that you want.
      </p>
      <p>Each WinGet app installs the latest version, or a version that you select. {PINNED_DETECTION_NOTE}</p>
      <p>{BEST_EFFORT_NOTE}</p>
      <p>{EXISTING_WINGET_APP_NOTE}</p>
      {NOT_OFFERED_WINGET_APPS.length > 0 ? (
        <p>
          Not offered, because no version in the catalog has a machine-scope x64 installer:{" "}
          {NOT_OFFERED_WINGET_APPS.map((app) => app.displayName).join(", ")}.
        </p>
      ) : null}
      {catalogError ? (
        <p className="text-destructive">
          The WinGet version catalog did not load, so only the latest version can be selected. {catalogError}
        </p>
      ) : null}
    </div>
  );
}
