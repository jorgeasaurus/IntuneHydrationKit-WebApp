import { describe, expect, it } from "vitest";

import {
  AGENT_LICENSE_SKIP_REASON,
  RETIRED_AGENT_CONDITION_SKIP_REASON,
  getConditionalAccessBlockReason,
} from "@/lib/hydration/conditionalAccessBatch";

describe("getConditionalAccessBlockReason", () => {
  it("blocks an agent policy that the tenant has no license for", () => {
    const message =
      "[400] 1267: Cannot create or update Conditional Access policies that target agents. This capability requires a Microsoft Agent 365 or Microsoft 365 E7 license.";
    expect(getConditionalAccessBlockReason({ message })).toBe(AGENT_LICENSE_SKIP_REASON);
    expect(getConditionalAccessBlockReason({ message: "Bad request", innerMessage: message })).toBe(AGENT_LICENSE_SKIP_REASON);
  });

  it("blocks a template with the retired agent users condition", () => {
    const message = "1342: Targeting 'AllAgentIdUsers' in the users condition is no longer supported.";
    expect(getConditionalAccessBlockReason({ message })).toBe(RETIRED_AGENT_CONDITION_SKIP_REASON);
  });

  it("blocks a private preview feature that the tenant is not authorized for", () => {
    const message = "1101: The tenant must be explicitly authorized to use the private preview feature: AccountRecovery.";
    expect(getConditionalAccessBlockReason({ message })).toMatch(/private preview feature: AccountRecovery/);
  });

  it("leaves other errors as failures", () => {
    expect(getConditionalAccessBlockReason({ message: "[403] Insufficient privileges to complete the operation." })).toBeNull();
    expect(getConditionalAccessBlockReason({ message: "[400] 1012670: unrelated code" })).toBeNull();
    expect(getConditionalAccessBlockReason({ message: "[400] The request is malformed." })).toBeNull();
  });
});
