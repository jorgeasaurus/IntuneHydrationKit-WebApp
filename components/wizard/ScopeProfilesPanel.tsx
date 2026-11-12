"use client";

import { useRef, useState } from "react";
import { BookmarkPlus, Download, Upload } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { DroppedProfileItems } from "@/components/wizard/DroppedProfileItems";
import { ScopeProfileList } from "@/components/wizard/ScopeProfileList";
import { ScopeProfileNameDialog } from "@/components/wizard/ScopeProfileNameDialog";
import type { TargetSelectionViewModel } from "@/components/wizard/targetSelectionTypes";
import { useScopeProfiles } from "@/hooks/useScopeProfiles";
import { downloadReport } from "@/lib/hydration/reporter";
import {
  ProfileError,
  validateProfileFile,
  type DroppedProfileItem,
  type ScopeProfile,
} from "@/lib/profiles/scopeProfiles";
import { formatFileTimestamp } from "@/lib/utils/dateFormat";

type NameDialogState = { mode: "save" } | { mode: "rename"; profile: ScopeProfile } | null;

function plural(count: number, word: string): string {
  return `${count} ${count === 1 ? word : `${word}s`}`;
}

function messageFor(error: unknown, fallback: string): string {
  return error instanceof ProfileError ? error.message : fallback;
}

/**
 * Save, apply, rename, delete, export, and import scope profiles in the target selection step.
 * A profile changes the selection on this step only. The user must still review and confirm.
 */
export function ScopeProfilesPanel({ model }: { model: TargetSelectionViewModel }): React.JSX.Element {
  const store = useScopeProfiles();
  const [status, setStatus] = useState("");
  const [nameDialog, setNameDialog] = useState<NameDialogState>(null);
  const [deleteTarget, setDeleteTarget] = useState<ScopeProfile | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [applied, setApplied] = useState<{ name: string; dropped: DroppedProfileItem[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const busy = applyingId !== null;

  async function handleApply(profile: ScopeProfile): Promise<void> {
    setApplyingId(profile.id);
    setApplied(null);
    setStatus(`Applying profile "${profile.name}"…`);
    try {
      const dropped = await model.profiles.applySelection(profile.selection);
      setApplied({ name: profile.name, dropped });
      setStatus(dropped.length === 0
        ? `Applied profile "${profile.name}". Review the selection, then continue.`
        : `Applied profile "${profile.name}" with ${plural(dropped.length, "item")} not applied. See the list below.`);
    } catch (error) {
      setStatus(messageFor(error, `The app cannot apply profile "${profile.name}". Try again.`));
    } finally {
      setApplyingId(null);
    }
  }

  function handleExport(): void {
    try {
      downloadReport(store.exportJson(), `intune-hydration-scope-profiles-${formatFileTimestamp(new Date())}.json`);
      setStatus(`Exported ${plural(store.profiles.length, "profile")}.`);
    } catch {
      setStatus("The app cannot export the profiles. Try again.");
    }
  }

  async function handleImportFile(file: File | undefined): Promise<void> {
    if (!file) return;
    try {
      validateProfileFile(file);
      setStatus(store.importText(await file.text()).message);
    } catch (error) {
      setStatus(messageFor(error, "The app cannot read this file."));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function submitName(name: string) {
    const result = nameDialog?.mode === "rename"
      ? store.rename(nameDialog.profile.id, name)
      : store.save(name, model.profiles.getCurrentSelection());
    // A failed save keeps the dialog open and shows the message there.
    if (result.ok) setStatus(result.message);
    return result;
  }

  return (
    <section
      aria-labelledby="scope-profiles-heading"
      className="target-selection-console glass-surface space-y-4 rounded-2xl p-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 id="scope-profiles-heading" className="text-sm font-semibold text-white">
            Scope profiles
          </h3>
          <p className="mt-1 text-sm text-slate-200">
            Save this selection and use it again for other tenants. A profile keeps the selection only. It does
            not keep tenant data, and it does not start a run.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:flex sm:shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setNameDialog({ mode: "save" })}
            disabled={!model.profiles.canSave || !store.storageAvailable || busy}
          >
            <BookmarkPlus aria-hidden="true" />
            Save selection as profile
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={!store.storageAvailable || busy}
          >
            <Upload aria-hidden="true" />
            Import
          </Button>
          <Button size="sm" variant="outline" onClick={handleExport} disabled={store.profiles.length === 0 || busy}>
            <Download aria-hidden="true" />
            Export all
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            tabIndex={-1}
            aria-label="Import scope profile file"
            onChange={(event) => void handleImportFile(event.target.files?.[0])}
          />
        </div>
      </div>

      {!store.storageAvailable && (
        <p className="text-sm text-amber-100">
          This browser blocks local storage, so the app cannot save or import profiles.
        </p>
      )}

      <ScopeProfileList
        profiles={store.profiles}
        applyingId={applyingId}
        canEdit={store.storageAvailable}
        onApply={(profile) => void handleApply(profile)}
        onRename={(profile) => setNameDialog({ mode: "rename", profile })}
        onDelete={setDeleteTarget}
      />

      {applied && applied.dropped.length > 0 && (
        <DroppedProfileItems profileName={applied.name} dropped={applied.dropped} />
      )}

      <p role="status" aria-live="polite" aria-atomic="true" className="text-sm text-slate-200">
        {status}
      </p>

      {nameDialog && (
        <ScopeProfileNameDialog
          key={nameDialog.mode === "rename" ? `rename-${nameDialog.profile.id}` : "save"}
          open
          onOpenChange={(open) => !open && setNameDialog(null)}
          title={nameDialog.mode === "save" ? "Save selection as profile" : "Rename profile"}
          description={nameDialog.mode === "save"
            ? "The profile keeps the selected categories and items. It does not keep tenant data."
            : "Enter a new name for this profile."}
          submitLabel={nameDialog.mode === "save" ? "Save profile" : "Rename"}
          initialName={nameDialog.mode === "rename" ? nameDialog.profile.name : ""}
          onSubmit={submitName}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete profile?"
        description={`The app deletes profile "${deleteTarget?.name ?? ""}" from this browser. You cannot undo this.`}
        confirmLabel="Delete profile"
        onConfirm={() => {
          if (deleteTarget) setStatus(store.remove(deleteTarget.id).message);
        }}
      />
    </section>
  );
}
