/**
 * The conflict choice of the review step for a create run: skip existing objects (default)
 * or update existing kit objects. The choice is local to the review step and never part
 * of a saved selection.
 */

import type { WizardState } from "@/types/hydration";
import type { ConflictReport } from "./conflicts";
import { countUpdatableConflicts } from "./updateResolver";

export interface UpdateChoice {
  mode: "skip" | "update";
  /** Number of objects that the user confirmed for update, or null when not confirmed. */
  confirmedCount: number | null;
}

export interface ExistingObjectsState {
  report: ConflictReport | null;
  /** Tenant, account, and selection that the report was made for. */
  reportScope: string | null;
  choice: UpdateChoice;
}

export const INITIAL_EXISTING_OBJECTS_STATE: ExistingObjectsState = {
  report: null,
  reportScope: null,
  choice: { mode: "skip", confirmedCount: null },
};

/** Tenant, account, and selection of a conflict check. A report for another scope does not apply. */
export function getConflictCheckScope(state: WizardState): string {
  return JSON.stringify([
    state.tenantConfig?.tenantId,
    state.tenantConfig?.homeAccountId,
    state.selectedTargets,
    state.selectedCISCategories,
    state.baselineSelection,
    state.categorySelections,
  ]);
}

/** The conflict report when it was made for the current scope, otherwise null. */
export function getCurrentReport(state: WizardState, existing: ExistingObjectsState): ConflictReport | null {
  return existing.reportScope === getConflictCheckScope(state) ? existing.report : null;
}

/**
 * Whether the run updates existing objects. A live run needs a confirmation of the count of
 * the current check. A preview sends GET requests only, so it needs no confirmation.
 */
export function isUpdateApproved(choice: UpdateChoice, report: ConflictReport | null, isPreview: boolean): boolean {
  if (choice.mode !== "update") return false;
  if (isPreview) return true;
  return report !== null && choice.confirmedCount === countUpdatableConflicts(report);
}

/** Update existing objects only for a create run with an approved update choice. */
export function getUpdateExisting(state: WizardState, existing: ExistingObjectsState): boolean {
  return (
    state.operationMode === "create" &&
    isUpdateApproved(existing.choice, getCurrentReport(state, existing), state.isPreview)
  );
}

/** An update choice without its confirmation blocks the start. */
export function isStartBlockedByUpdateChoice(state: WizardState, existing: ExistingObjectsState): boolean {
  return state.operationMode === "create" && existing.choice.mode === "update" && !getUpdateExisting(state, existing);
}
