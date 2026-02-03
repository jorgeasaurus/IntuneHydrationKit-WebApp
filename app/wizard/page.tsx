"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useWizardState } from "@/hooks/useWizardState";
import { TenantConfig } from "@/components/wizard/TenantConfig";
import { OperationModeSelection } from "@/components/wizard/OperationMode";
import { TargetSelection } from "@/components/wizard/TargetSelection";
import { ReviewConfirm } from "@/components/wizard/ReviewConfirm";
import { Progress } from "@/components/ui/progress";
import { useMsal } from "@azure/msal-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/authUtils";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Home } from "lucide-react";

const STEP_TITLES = [
  "Tenant Configuration",
  "Operation Mode",
  "Target Selection",
  "Review & Confirm",
];

function WizardContent() {
  const { state } = useWizardState();
  const { accounts } = useMsal();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  const progress = (state.currentStep / 4) * 100;

  const renderStep = () => {
    switch (state.currentStep) {
      case 1:
        return <TenantConfig />;
      case 2:
        return <OperationModeSelection />;
      case 3:
        return <TargetSelection />;
      case 4:
        return <ReviewConfirm />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen relative z-10">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Image
              src="/IHTLogoClear.png"
              alt="Intune Hydration Kit Logo"
              width={48}
              height={48}
              className="w-12 h-12"
            />
            <div>
              <h1 className="text-2xl font-bold">Intune Hydration Kit</h1>
              <p className="text-sm text-muted-foreground">
                Signed in as {accounts[0]?.username}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/">
                <Home className="h-4 w-4 mr-2" />
                Home
              </Link>
            </Button>
            <Button variant="outline" onClick={handleSignOut}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="space-y-8">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-bold tracking-tight">
                  {STEP_TITLES[state.currentStep - 1]}
                </h2>
                <p className="text-muted-foreground">
                  Step {state.currentStep} of 4
                </p>
              </div>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {renderStep()}
        </div>
      </main>

      <footer className="border-t mt-12 py-6">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>
            IntuneHydrationKit v0.1.0 |{" "}
            <a
              href="https://github.com/jorgeasaurus/IntuneHydrationKit-WebApp"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Documentation
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

export default function WizardPage() {
  return (
    <ProtectedRoute>
      <WizardContent />
    </ProtectedRoute>
  );
}
