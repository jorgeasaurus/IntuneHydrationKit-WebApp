"use client";

import { useState } from "react";
import {
  addProfile,
  deleteProfile,
  getProfileStorage,
  mergeImportedProfiles,
  parseProfilesExport,
  ProfileError,
  readProfiles,
  renameProfile,
  serializeProfilesExport,
  writeProfiles,
  type ScopeProfile,
  type ScopeSelection,
  type StorageWriteResult,
} from "@/lib/profiles/scopeProfiles";

export type ProfileActionResult = { ok: true; message: string } | { ok: false; message: string };

const STORAGE_MESSAGES: Record<Extract<StorageWriteResult, { ok: false }>["reason"], string> = {
  unavailable: "This browser blocks local storage, so the app cannot save profiles. Your current selection did not change.",
  full: "Browser storage is full, so the app cannot save profiles. Delete profiles or clear site data, then try again.",
};

function errorMessage(error: unknown): string {
  return error instanceof ProfileError ? error.message : "The profile operation failed. Try again.";
}

/** Saved scope profiles in localStorage. Every action returns a message for a polite status announcement. */
export function useScopeProfiles() {
  const [storage] = useState(getProfileStorage);
  const [profiles, setProfiles] = useState<ScopeProfile[]>(() => readProfiles(storage));

  function commit(next: ScopeProfile[], message: string): ProfileActionResult {
    const result = writeProfiles(storage, next);
    if (!result.ok) return { ok: false, message: STORAGE_MESSAGES[result.reason] };
    setProfiles(next);
    return { ok: true, message };
  }

  function run(action: () => ProfileActionResult): ProfileActionResult {
    try {
      return action();
    } catch (error) {
      return { ok: false, message: errorMessage(error) };
    }
  }

  return {
    profiles,
    storageAvailable: storage !== null,
    save: (name: string, selection: ScopeSelection) =>
      run(() => commit(addProfile(profiles, name, selection), `Saved profile "${name.trim()}".`)),
    rename: (id: string, name: string) =>
      run(() => commit(renameProfile(profiles, id, name), `Renamed profile to "${name.trim()}".`)),
    remove: (id: string) =>
      run(() => {
        const profile = profiles.find((candidate) => candidate.id === id);
        return commit(deleteProfile(profiles, id), `Deleted profile "${profile?.name ?? ""}".`);
      }),
    importText: (text: string) =>
      run(() => {
        const merged = mergeImportedProfiles(profiles, parseProfilesExport(text));
        return commit(
          merged.profiles,
          `Imported ${merged.added} ${merged.added === 1 ? "profile" : "profiles"}.`,
        );
      }),
    exportJson: () => serializeProfilesExport(profiles),
  };
}
