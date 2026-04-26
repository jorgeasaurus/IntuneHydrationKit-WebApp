"use client";

import { useState } from "react";
import { useIsAuthenticated } from "@azure/msal-react";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { signIn } from "@/lib/auth/authUtils";
import { toast } from "sonner";
import { CloudEnvironmentSelector } from "@/components/CloudEnvironmentSelector";
import { CloudEnvironment } from "@/types/hydration";
import { useWizardState } from "@/hooks/useWizardState";
import { LIGHT_DARK_THEME_CYCLE, ThemeToggle } from "@/components/ThemeToggle";
import { Terminal, Github } from "lucide-react";

export function Navigation() {
  const isAuthenticated = useIsAuthenticated();
  const pathname = usePathname();
  const router = useRouter();
  const { resetWizard } = useWizardState();
  const [showCloudSelector, setShowCloudSelector] = useState(false);

  const getSectionHref = (hash: string) => (pathname === "/" ? hash : `/${hash}`);

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
      {/* Industrial Navigation Bar */}
      <div className="fixed top-0 left-0 right-0 z-50">
        {/* Top accent line */}
        <div className="h-[2px] bg-gradient-to-r from-transparent via-hydrate to-transparent" />

        <nav className="nav-industrial">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="flex items-center justify-between h-16">
              {/* Logo and Brand */}
              <Link
                href="/"
                className="flex items-center gap-3 group"
              >
                <div className="relative">
                  <Image
                    src="/IHTLogoClear.png"
                    alt="Intune Hydration Kit"
                    width={36}
                    height={36}
                    className="w-9 h-9 transition-transform group-hover:scale-105"
                  />
                  {/* Glow effect on hover */}
                  <div className="absolute inset-0 bg-hydrate/20 rounded-full blur-lg opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <span className="hidden sm:block font-bold text-xl leading-tight tracking-tight">
                  Intune Hydration Kit
                </span>
              </Link>

              {/* Navigation Links */}
              <div className="hidden md:flex items-center gap-8">
                <Link href={getSectionHref("#features")} className="nav-link text-sm font-medium">
                  Features
                </Link>
                <Link href={getSectionHref("#what-gets-deployed")} className="nav-link text-sm font-medium">
                  Configurations
                </Link>
                <Link href={getSectionHref("#faq")} className="nav-link text-sm font-medium">
                  FAQs
                </Link>
                <Link href="/templates" className="nav-link text-sm font-medium">
                  Template Docs
                </Link>
              </div>

              {/* Right Section */}
              <div className="flex items-center gap-3">
                <a
                  href="https://github.com/jorgeasaurus/IntuneHydrationKit-WebApp"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-md hover:bg-muted transition-colors"
                  aria-label="GitHub Repository"
                >
                  <Github className="w-5 h-5" />
                </a>
                <ThemeToggle themes={LIGHT_DARK_THEME_CYCLE} />

                {/* Terminal Status Indicator */}
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/50 border border-border">
                  <span className={`w-2 h-2 rounded-full ${isAuthenticated ? 'bg-signal-success' : 'bg-muted-foreground'}`} />
                  <span className="text-xs font-mono text-muted-foreground">
                    {isAuthenticated ? 'CONNECTED' : 'OFFLINE'}
                  </span>
                </div>

                {/* CTA Button */}
                <Button
                  onClick={handleGetStarted}
                  variant="outline"
                  className="rounded-md px-4 h-9 text-sm font-semibold border-2"
                >
                  {isAuthenticated ? (
                    <>
                      <Terminal className="w-4 h-4 mr-2" />
                      Launch Wizard
                    </>
                  ) : (
                    <>
                      <svg
                        className="mr-2 h-4 w-4"
                        viewBox="0 0 21 21"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                        <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                        <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                        <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                      </svg>
                      Sign In
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </nav>

        {/* Bottom border with accent */}
        <div className="h-px bg-border" />
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
