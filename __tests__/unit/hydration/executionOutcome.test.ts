import { describe, expect, it } from "vitest";
import {
  deriveExecutionOutcome,
  isExpectedNoOpSkip,
} from "@/lib/hydration/executionOutcome";
import type { HydrationTask } from "@/types/hydration";

function successfulTask(details: { warning?: string } = {}): HydrationTask {
  return {
    id: "task-1",
    category: "groups",
    operation: "create",
    itemName: "All Windows Devices",
    status: "success",
    ...details,
  };
}

function skippedTask(
  skipKind: "noOp" | "blocked" | "cancelled",
  error: string,
): HydrationTask {
  return {
    id: "task-1",
    category: "groups",
    operation: "create",
    itemName: "All Windows Devices",
    status: "skipped",
    skipKind,
    error,
  };
}

describe("execution outcomes", () => {
  it("treats expected no-op skips as successful completion", () => {
    const skipped = skippedTask("noOp", "Already deleted");
    expect(isExpectedNoOpSkip(skipped)).toBe(true);
    expect(deriveExecutionOutcome([skipped])).toBe("succeeded");
  });

  it("reports warnings and blocked skips as issues", () => {
    expect(
      deriveExecutionOutcome(
        [successfulTask({ warning: "Review assignment" })],
      ),
    ).toBe("completedWithIssues");
    expect(
      deriveExecutionOutcome(
        [skippedTask("blocked", "License required")],
      ),
    ).toBe("completedWithIssues");
  });

  it("keeps cancellation distinct from other issues", () => {
    expect(
      deriveExecutionOutcome(
        [
          skippedTask("cancelled", "Cancelled by user"),
        ],
      ),
    ).toBe("cancelled");
  });
});
