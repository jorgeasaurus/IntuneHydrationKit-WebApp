"use client";

import { InteractionStatus } from "@azure/msal-browser";
import { useIsAuthenticated, useMsal } from "@azure/msal-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuthUnavailableError } from "@/components/auth/AuthAvailability";
import { Button } from "@/components/ui/button";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/** Home page URL for a signed-out visit to a protected route. The landing page can show a sign-in hint. */
export const SIGN_IN_REQUIRED_PATH = "/?signin=required";

/** Full-page message for a protected route when sign-in cannot work. */
function AuthUnavailablePage({ message }: { message: string }) {
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4">
      <div role="alert" className="max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-semibold">Sign-in is unavailable</h1>
        <p className="text-muted-foreground">{message}</p>
        <Button asChild>
          <Link href="/">Back to home page</Link>
        </Button>
      </div>
    </main>
  );
}

/**
 * Protected route wrapper.
 * Renders nothing until MSAL startup completes, so the server HTML and the first client render
 * agree. After startup, a signed-out user goes to the home page with a sign-in hint.
 * If MSAL is not configured or failed to initialize, startup never completes, so the route
 * shows the error instead of waiting.
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const isAuthenticated = useIsAuthenticated();
  const { inProgress } = useMsal();
  const authError = useAuthUnavailableError();
  // Wait while MSAL starts up or while an interaction (sign-in, sign-out) runs.
  const shouldRedirect = !authError && !isAuthenticated && inProgress === InteractionStatus.None;
  const router = useRouter();

  useEffect(() => {
    if (shouldRedirect) {
      // oxlint-disable-next-line react-doctor/nextjs-no-client-side-redirect -- MSAL authentication state is client-only
      router.replace(SIGN_IN_REQUIRED_PATH);
    }
  }, [shouldRedirect, router]);

  // Cached accounts can make isAuthenticated true, but without MSAL no token request can succeed.
  if (authError) {
    return <AuthUnavailablePage message={authError} />;
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
