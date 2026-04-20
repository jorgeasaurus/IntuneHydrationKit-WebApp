"use client";

import { CloudEnvironment } from "@/types/hydration";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Cloud, Globe, Shield, Building2, ExternalLink, Terminal } from "lucide-react";

const POWERSHELL_MODULE_URL = "https://github.com/jorgeasaurus/IntuneHydrationKit";

interface CloudEnvironmentSelectorProps {
  open: boolean;
  onSelect: (environment: CloudEnvironment) => void;
  onCancel: () => void;
}

interface CloudEnvironmentOption {
  value: CloudEnvironment;
  label: string;
  description: string;
  icon: React.ReactNode;
  supported: boolean;
}

const CLOUD_ENVIRONMENTS: CloudEnvironmentOption[] = [
  {
    value: "global",
    label: "Global (Commercial)",
    description: "Microsoft 365 commercial cloud for worldwide customers",
    icon: <Globe className="h-5 w-5" />,
    supported: true,
  },
  {
    value: "usgov",
    label: "US Government (GCC High)",
    description: "Government Community Cloud High for US federal agencies",
    icon: <Shield className="h-5 w-5" />,
    supported: false,
  },
  {
    value: "usgovdod",
    label: "US Government (DoD)",
    description: "Department of Defense cloud environment",
    icon: <Shield className="h-5 w-5" />,
    supported: false,
  },
  {
    value: "germany",
    label: "Germany",
    description: "Microsoft Cloud Germany (data residency in Germany)",
    icon: <Building2 className="h-5 w-5" />,
    supported: false,
  },
  {
    value: "china",
    label: "China (21Vianet)",
    description: "Microsoft Azure operated by 21Vianet in China",
    icon: <Cloud className="h-5 w-5" />,
    supported: false,
  },
];

export function CloudEnvironmentSelector({
  open,
  onSelect,
  onCancel,
}: CloudEnvironmentSelectorProps) {
  const handleContinue = () => {
    onSelect("global");
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            Select Cloud Environment
          </DialogTitle>
          <DialogDescription>
            The web app currently supports the Global (Commercial) cloud.
            Sovereign and government clouds are supported via the PowerShell module.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-3">
          {CLOUD_ENVIRONMENTS.map((env) => (
            <div
              key={env.value}
              className={`flex items-start gap-4 rounded-lg border p-4 transition-colors ${
                env.supported
                  ? "border-primary bg-primary/5"
                  : "border-muted bg-muted/30 opacity-60"
              }`}
            >
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  {env.icon}
                  <span className={`font-medium ${!env.supported ? "text-muted-foreground" : ""}`}>
                    {env.label}
                  </span>
                  {env.supported ? (
                    <span className="ml-auto inline-flex items-center rounded-md bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20 dark:bg-green-500/10 dark:text-green-400 dark:ring-green-500/20">
                      Supported
                    </span>
                  ) : (
                    <span className="ml-auto inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20">
                      <Terminal className="h-3 w-3" />
                      PowerShell only
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{env.description}</p>
              </div>
            </div>
          ))}

          {/* PowerShell module callout */}
          <div className="rounded-lg border border-dashed border-muted-foreground/25 bg-muted/20 p-4 mt-4">
            <div className="flex items-start gap-3">
              <Terminal className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Need a sovereign or government cloud?
                </p>
                <p className="text-sm text-muted-foreground">
                  The PowerShell module supports all Microsoft cloud environments
                  including GCC High, DoD, Germany, and China (21Vianet).
                </p>
                <a
                  href={POWERSHELL_MODULE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  View IntuneHydrationKit PowerShell module
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleContinue} className="text-white">
            <svg className="mr-2 h-4 w-4" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
              <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
              <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
            </svg>
            Continue to Sign In
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
