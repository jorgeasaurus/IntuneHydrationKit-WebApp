"use client";

import { useId, useState } from "react";
import { BellRing } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useSettings } from "@/hooks/useSettings";
import { getNotificationPermissionHint, useNotificationPermission } from "@/hooks/useRunCompletionNotification";

/**
 * Turns the completion notification on or off. Permission is requested only
 * when the user turns the switch on.
 */
export function CompletionNotificationToggle(): React.JSX.Element {
  const id = useId();
  const { settings, updateSettings } = useSettings();
  const { availability, request } = useNotificationPermission();
  const [status, setStatus] = useState("");
  const hint = getNotificationPermissionHint(availability);
  const checked = settings.notifyOnCompletion && availability === "granted";

  async function handleCheckedChange(nextChecked: boolean): Promise<void> {
    if (!nextChecked) {
      updateSettings({ notifyOnCompletion: false });
      setStatus("Completion notification is off.");
      return;
    }
    const result = await request();
    if (result === "granted") {
      updateSettings({ notifyOnCompletion: true });
      setStatus("Completion notification is on. It shows if the run finishes while this tab is hidden.");
      return;
    }
    updateSettings({ notifyOnCompletion: false });
    setStatus(getNotificationPermissionHint(result) ?? "Notification permission was not given.");
  }

  return (
    <div className="glass-panel flex flex-col gap-2 rounded-2xl px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <BellRing aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-sky-200" />
        <div className="min-w-0 space-y-0.5">
          <Label htmlFor={id} className="text-sm font-medium text-slate-50">
            Notify me when this finishes
          </Label>
          <p id={`${id}-description`} className="text-xs leading-5 text-slate-300">
            {hint ?? "Shows a browser notification with the result counts if this tab is hidden."}
          </p>
          <p aria-live="polite" className="text-xs leading-5 text-slate-200">
            {status}
          </p>
        </div>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={availability === "unsupported" || availability === "denied"}
        aria-describedby={`${id}-description`}
        onCheckedChange={(nextChecked: boolean) => void handleCheckedChange(nextChecked)}
        className="self-end sm:self-auto"
      />
    </div>
  );
}
