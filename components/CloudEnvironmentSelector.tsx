"use client";

import { useState } from "react";
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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Cloud, Globe, Shield, Building2 } from "lucide-react";

interface CloudEnvironmentSelectorProps {
  open: boolean;
  onSelect: (environment: CloudEnvironment) => void;
  onCancel: () => void;
}

const CLOUD_ENVIRONMENTS: {
  value: CloudEnvironment;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    value: "global",
    label: "Global (Commercial)",
    description: "Microsoft 365 commercial cloud for worldwide customers",
    icon: <Globe className="h-5 w-5" />,
  },
  {
    value: "usgov",
    label: "US Government (GCC High)",
    description: "Government Community Cloud High for US federal agencies",
    icon: <Shield className="h-5 w-5" />,
  },
  {
    value: "usgovdod",
    label: "US Government (DoD)",
    description: "Department of Defense cloud environment",
    icon: <Shield className="h-5 w-5" />,
  },
  {
    value: "germany",
    label: "Germany",
    description: "Microsoft Cloud Germany (data residency in Germany)",
    icon: <Building2 className="h-5 w-5" />,
  },
  {
    value: "china",
    label: "China (21Vianet)",
    description: "Microsoft Azure operated by 21Vianet in China",
    icon: <Cloud className="h-5 w-5" />,
  },
];

export function CloudEnvironmentSelector({
  open,
  onSelect,
  onCancel,
}: CloudEnvironmentSelectorProps) {
  const [selected, setSelected] = useState<CloudEnvironment>("global");

  const handleContinue = () => {
    onSelect(selected);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            Select Cloud Environment
          </DialogTitle>
          <DialogDescription>
            Choose the Microsoft cloud environment for your tenant. This determines which login endpoint and Graph API will be used.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <RadioGroup
            value={selected}
            onValueChange={(value) => setSelected(value as CloudEnvironment)}
            className="space-y-3"
          >
            {CLOUD_ENVIRONMENTS.map((env) => (
              <div key={env.value}>
                <Label
                  htmlFor={env.value}
                  className={`flex items-start gap-4 rounded-lg border p-4 cursor-pointer transition-colors ${
                    selected === env.value
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <RadioGroupItem value={env.value} id={env.value} className="mt-1" />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      {env.icon}
                      <span className="font-medium">{env.label}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{env.description}</p>
                  </div>
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleContinue}>
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
