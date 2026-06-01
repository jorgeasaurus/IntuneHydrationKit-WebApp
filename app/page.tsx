/* oxlint-disable react-doctor/nextjs-missing-metadata -- route metadata is defined in app/layout.tsx for this client page. */
"use client";

import { useState } from "react";
import { useIsAuthenticated } from "@azure/msal-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { HomeLanding } from "@/components/landing/HomeLanding";
import { signIn } from "@/lib/auth/authUtils";
import type { CloudEnvironment } from "@/types/hydration";
import { useWizardState } from "@/hooks/useWizardState";

export default function Home() {
  const isAuthenticated = useIsAuthenticated();
  const router = useRouter();
  const { resetWizard } = useWizardState();
  const [showCloudSelector, setShowCloudSelector] = useState(false);

  const handleSignInClick = () => {
    setShowCloudSelector(true);
  };

  const handleCloudSelect = async (environment: CloudEnvironment) => {
    setShowCloudSelector(false);
    try {
      await signIn(environment);
      toast.success("Successfully signed in!");
      resetWizard();
      router.push("/wizard");
    } catch (error) {
      toast.error("Failed to sign in. Please try again.");
      console.error("Sign in error:", error);
    }
  };

  const handleCloudSelectorCancel = () => {
    setShowCloudSelector(false);
  };

  const handleContinue = () => {
    resetWizard();
    router.push("/wizard");
  };

  return (
    <HomeLanding
      isAuthenticated={isAuthenticated}
      showCloudSelector={showCloudSelector}
      onSignInClick={handleSignInClick}
      onCloudSelect={handleCloudSelect}
      onCloudSelectorCancel={handleCloudSelectorCancel}
      onContinue={handleContinue}
    />
  );
}
