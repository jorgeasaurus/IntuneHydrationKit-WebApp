"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { ConflictReport } from "@/lib/hydration/conflicts";
import type { UpdateChoice } from "@/lib/hydration/updateChoice";
import { countUpdatableConflicts } from "@/lib/hydration/updateResolver";

interface UpdateExistingChoiceProps {
  choice: UpdateChoice;
  onChoiceChange: (choice: UpdateChoice) => void;
  report: ConflictReport | null;
  isPreview: boolean;
}

/**
 * The conflict choice of a create run. The default is "skip". "update" applies to a live run
 * only when the user also confirms the number of objects that the existing-objects check found.
 */
export function UpdateExistingChoice({ choice, onChoiceChange, report, isPreview }: UpdateExistingChoiceProps): React.JSX.Element {
  const count = report ? countUpdatableConflicts(report) : null;
  const confirmed = count !== null && choice.confirmedCount === count;
  return (
    <section
      aria-label="Existing objects choice"
      className="space-y-4 rounded-2xl border border-white/15 bg-slate-950/70 p-5 text-slate-100"
    >
      <h3 className="font-semibold">When an object already exists</h3>
      <RadioGroup
        value={choice.mode}
        onValueChange={(mode) => onChoiceChange({ mode: mode === "update" ? "update" : "skip", confirmedCount: null })}
        aria-label="When an object already exists"
      >
        <div className="flex items-start gap-3">
          <RadioGroupItem value="skip" id="existing-skip" />
          <Label htmlFor="existing-skip" className="cursor-pointer">
            Skip existing (default)
          </Label>
        </div>
        <div className="flex items-start gap-3">
          <RadioGroupItem value="update" id="existing-update" />
          <Label htmlFor="existing-update" className="cursor-pointer">
            Update existing kit objects to match the template
          </Label>
        </div>
      </RadioGroup>
      {choice.mode === "update" && (
        <div className="space-y-3 text-sm text-slate-300">
          <p>
            Only dynamic and static groups (membership rule) and device filters (rule) can be updated. Other types are
            skipped. An object without the kit marker is never updated. Each object is read again and checked right
            before the update. Names, descriptions, assignments, and scope tags are not changed.
          </p>
          {count === null ? (
            <p role="status">Run the existing-objects check to count the objects that would be updated.</p>
          ) : isPreview ? (
            <p role="status">The preview shows the {count} object(s) that would be updated. Nothing is changed.</p>
          ) : (
            <div className="flex items-start gap-3 rounded-xl border border-amber-300/30 bg-amber-300/5 p-4">
              <Checkbox
                id="confirm-update"
                checked={confirmed}
                onCheckedChange={(checked) => onChoiceChange({ mode: "update", confirmedCount: checked === true ? count : null })}
              />
              <Label htmlFor="confirm-update" className="cursor-pointer font-medium text-slate-100">
                I confirm the update of {count} existing kit object(s) to match the template
              </Label>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
