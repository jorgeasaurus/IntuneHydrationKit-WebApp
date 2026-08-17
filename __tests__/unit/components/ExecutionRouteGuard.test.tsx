import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExecutionRouteGuard } from "@/components/dashboard/ExecutionRouteGuard";
import {
  beginExecution,
  forceResetExecutionSessionForTests,
  getExecutionState,
} from "@/lib/hydration/executionStateStore";

const replace = vi.fn();
const getActiveAccount = vi.fn();
let pathname = "/wizard";
let isAuthenticated = true;

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ replace }),
}));

vi.mock("@azure/msal-react", () => ({
  useIsAuthenticated: () => isAuthenticated,
  useMsal: () => ({
    accounts: getActiveAccount() ? [getActiveAccount()] : [],
    instance: { getActiveAccount },
  }),
}));

describe("ExecutionRouteGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    forceResetExecutionSessionForTests();
    pathname = "/wizard";
    isAuthenticated = true;
    getActiveAccount.mockReturnValue({
      tenantId: "tenant-1",
      homeAccountId: "account-1",
    });
  });

  it("returns active runs to the dashboard and guards page unload", async () => {
    beginExecution({
      tenantId: "tenant-1",
      homeAccountId: "account-1",
      operationMode: "create",
      isPreview: false,
      selectedObjectCount: 1,
    });

    render(
      <ExecutionRouteGuard>
        <p>Wizard content</p>
      </ExecutionRouteGuard>,
    );

    expect(screen.queryByText("Wizard content")).not.toBeInTheDocument();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
    expect(
      fireEvent(window, new Event("beforeunload", { cancelable: true })),
    ).toBe(false);
  });

  it("keeps the dashboard visible during an active run", () => {
    pathname = "/dashboard";
    beginExecution({
      tenantId: "tenant-1",
      homeAccountId: "account-1",
      operationMode: "create",
      isPreview: false,
      selectedObjectCount: 1,
    });

    render(
      <ExecutionRouteGuard>
        <p>Dashboard content</p>
      </ExecutionRouteGuard>,
    );

    expect(screen.getByText("Dashboard content")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("does not redirect after sign-out and discards the previous account run", async () => {
    beginExecution({
      tenantId: "tenant-1",
      homeAccountId: "account-1",
      operationMode: "create",
      isPreview: false,
      selectedObjectCount: 1,
    });
    isAuthenticated = false;
    getActiveAccount.mockReturnValue(null);

    render(
      <ExecutionRouteGuard>
        <p>Signed-out content</p>
      </ExecutionRouteGuard>,
    );

    expect(screen.getByText("Signed-out content")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(getExecutionState().configuration).toBeNull(),
    );
  });

  it("discards an active run after an authenticated account switch", async () => {
    beginExecution({
      tenantId: "tenant-1",
      homeAccountId: "account-1",
      operationMode: "create",
      isPreview: false,
      selectedObjectCount: 1,
    });
    getActiveAccount.mockReturnValue({
      tenantId: "tenant-2",
      homeAccountId: "account-2",
    });

    render(
      <ExecutionRouteGuard>
        <p>New account content</p>
      </ExecutionRouteGuard>,
    );

    expect(screen.getByText("New account content")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(getExecutionState().configuration).toBeNull();
      expect(getExecutionState().tasks).toEqual([]);
    });
  });
});
