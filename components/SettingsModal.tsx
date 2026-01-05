"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSettings } from "@/hooks/useSettings";
import { RotateCcw } from "lucide-react";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const { settings, updateSettings, resetSettings } = useSettings();
  const [localSettings, setLocalSettings] = useState(settings);

  const handleSave = () => {
    updateSettings(localSettings);
    onOpenChange(false);
  };

  const handleReset = () => {
    resetSettings();
    setLocalSettings(settings);
  };

  const handleCancel = () => {
    setLocalSettings(settings);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure default values and application behavior
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Cloud Environment */}
          <div className="space-y-2">
            <Label htmlFor="cloudEnvironment">Default Cloud Environment</Label>
            <Select
              value={localSettings.defaultCloudEnvironment}
              onValueChange={(value) =>
                setLocalSettings({ ...localSettings, defaultCloudEnvironment: value })
              }
            >
              <SelectTrigger id="cloudEnvironment">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Global">Global (Commercial)</SelectItem>
                <SelectItem value="USGov">US Government (GCC High)</SelectItem>
                <SelectItem value="USGovDoD">US Government DoD</SelectItem>
                <SelectItem value="Germany">Germany</SelectItem>
                <SelectItem value="China">China (21Vianet)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              The default cloud environment for new tenant connections
            </p>
          </div>

          {/* Baseline Repository */}
          <div className="space-y-2">
            <Label htmlFor="baselineRepo">Default Baseline Repository</Label>
            <Input
              id="baselineRepo"
              value={localSettings.defaultBaselineRepo}
              onChange={(e) =>
                setLocalSettings({ ...localSettings, defaultBaselineRepo: e.target.value })
              }
            />
            <p className="text-sm text-muted-foreground">
              Default GitHub repository URL for OpenIntuneBaseline
            </p>
          </div>

          {/* Baseline Branch */}
          <div className="space-y-2">
            <Label htmlFor="baselineBranch">Default Baseline Branch</Label>
            <Input
              id="baselineBranch"
              value={localSettings.defaultBaselineBranch}
              onChange={(e) =>
                setLocalSettings({ ...localSettings, defaultBaselineBranch: e.target.value })
              }
            />
            <p className="text-sm text-muted-foreground">
              Default branch to download baseline from
            </p>
          </div>

          {/* Execution Settings */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Execution Settings</h3>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="stopOnError">Stop on First Error</Label>
                <p className="text-sm text-muted-foreground">
                  Stop execution when a task fails instead of continuing
                </p>
              </div>
              <Switch
                id="stopOnError"
                checked={localSettings.stopOnFirstError}
                onCheckedChange={(checked: boolean) =>
                  setLocalSettings({ ...localSettings, stopOnFirstError: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="verboseLogging">Verbose Logging</Label>
                <p className="text-sm text-muted-foreground">
                  Enable detailed logging for debugging
                </p>
              </div>
              <Switch
                id="verboseLogging"
                checked={localSettings.enableVerboseLogging}
                onCheckedChange={(checked: boolean) =>
                  setLocalSettings({ ...localSettings, enableVerboseLogging: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="autoDownload">Auto-download Reports</Label>
                <p className="text-sm text-muted-foreground">
                  Automatically download execution reports when complete
                </p>
              </div>
              <Switch
                id="autoDownload"
                checked={localSettings.autoDownloadReports}
                onCheckedChange={(checked: boolean) =>
                  setLocalSettings({ ...localSettings, autoDownloadReports: checked })
                }
              />
            </div>
          </div>

          {/* Theme */}
          <div className="space-y-2">
            <Label htmlFor="theme">Theme</Label>
            <Select
              value={localSettings.theme}
              onValueChange={(value: "light" | "dark" | "system") =>
                setLocalSettings({ ...localSettings, theme: value })
              }
            >
              <SelectTrigger id="theme">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">Choose your preferred theme</p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset to Defaults
          </Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
