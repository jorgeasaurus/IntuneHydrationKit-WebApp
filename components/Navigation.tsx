"use client";

import { useState } from "react";
import { useIsAuthenticated } from "@azure/msal-react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { signIn } from "@/lib/auth/authUtils";
import { toast } from "sonner";
import { CloudEnvironmentSelector } from "@/components/CloudEnvironmentSelector";
import { CloudEnvironment } from "@/types/hydration";
import { useWizardState } from "@/hooks/useWizardState";
import { ThemeToggle } from "@/components/ThemeToggle";

export function Navigation() {
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

  const handleGetStarted = () => {
    if (isAuthenticated) {
      resetWizard();
      router.push("/wizard");
    } else {
      handleSignInClick();
    }
  };

  return (
    <>
      {/* Floating Glassmorphism Navigation */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-4xl px-4">
        <nav className="nav-glass rounded-full px-4 sm:px-6 py-3 shadow-lg">
          <div className="flex items-center justify-between">
            {/* Logo and Brand */}
            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <Image
                src="/IHTLogoClear.png"
                alt="Intune Hydration Kit"
                width={32}
                height={32}
                className="w-8 h-8"
              />
              <span className="font-bold text-lg hidden sm:inline-block">
                Intune Hydration Kit
              </span>
            </Link>

            {/* Navigation Links */}
            <div className="hidden md:flex items-center gap-6">
              <Link
                href="#features"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Features
              </Link>
              <Link
                href="#what-gets-deployed"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Configurations
              </Link>
              <Link
                href="#faq"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                FAQs
              </Link>
            </div>

            {/* Theme Toggle and CTA Button */}
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Button onClick={handleGetStarted} size="sm" className="text-white rounded-full">
              {!isAuthenticated && (
                <svg className="mr-2 h-4 w-4" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                  <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                  <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                  <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
                </svg>
              )}
              {isAuthenticated ? "Go to Wizard" : "Sign In"}
              </Button>
            </div>
          </div>
        </nav>
      </div>

      {/* Cloud Environment Selector Dialog */}
      <CloudEnvironmentSelector
        open={showCloudSelector}
        onSelect={handleCloudSelect}
        onCancel={handleCloudSelectorCancel}
      />
    </>
  );
}
