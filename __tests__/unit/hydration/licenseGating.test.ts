import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { executeTasksInBatches } from "@/lib/hydration/batchExecutor";
import { executeTasks } from "@/lib/hydration/engine";
import type { ExecutionContext } from "@/lib/hydration/types";
import { getLicenseSkipReason } from "@/lib/hydration/utils";
import { cacheTemplates, clearCategoryCache, type BaselinePolicy } from "@/lib/templates/loader";
import type { HydrationTask, TaskCategory } from "@/types/hydration";

const RISK_POLICY = "[IHD] Block high sign-in risk";
const MFA_POLICY = "[IHD] Require MFA";
const DRIVER_PROFILE = "[IHD] Win - OIB - WUfB Drivers - Default";

const driverTemplate = {
  displayName: DRIVER_PROFILE,
  _oibPolicyType: "DriverUpdateProfiles",
  "@odata.type": "#microsoft.graph.windowsDriverUpdateProfile",
  approvalType: "manual",
} as unknown as BaselinePolicy;

function createTask(category: TaskCategory, itemName: string, operation: HydrationTask["operation"] = "create"): HydrationTask {
  return { id: `${category}-${itemName}`, category, operation, itemName, status: "pending" };
}

function createContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    client: {
      get: vi.fn().mockResolvedValue({ value: [] }),
      getCollection: vi.fn().mockResolvedValue([]),
      post: vi.fn(),
      delete: vi.fn(),
      batch: vi.fn().mockResolvedValue({ responses: [] }),
      findCreatedObjects: vi.fn().mockResolvedValue([]),
    } as unknown as ExecutionContext["client"],
    operationMode: "create",
    isPreview: false,
    stopOnFirstError: false,
    hasConditionalAccessLicense: true,
    hasPremiumP2License: false,
    hasWindowsDriverUpdateLicense: false,
    cachedConditionalAccessPolicies: [],
    cachedDriverUpdateProfiles: [],
    cachedBaselineTemplates: [driverTemplate],
    ...overrides,
  };
}

describe("license gating before dispatch", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    cacheTemplates("conditionalAccess", [
      { displayName: RISK_POLICY, state: "disabled", conditions: { signInRiskLevels: ["high"] }, grantControls: { operator: "OR", builtInControls: ["block"] } },
      { displayName: MFA_POLICY, state: "disabled", conditions: {}, grantControls: { operator: "OR", builtInControls: ["mfa"] } },
    ]);
  });

  afterEach(() => {
    clearCategoryCache("conditionalAccess");
    vi.restoreAllMocks();
  });

  it("gives one skip reason for both paths", () => {
    const context = createContext();
    expect(getLicenseSkipReason(createTask("conditionalAccess", RISK_POLICY), context)).toBe("Requires Premium P2 license");
    expect(getLicenseSkipReason(createTask("conditionalAccess", MFA_POLICY), context)).toBeUndefined();
    expect(getLicenseSkipReason(createTask("baseline", DRIVER_PROFILE), context)).toMatch(/No Windows Driver Update license/);
    expect(
      getLicenseSkipReason(createTask("conditionalAccess", MFA_POLICY), createContext({ hasConditionalAccessLicense: false }))
    ).toBe("No Entra ID Premium (P1) license");
    // Delete is not gated: existing kit objects can be removed after a license change.
    expect(getLicenseSkipReason(createTask("baseline", DRIVER_PROFILE, "delete"), context)).toBeUndefined();
    expect(getLicenseSkipReason(createTask("conditionalAccess", RISK_POLICY, "delete"), context)).toBeUndefined();
  });

  it("skips a risk-based Conditional Access policy on the batch path without Premium P2", async () => {
    const context = createContext();
    const task = createTask("conditionalAccess", RISK_POLICY);

    const results = await executeTasksInBatches([task], context);

    expect(results).toEqual([
      expect.objectContaining({ skipped: true, skipKind: "blocked", error: "Requires Premium P2 license" }),
    ]);
    expect(context.client.batch).not.toHaveBeenCalled();
  });

  it("skips a driver update profile on the batch path without the Windows license", async () => {
    const context = createContext();
    const task = createTask("baseline", DRIVER_PROFILE);

    const results = await executeTasksInBatches([task], context);

    expect(results).toEqual([
      expect.objectContaining({ skipped: true, skipKind: "blocked", error: expect.stringMatching(/No Windows Driver Update license/) }),
    ]);
    expect(context.client.batch).not.toHaveBeenCalled();
  });

  it("skips a risk-based Conditional Access policy on the sequential path without Premium P2", async () => {
    const context = createContext({ stopOnFirstError: true });
    const task = createTask("conditionalAccess", RISK_POLICY);

    const results = await executeTasks([task], context);

    expect(results).toEqual([
      expect.objectContaining({ skipped: true, skipKind: "blocked", error: "Requires Premium P2 license" }),
    ]);
    expect(context.client.post).not.toHaveBeenCalled();
    expect(task.status).toBe("skipped");
  });
});
