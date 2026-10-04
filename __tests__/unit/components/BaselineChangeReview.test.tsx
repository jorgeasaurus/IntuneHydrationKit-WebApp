import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BaselineChangeReview } from "@/components/wizard/BaselineChangeReview";
import type { TenantConfig } from "@/types/hydration";

const { readChanges, createClient } = vi.hoisted(() => ({ readChanges: vi.fn(), createClient: vi.fn(() => ({})) }));
vi.mock("@/lib/hydration/baselineChangeReview", () => ({ readBaselineChanges: readChanges }));
vi.mock("@/lib/graph/client", () => ({ createGraphClient: createClient }));
const tenant: TenantConfig = { tenantId: "tenant-a", homeAccountId: "account-a", cloudEnvironment: "global" };
const item = { path: "policy", name: "Tenant A Policy", status: "new", olderVersions: [] };

describe("BaselineChangeReview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not read the tenant until requested and binds the active tenant/account", async () => {
    readChanges.mockResolvedValue([item]);
    render(<BaselineChangeReview tenantConfig={tenant} />);
    expect(readChanges).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Check baseline changes" }));
    await screen.findByText("Tenant A Policy");
    expect(createClient).toHaveBeenCalledWith({ tenantId: "tenant-a", homeAccountId: "account-a" });
    expect(screen.getByText(/1 new; 0 existing/)).toBeInTheDocument();
  });

  it("discards a read that completes after the tenant changes", async () => {
    let resolve!: (items: typeof item[]) => void;
    readChanges.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const view = render(<BaselineChangeReview tenantConfig={tenant} />);
    fireEvent.click(screen.getByRole("button", { name: "Check baseline changes" }));
    view.rerender(<BaselineChangeReview tenantConfig={{ ...tenant, tenantId: "tenant-b", homeAccountId: "account-b" }} />);
    await act(async () => resolve([item]));
    expect(screen.queryByText("Tenant A Policy")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check baseline changes" })).toBeEnabled();
  });

  it("clears completed results when selected policies change", async () => {
    readChanges.mockResolvedValue([item]);
    const view = render(<BaselineChangeReview tenantConfig={tenant} />);
    fireEvent.click(screen.getByRole("button", { name: "Check baseline changes" }));
    await screen.findByText("Tenant A Policy");
    view.rerender(<BaselineChangeReview tenantConfig={tenant} selection={{ platforms: [], selectedPolicies: ["other"], excludedPolicies: [] }} />);
    await waitFor(() => expect(screen.queryByText("Tenant A Policy")).not.toBeInTheDocument());
  });

  it("shows a failed read without a false new-policy count", async () => {
    readChanges.mockRejectedValue(new Error("forbidden"));
    render(<BaselineChangeReview tenantConfig={tenant} />);
    fireEvent.click(screen.getByRole("button", { name: "Check baseline changes" }));
    await screen.findByText("Check incomplete");
    expect(screen.queryByText(/0 new/)).not.toBeInTheDocument();
  });
});
