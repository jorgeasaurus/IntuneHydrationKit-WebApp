"use client";

import { useIsAuthenticated } from "@azure/msal-react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useRef, useState } from "react";
import { NavigationBrand } from "@/components/NavigationBrand";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { signIn } from "@/lib/auth/authUtils";
import { toast } from "sonner";
import { useWizardState } from "@/hooks/useWizardState";
import { Terminal, Github, Menu } from "lucide-react";
import { resetHydrationFlow } from "@/lib/hydration/resetHydrationFlow";

const SECTION_LINKS = [
  { hash: "#features", label: "Features" },
  { hash: "#what-gets-deployed", label: "Configurations" },
  { hash: "#faq", label: "FAQs" },
] as const;

export function Navigation() {
  const isAuthenticated = useIsAuthenticated();
  const pathname = usePathname();
  const router = useRouter();
  const { resetWizard } = useWizardState();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // The modal menu locks page scroll while open, so a menu link navigates
  // only after the menu has closed and released the lock.
  const pendingMenuHref = useRef<string | null>(null);
  const getSectionHref = (hash: string) => (pathname === "/" ? hash : `/${hash}`);
  const navLinks = [
    ...SECTION_LINKS.map((link) => ({ href: getSectionHref(link.hash), label: link.label })),
    { href: "/templates", label: "Template Docs" },
  ];

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

  const handleGetStarted = () => {
    if (isAuthenticated) {
      resetHydrationFlow(sessionStorage, resetWizard);
      router.push("/wizard");
    } else {
      handleSignInClick();
    }
  };

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-50">
        <div className="h-[2px] bg-gradient-to-r from-transparent via-hydrate to-transparent" />

        <div className="mx-auto w-full max-w-screen-2xl px-4 sm:px-6">
          <nav className="nav-industrial">
            <div className="flex h-16 items-center justify-between px-4 sm:px-6">
              {/* Logo and Brand */}
              <NavigationBrand showWordmark />

              {/* Navigation Links */}
              <div className="hidden items-center gap-8 lg:flex">
                {navLinks.map((link) => (
                  <Link key={link.label} href={link.href} className="nav-link text-sm font-medium">
                    {link.label}
                  </Link>
                ))}
              </div>

              {/* Right Section */}
              <div className="flex items-center gap-3">
                <a
                  href="https://github.com/jorgeasaurus/IntuneHydrationKit-WebApp"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="landing-nav-icon p-2 rounded-md hover:bg-muted transition-colors"
                  aria-label="GitHub Repository"
                >
                  <Github className="size-5" />
                </a>
                {/* Terminal Status Indicator */}
                <div className="landing-nav-status hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/50 border border-border">
                  <span
                    className={`size-2 rounded-full ${isAuthenticated ? "bg-signal-success" : "bg-muted-foreground"}`}
                  />
                  <span className="text-xs font-mono text-muted-foreground">
                    {isAuthenticated ? "CONNECTED" : "OFFLINE"}
                  </span>
                </div>

                {/* Section links below the lg breakpoint */}
                <Dialog open={isMenuOpen} onOpenChange={setIsMenuOpen}>
                  <DialogTrigger asChild>
                    <button
                      type="button"
                      className="landing-nav-icon rounded-md p-2 transition-colors hover:bg-muted lg:hidden"
                      aria-label="Open navigation menu"
                    >
                      <Menu className="size-5" aria-hidden="true" />
                    </button>
                  </DialogTrigger>
                  <DialogContent
                    onCloseAutoFocus={(event) => {
                      const href = pendingMenuHref.current;
                      if (!href) {
                        return;
                      }
                      event.preventDefault();
                      pendingMenuHref.current = null;
                      setTimeout(() => router.push(href), 0);
                    }}
                    className="top-24 max-w-[calc(100%-2rem)] translate-y-0 rounded-lg data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 sm:max-w-sm">
                    <DialogTitle>Menu</DialogTitle>
                    <DialogDescription className="sr-only">
                      Go to a section of the Intune Hydration Kit site.
                    </DialogDescription>
                    <nav aria-label="Site sections">
                      <ul className="grid gap-1">
                        {navLinks.map((link) => (
                          <li key={link.label}>
                            <Link
                              href={link.href}
                              onClick={(event) => {
                                event.preventDefault();
                                pendingMenuHref.current = link.href;
                                setIsMenuOpen(false);
                              }}
                              className="block rounded-md px-3 py-3 text-base font-medium transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                            >
                              {link.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </nav>
                  </DialogContent>
                </Dialog>

                {/* CTA Button */}
                <Button
                  onClick={handleGetStarted}
                  variant="outline"
                  className="nav-action h-9 rounded-md border-2 px-4 text-sm font-semibold"
                >
                  {isAuthenticated ? (
                    <>
                      <Terminal className="size-4" />
                      Launch Wizard
                    </>
                  ) : (
                    <>
                      <svg className="size-4" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
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
          </nav>
        </div>
      </div>
    </>
  );
}
