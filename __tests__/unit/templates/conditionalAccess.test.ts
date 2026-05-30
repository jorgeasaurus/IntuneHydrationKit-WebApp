import { describe, expect, it } from "vitest";

import {
  getConditionalAccessPolicies,
  getConditionalAccessPolicyByName,
} from "@/templates/conditionalAccess";

describe("conditional access template offering", () => {
  it("excludes the tenant-gated AccountRecovery private preview policy", () => {
    const policies = getConditionalAccessPolicies();

    expect(policies).toHaveLength(20);
    expect(
      getConditionalAccessPolicyByName(
        "Secure account recovery with identity verification (Preview)"
      )
    ).toBeUndefined();
    expect(policies.map((policy) => policy.displayName)).not.toContain(
      "Secure account recovery with identity verification (Preview)"
    );
  });
});
