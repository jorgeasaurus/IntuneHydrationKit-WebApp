"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useIsAuthenticated, useMsal } from "@azure/msal-react";
import { getExecutionState, resetExecutionSession, subscribeExecutionState } from "@/lib/hydration/executionStateStore";

interface ExecutionRouteGuardProps {
  children: ReactNode;
}

export function ExecutionRouteGuard({ children }: ExecutionRouteGuardProps): React.JSX.Element | null {
  const pathname = usePathname();
  const router = useRouter();
  const isAuthenticated = useIsAuthenticated();
  const { instance, accounts } = useMsal();
  const executionState = useSyncExternalStore(subscribeExecutionState, getExecutionState, getExecutionState);
  const account = instance.getActiveAccount() ?? accounts[0];
  const configuration = executionState.configuration;
  const ownerMatches = Boolean(
    configuration &&
    account &&
    configuration.homeAccountId === account.homeAccountId &&
    configuration.tenantId === account.tenantId,
  );
  const mustDiscard = Boolean(configuration && (!isAuthenticated || (account && !ownerMatches)));
  const isActive =
    ownerMatches &&
    (executionState.phase === "building" ||
      executionState.phase === "running" ||
      executionState.phase === "paused" ||
      executionState.phase === "cancelling");
  const shouldReturnToDashboard = isActive && pathname !== "/dashboard";

  useEffect(() => {
    if (mustDiscard) resetExecutionSession();
  }, [mustDiscard]);

  useEffect(() => {
    if (shouldReturnToDashboard) router.replace("/dashboard");
  }, [router, shouldReturnToDashboard]);

  useEffect(() => {
    if (!isActive) return;
    const preventUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = true;
    };
    window.addEventListener("beforeunload", preventUnload);
    return () => window.removeEventListener("beforeunload", preventUnload);
  }, [isActive]);

  return shouldReturnToDashboard ? null : <>{children}</>;
}
