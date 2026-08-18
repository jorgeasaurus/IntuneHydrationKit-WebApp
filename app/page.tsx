/* oxlint-disable react-doctor/nextjs-missing-metadata -- route metadata is defined in app/layout.tsx for this client page. */
"use client";

import { useIsAuthenticated } from "@azure/msal-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { HomeLanding } from "@/components/landing/HomeLanding";
import { signIn } from "@/lib/auth/authUtils";
import { useWizardState } from "@/hooks/useWizardState";
import { resetHydrationFlow } from "@/lib/hydration/resetHydrationFlow";

export default function Home() {
  const isAuthenticated = useIsAuthenticated();
  const router = useRouter();
  const { resetWizard } = useWizardState();
  const handleSignInClick = async () => {
    try {
      await signIn();
      toast.success("Successfully signed in!");
      resetHydrationFlow(sessionStorage, resetWizard);
      router.push("/wizard");
    } catch (error) {
      toast.error("Failed to sign in. Please try again.");
      console.error("Sign in error:", error);
    }
  };

  const handleContinue = () => {
    resetHydrationFlow(sessionStorage, resetWizard);
    router.push("/wizard");
  };

  return (
    <HomeLanding isAuthenticated={isAuthenticated} onSignInClick={handleSignInClick} onContinue={handleContinue} />
  );
}
