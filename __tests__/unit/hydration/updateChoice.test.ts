import { describe, expect, it } from "vitest";
import type { ConflictReport } from "@/lib/hydration/conflicts";
import {
  INITIAL_EXISTING_OBJECTS_STATE,
  getConflictCheckScope,
  getUpdateExisting,
  isStartBlockedByUpdateChoice,
  type ExistingObjectsState,
} from "@/lib/hydration/updateChoice";
import type { WizardState } from "@/types/hydration";

const state: WizardState = {
  currentStep: 4,
  isPreview: false,
  operationMode: "create",
  selectedTargets: ["groups"],
  selectedCISCategories: [],
  confirmed: false,
  tenantConfig: { tenantId: "tenant-a", homeAccountId: "home-a", cloudEnvironment: "global" },
};

const report: ConflictReport = {
  checked: 1,
  unchecked: [],
  conflicts: [
    {
      taskId: "t1", category: "groups", itemName: "Group", existingId: "g1", existingName: "Group", marker: "present",
      comparison: { status: "differs", reason: "", differences: [{ path: "membershipRule" }] },
    },
  ],
};

function confirmed(scopeState: WizardState): ExistingObjectsState {
  return { report, reportScope: getConflictCheckScope(scopeState), choice: { mode: "update", confirmedCount: 1 } };
}

describe("update choice", () => {
  it("defaults to skip and never updates", () => {
    expect(INITIAL_EXISTING_OBJECTS_STATE.choice.mode).toBe("skip");
    expect(getUpdateExisting(state, INITIAL_EXISTING_OBJECTS_STATE)).toBe(false);
    expect(isStartBlockedByUpdateChoice(state, INITIAL_EXISTING_OBJECTS_STATE)).toBe(false);
  });

  it("updates in a live run only with a confirmation of the current count", () => {
    expect(getUpdateExisting(state, confirmed(state))).toBe(true);
    const wrongCount = { ...confirmed(state), choice: { mode: "update" as const, confirmedCount: 2 } };
    expect(getUpdateExisting(state, wrongCount)).toBe(false);
    expect(isStartBlockedByUpdateChoice(state, wrongCount)).toBe(true);
  });

  it("does not apply a confirmation made for another tenant or selection", () => {
    const other = { ...state, tenantConfig: { ...state.tenantConfig!, tenantId: "tenant-b" } };
    expect(getUpdateExisting(other, confirmed(state))).toBe(false);
    expect(isStartBlockedByUpdateChoice(other, confirmed(state))).toBe(true);
    const moreTargets = { ...state, selectedTargets: ["groups", "filters"] as WizardState["selectedTargets"] };
    expect(getUpdateExisting(moreTargets, confirmed(state))).toBe(false);
  });

  it("never updates in a delete run", () => {
    expect(getUpdateExisting({ ...state, operationMode: "delete" }, confirmed(state))).toBe(false);
  });

  it("allows the update choice in preview without a confirmation (GET requests only)", () => {
    const preview = { ...state, isPreview: true };
    expect(getUpdateExisting(preview, { ...INITIAL_EXISTING_OBJECTS_STATE, choice: { mode: "update", confirmedCount: null } })).toBe(true);
  });
});
