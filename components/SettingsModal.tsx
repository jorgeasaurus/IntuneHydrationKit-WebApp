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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useSettings } from "@/hooks/useSettings";
import { DEFAULT_APP_SETTINGS } from "@/lib/settings";
import { EyeOff, RotateCcw } from "lucide-react";

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
    setLocalSettings(DEFAULT_APP_SETTINGS);
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
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Execution Settings</h3>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="stopOnError">Stop on First Error</Label>
                <p className="text-sm text-muted-foreground">
                  Stop execution after the current task fails instead of continuing through the queue
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
          </div>

          <div className="space-y-4 border-t border-border/80 pt-6">
            <div className="flex items-center gap-2">
              <EyeOff className="size-4 text-hydrate" aria-hidden="true" />
              <h3 className="text-sm font-semibold">Presentation Settings</h3>
            </div>

            <div className="flex items-center justify-between gap-6">
              <div className="space-y-0.5">
                <Label htmlFor="demoMode">Demo Mode</Label>
                <p className="text-sm text-muted-foreground">
                  Blur tenant and operator identity data during screen shares and demonstrations
                </p>
              </div>
              <Switch
                id="demoMode"
                checked={localSettings.demoMode}
                onCheckedChange={(checked: boolean) =>
                  setLocalSettings({ ...localSettings, demoMode: checked })
                }
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleReset}>
            <RotateCcw className="size-4 mr-2" />
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
