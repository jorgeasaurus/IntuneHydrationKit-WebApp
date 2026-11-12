"use client";

import { InteractionStatus } from "@azure/msal-browser";
import { useIsAuthenticated, useMsal } from "@azure/msal-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/** Home page URL for a signed-out visit to a protected route. The landing page can show a sign-in hint. */
export const SIGN_IN_REQUIRED_PATH = "/?signin=required";

/**
 * Protected route wrapper.
 * Renders nothing until MSAL startup completes, so the server HTML and the first client render
 * agree. After startup, a signed-out user goes to the home page with a sign-in hint.
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const isAuthenticated = useIsAuthenticated();
  const { inProgress } = useMsal();
  // Wait while MSAL starts up or while an interaction (sign-in, sign-out) runs.
  const shouldRedirect = !isAuthenticated && inProgress === InteractionStatus.None;
  const router = useRouter();

  useEffect(() => {
    if (shouldRedirect) {
      // oxlint-disable-next-line react-doctor/nextjs-no-client-side-redirect -- MSAL authentication state is client-only
      router.replace(SIGN_IN_REQUIRED_PATH);
    }
  }, [shouldRedirect, router]);

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
