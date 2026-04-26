import { beforeEach, describe, expect, it, vi } from "vitest";

import { policyRequiresPremiumP2 } from "@/lib/graph/conditionalAccessP2";

describe("policyRequiresPremiumP2", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("returns false for missing or empty risk conditions", () => {
    expect(policyRequiresPremiumP2({})).toBe(false);
    expect(
      policyRequiresPremiumP2({
        conditions: {
          signInRiskLevels: [],
          userRiskLevels: [],
          insiderRiskLevels: "null",
          agentIdRiskLevels: "",
          servicePrincipalRiskLevels: [],
        },
      })
    ).toBe(false);
    expect(
      policyRequiresPremiumP2({
        conditions: {
          insiderRiskLevels: "   ",
          agentIdRiskLevels: null,
          servicePrincipalRiskLevels: "   ",
        },
      })
    ).toBe(false);
  });

  it("detects sign-in risk conditions", () => {
    expect(
      policyRequiresPremiumP2({
        conditions: {
          signInRiskLevels: ["high"],
        },
      })
    ).toBe(true);
  });

  it("detects user and insider risk conditions", () => {
    expect(
      policyRequiresPremiumP2({
        conditions: {
          userRiskLevels: ["medium"],
        },
      })
    ).toBe(true);

    expect(
      policyRequiresPremiumP2({
        conditions: {
          insiderRiskLevels: "moderate",
        },
      })
    ).toBe(true);
  });

  it("detects agent identity risk conditions in array and string formats", () => {
    expect(
      policyRequiresPremiumP2({
        conditions: {
          agentIdRiskLevels: ["high"],
        },
      })
    ).toBe(true);

    expect(
      policyRequiresPremiumP2({
        conditions: {
          agentIdRiskLevels: "medium",
        },
      })
    ).toBe(true);
  });

  it("detects service principal risk conditions in array and string formats", () => {
    expect(
      policyRequiresPremiumP2({
        conditions: {
          servicePrincipalRiskLevels: ["high"],
        },
      })
    ).toBe(true);

    expect(
      policyRequiresPremiumP2({
        conditions: {
          servicePrincipalRiskLevels: "medium",
        },
      })
    ).toBe(true);
  });
});
