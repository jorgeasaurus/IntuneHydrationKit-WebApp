import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictSummary } from "@/components/wizard/ConflictSummary";
import type { ConflictReport } from "@/lib/hydration/conflicts";
import type { TenantConfig } from "@/types/hydration";

const { runCheck, createClient } = vi.hoisted(() => ({ runCheck: vi.fn(), createClient: vi.fn(() => ({})) }));
vi.mock("@/lib/hydration/drift/scan", () => ({ runConflictCheck: runCheck }));
vi.mock("@/lib/graph/client", () => ({ createGraphClient: createClient }));

const tenant: TenantConfig = { tenantId: "tenant-a", homeAccountId: "account-a", cloudEnvironment: "global" };
const selection = { selectedTargets: ["groups", "filters"] as const };

const report: ConflictReport = {
  checked: 3,
  conflicts: [
    {
      taskId: "t1",
      category: "groups",
      itemName: "[IHD] Windows Devices",
      existingId: "g-1",
      existingName: "[IHD] Windows Devices",
      marker: "present",
      comparison: {
        status: "differs",
        reason: "1 template-owned setting(s) differ from the template.",
        differences: [{ path: "membershipRule", template: '"a"', tenant: '"b"' }],
      },
    },
  ],
  unchecked: [{ category: "filters", itemName: "[IHD] Filter", reason: "Could not read the existing device filters from the tenant." }],
};

describe("ConflictSummary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads the tenant only on request and shows conflicts by category with marker and comparison", async () => {
    runCheck.mockResolvedValue(report);
    const onReportChange = vi.fn();
    render(<ConflictSummary tenantConfig={tenant} selection={{ ...selection, selectedTargets: [...selection.selectedTargets] }} onReportChange={onReportChange} />);
    expect(runCheck).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Check existing objects" }));
    await screen.findByText(/1 of 3 checked templates already exist/);

    expect(createClient).toHaveBeenCalledWith({ tenantId: "tenant-a", homeAccountId: "account-a" });
    expect(screen.getByText("Dynamic Groups (1)")).toBeInTheDocument();
    expect(screen.getByText("Kit marker")).toBeInTheDocument();
    expect(screen.getByText("Differs")).toBeInTheDocument();
    expect(screen.getByText("membershipRule")).toBeInTheDocument();
    expect(screen.getByText(/Device Filters \(1\): Could not read the existing device filters/)).toBeInTheDocument();
    expect(onReportChange).toHaveBeenLastCalledWith(report);
  });

  it("does not report no conflicts when the check fails", async () => {
    runCheck.mockRejectedValue(new Error("forbidden"));
    render(<ConflictSummary tenantConfig={tenant} selection={{ selectedTargets: ["groups"] }} />);
    fireEvent.click(screen.getByRole("button", { name: "Check existing objects" }));
    await screen.findByText("Check incomplete");
    expect(screen.queryByText(/No selected template exists/)).not.toBeInTheDocument();
  });
});
