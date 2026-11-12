import { beforeEach, describe, expect, it } from "vitest";

import { readExecutionRecord, writeExecutionRecord, type ExecutionRecord } from "@/lib/hydration/executionRecord";
import { getLiveRunScope } from "@/lib/hydration/rerun";
import { STORED_SELECTION_KEYS, getWizardRunScope, toStoredRunScope, type RunScope } from "@/lib/hydration/runScope";
import { getEstimatedTaskCount } from "@/lib/hydration/taskQueue";
import { EXECUTION_RECORD_STORAGE_KEY } from "@/lib/storageKeys";
import { TASK_CATEGORIES, type WizardState } from "@/types/hydration";

const fullScope: RunScope = {
  selectedTargets: ["groups", "notification", "baseline", "cisBaseline"],
  selectedCISCategories: ["cis-windows-11"],
  baselineSelection: { platforms: ["WINDOWS"], selectedPolicies: ["WINDOWS/a.json"], excludedPolicies: ["WINDOWS/b.json"] },
  categorySelections: {
    groups: { selectedItems: [] },
    notification: { selectedItems: ["Noncompliance notice"] },
    baseline: { platforms: ["MACOS"], selectedPolicies: ["MACOS/c.json"], excludedPolicies: [] },
    cisBaseline: { selectedItems: ["cis/windows-11/policy.json"] },
  },
};

function previewRecord(scope: unknown): ExecutionRecord {
  return {
    tenantId: "tenant-1",
    homeAccountId: "home-1",
    operationMode: "create",
    isPreview: true,
    selectedObjectCount: 1,
    tasks: [],
    activityLog: [],
    startTime: new Date("2026-08-17T01:00:00.000Z"),
    endTime: new Date("2026-08-17T01:00:02.000Z"),
    outcome: "failed",
    summary: null,
    fatalError: "Stopped",
    scope,
  } as ExecutionRecord;
}

describe("stored run scope", () => {
  beforeEach(() => sessionStorage.clear());

  it("has a schema key for every wizard category, so no selection can be dropped", () => {
    expect([...STORED_SELECTION_KEYS].sort()).toEqual([...TASK_CATEGORIES].sort());
  });

  it("keeps notification, baseline, CIS, and empty selections exactly through storage", () => {
    writeExecutionRecord(sessionStorage, previewRecord(fullScope));
    const restored = readExecutionRecord(sessionStorage)!;
    expect(restored.scope).toEqual(fullScope);
  });

  it("keeps an explicit empty selection empty, so it queues nothing", () => {
    writeExecutionRecord(sessionStorage, previewRecord(fullScope));
    const scope = readExecutionRecord(sessionStorage)!.scope!;
    expect(getEstimatedTaskCount(["groups"], scope.categorySelections)).toBe(0);
    expect(getEstimatedTaskCount(["notification"], scope.categorySelections)).toBe(1);
  });

  it("keeps the notification selection of the wizard", () => {
    const state = {
      currentStep: 4,
      confirmed: true,
      isPreview: true,
      selectedTargets: ["notification"],
      selectedCISCategories: [],
      categorySelections: { notification: { selectedItems: ["Noncompliance notice"] } },
    } satisfies WizardState;
    expect(getWizardRunScope(state)?.categorySelections).toEqual({ notification: { selectedItems: ["Noncompliance notice"] } });
  });

  it("fails closed for a scope that it cannot keep exactly", () => {
    const widened = { ...fullScope, categorySelections: { ...fullScope.categorySelections, futureCategory: { selectedItems: ["x"] } } };
    expect(toStoredRunScope(widened as RunScope)).toBeUndefined();
    expect(toStoredRunScope({ ...fullScope, categorySelections: { groups: { selectedItems: ["a"], extra: true } } } as unknown as RunScope)).toBeUndefined();
  });

  it("loads a record whose stored scope cannot be read, without the scope, so run-for-real is not offered", () => {
    sessionStorage.setItem(
      EXECUTION_RECORD_STORAGE_KEY,
      JSON.stringify({ ...previewRecord({ ...fullScope, categorySelections: { futureCategory: { selectedItems: [] } } }) }),
    );
    const restored = readExecutionRecord(sessionStorage)!;
    expect(restored).not.toBeNull();
    expect(restored.scope).toBeUndefined();
    expect(getLiveRunScope({ ...restored, tasks: restored.tasks })).toBeNull();
  });
});
