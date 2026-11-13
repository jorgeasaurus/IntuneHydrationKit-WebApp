"use client";

import { Pencil, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ScopeProfile } from "@/lib/profiles/scopeProfiles";
import { formatDateTime } from "@/lib/utils/dateFormat";

interface ScopeProfileListProps {
  profiles: ScopeProfile[];
  applyingId: string | null;
  canEdit: boolean;
  onApply: (profile: ScopeProfile) => void;
  onRename: (profile: ScopeProfile) => void;
  onDelete: (profile: ScopeProfile) => void;
}

function countItems(profile: ScopeProfile): number {
  return Object.values(profile.selection.items).reduce((sum, items) => sum + items.length, 0);
}

/** Saved profiles with apply, rename, and delete actions. */
export function ScopeProfileList({
  profiles,
  applyingId,
  canEdit,
  onApply,
  onRename,
  onDelete,
}: ScopeProfileListProps): React.JSX.Element {
  if (profiles.length === 0) {
    return <p className="text-sm text-slate-300">No saved profiles yet.</p>;
  }

  const busy = applyingId !== null;

  return (
    <ul aria-label="Saved scope profiles" className="divide-y divide-white/10 rounded-xl border border-white/10">
      {profiles.map((profile) => (
        <li key={profile.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="break-words font-medium text-white">{profile.name}</p>
            <p className="text-xs text-slate-300">
              {profile.selection.targets.length}{" "}
              {profile.selection.targets.length === 1 ? "category" : "categories"}, {countItems(profile)} items.
              Updated {formatDateTime(new Date(profile.updatedAt))}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => onApply(profile)}
              disabled={busy}
              aria-label={`Apply profile ${profile.name}`}
            >
              <Play aria-hidden="true" />
              {applyingId === profile.id ? "Applying…" : "Apply"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onRename(profile)}
              disabled={busy || !canEdit}
              aria-label={`Rename profile ${profile.name}`}
            >
              <Pencil aria-hidden="true" />
              Rename
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onDelete(profile)}
              disabled={busy || !canEdit}
              aria-label={`Delete profile ${profile.name}`}
            >
              <Trash2 aria-hidden="true" />
              Delete
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
