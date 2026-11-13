import { getTargetLabel } from "@/components/wizard/useScopeProfileSelection";
import type { DroppedProfileItem } from "@/lib/profiles/scopeProfiles";

function describeDropped(entry: DroppedProfileItem): string {
  const category = getTargetLabel(entry.category);
  return entry.item === null
    ? `${category}: the full category (no selected items remain)`
    : `${category}: ${entry.item}`;
}

/** List the profile items that the current catalog does not have, so that the scope never changes silently. */
export function DroppedProfileItems({
  profileName,
  dropped,
}: {
  profileName: string;
  dropped: DroppedProfileItem[];
}): React.JSX.Element {
  return (
    <div className="rounded-xl border border-amber-300/30 bg-amber-950/30 p-3 text-sm text-amber-50">
      <p className="font-medium">
        These items in profile &quot;{profileName}&quot; are not in the current catalog. The app did not apply them:
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5" aria-label="Profile items not applied">
        {dropped.map((entry) => (
          <li key={`${entry.category}:${entry.item ?? "*"}`} className="break-words">
            {describeDropped(entry)}
          </li>
        ))}
      </ul>
    </div>
  );
}
