"use client";

import { useIsAuthenticated } from "@azure/msal-react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { signIn } from "@/lib/auth/authUtils";
import { toast } from "sonner";

export function Navigation() {
  const isAuthenticated = useIsAuthenticated();
  const router = useRouter();

  const handleSignIn = async () => {
    try {
      await signIn();
      toast.success("Successfully signed in!");
      router.push("/wizard");
    } catch (error) {
      toast.error("Failed to sign in. Please try again.");
      console.error("Sign in error:", error);
    }
  };

  const handleGetStarted = () => {
    if (isAuthenticated) {
      router.push("/wizard");
    } else {
      handleSignIn();
    }
  };

  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Logo and Brand */}
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <Image
              src="/IHTLogoClear.png"
              alt="Intune Hydration Kit"
              width={40}
              height={40}
              className="w-10 h-10"
            />
            <span className="font-bold text-xl hidden sm:inline-block">
              Intune Hydration Kit
            </span>
          </Link>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center gap-8">
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
              What Gets Deployed
            </Link>
            <Link
              href="#faq"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              FAQs
            </Link>
          </div>

          {/* CTA Button */}
          <Button onClick={handleGetStarted} size="default" className="text-white">
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
  );
}
