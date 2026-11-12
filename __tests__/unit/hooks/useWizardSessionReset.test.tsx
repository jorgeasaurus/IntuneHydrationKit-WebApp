import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WizardProvider, useWizardState } from "@/hooks/useWizardState";
import { notifySignOut } from "@/lib/auth/sessionEvents";

const msal = vi.hoisted(() => ({
  accounts: [] as Array<{ homeAccountId: string; tenantId: string }>,
}));

vi.mock("@azure/msal-react", () => ({
  useMsal: () => ({
    accounts: msal.accounts,
    instance: { getActiveAccount: () => null },
  }),
}));

function renderWizard() {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <WizardProvider>{children}</WizardProvider>
  );
  return renderHook(() => useWizardState(), { wrapper });
}

function confirmRun(result: ReturnType<typeof renderWizard>["result"]) {
  act(() => {
    result.current.setOperationMode("create");
    result.current.setIsPreview(false);
    result.current.setConfirmed(true);
    result.current.setCurrentStep(4);
  });
  expect(result.current.state.confirmed).toBe(true);
}

describe("WizardProvider session reset", () => {
  beforeEach(() => {
    msal.accounts = [{ homeAccountId: "account-a", tenantId: "tenant-1" }];
  });

  it("clears the confirmed wizard when the app signs out", () => {
    const { result } = renderWizard();
    confirmRun(result);

    act(() => notifySignOut());

    expect(result.current.state.confirmed).toBe(false);
    expect(result.current.state.currentStep).toBe(1);
    expect(result.current.state.operationMode).toBeUndefined();
  });

  it("clears the confirmed wizard when the signed-in account goes away", () => {
    const { result, rerender } = renderWizard();
    confirmRun(result);

    msal.accounts = [];
    rerender();

    expect(result.current.state.confirmed).toBe(false);
  });

  it("clears the confirmed wizard when the account changes", () => {
    const { result, rerender } = renderWizard();
    confirmRun(result);

    msal.accounts = [{ homeAccountId: "account-b", tenantId: "tenant-1" }];
    rerender();

    expect(result.current.state.confirmed).toBe(false);
  });

  it("clears the confirmed wizard when the same account switches tenant", () => {
    // A guest's tenant profiles share one homeAccountId.
    const { result, rerender } = renderWizard();
    confirmRun(result);
    act(() => {
      result.current.setTenantConfig({
        tenantId: "tenant-1",
        homeAccountId: "account-a",
        cloudEnvironment: "global",
      });
    });

    msal.accounts = [{ homeAccountId: "account-a", tenantId: "tenant-2" }];
    rerender();

    expect(result.current.state.confirmed).toBe(false);
    expect(result.current.state.tenantConfig).toBeUndefined();
  });

  it("keeps wizard state while the same account stays signed in", () => {
    const { result, rerender } = renderWizard();
    confirmRun(result);

    msal.accounts = [{ homeAccountId: "account-a", tenantId: "tenant-1" }];
    rerender();

    expect(result.current.state.confirmed).toBe(true);
  });

  it("keeps wizard state when an account signs in", () => {
    msal.accounts = [];
    const { result, rerender } = renderWizard();
    confirmRun(result);

    msal.accounts = [{ homeAccountId: "account-a", tenantId: "tenant-1" }];
    rerender();

    expect(result.current.state.confirmed).toBe(true);
  });
});
