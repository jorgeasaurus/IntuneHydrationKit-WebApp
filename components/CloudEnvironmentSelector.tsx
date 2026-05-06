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
import { Cloud, ExternalLink, Globe, Terminal } from "lucide-react";

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
}

const COMMERCIAL_CLOUD: CloudEnvironmentOption = {
  value: "global",
  label: "Global (Commercial)",
  description: "Microsoft 365 commercial cloud for worldwide customers",
  icon: <Globe className="h-5 w-5" />,
};

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
          <div className="flex items-start gap-4 rounded-lg border border-primary bg-primary/5 p-4 transition-colors">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                {COMMERCIAL_CLOUD.icon}
                <span className="font-medium">{COMMERCIAL_CLOUD.label}</span>
                <span className="ml-auto inline-flex items-center rounded-md bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20 dark:bg-green-500/10 dark:text-green-400 dark:ring-green-500/20">
                  Supported
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {COMMERCIAL_CLOUD.description}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-dashed border-muted-foreground/25 bg-muted/20 p-4">
            <div className="flex items-start gap-3">
              <Terminal className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Need a sovereign cloud? Please use the PowerShell module.
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
