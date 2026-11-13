"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AUTOPILOT_BRANDING_APPS,
  AUTOPILOT_BRANDING_TASKS,
  getDefaultAutopilotBrandingCustomization,
  isDefaultAutopilotBrandingCustomization,
  normalizeAutopilotBrandingCustomization,
  type AutopilotBrandingAppName,
  type AutopilotBrandingCustomization,
  type AutopilotBrandingTaskName,
} from "@/lib/win32/autopilotBrandingConfig";

export const EXISTING_APP_NOTE =
  "Create skips an app that already exists. To change the settings of an existing app, delete it and create it again.";

interface AutopilotBrandingCustomizeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The current customization, or undefined for the kit configuration. */
  value: AutopilotBrandingCustomization | undefined;
  /** Save the choices. Undefined means the kit configuration without change. */
  onSave: (value: AutopilotBrandingCustomization | undefined) => void;
}

function toggle<T extends string>(values: readonly T[], value: T, checked: boolean): T[] {
  return checked ? [...values.filter((item) => item !== value), value] : values.filter((item) => item !== value);
}

function AppChecklist({
  selected,
  onToggle,
}: {
  selected: ReadonlySet<string>;
  onToggle: (name: AutopilotBrandingAppName, checked: boolean) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">Apps to remove</legend>
      <p id="ab-apps-count" className="text-xs text-muted-foreground">
        {selected.size} of {AUTOPILOT_BRANDING_APPS.length} apps selected
      </p>
      <ul className="max-h-56 space-y-1 overflow-y-auto rounded-md border bg-background p-2">
        {AUTOPILOT_BRANDING_APPS.map((app, index) => {
          const id = `ab-app-${index}`;
          const label = "label" in app ? app.label : undefined;
          return (
            <li key={app.packageName} className="flex items-center gap-x-2 rounded px-2 py-1 hover:bg-muted/50">
              <Checkbox
                id={id}
                checked={selected.has(app.packageName)}
                onCheckedChange={(checked) => onToggle(app.packageName, checked === true)}
              />
              <Label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer flex-wrap items-baseline gap-x-2 text-sm">
                {label ? <span>{label}</span> : null}
                {label ? " " : null}
                <span className={label ? "font-mono text-xs text-muted-foreground" : "font-mono text-xs"}>
                  {app.packageName}
                </span>
              </Label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

function TaskToggles({
  enabled,
  onToggle,
}: {
  enabled: ReadonlySet<string>;
  onToggle: (name: AutopilotBrandingTaskName, checked: boolean) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">Other cleanup tasks</legend>
      <ul className="space-y-2">
        {AUTOPILOT_BRANDING_TASKS.map((task) => {
          const id = `ab-task-${task.name}`;
          return (
            <li key={task.name} className="flex items-start gap-3">
              <Switch
                id={id}
                checked={enabled.has(task.name)}
                aria-describedby={`${id}-description`}
                onCheckedChange={(checked) => onToggle(task.name, checked)}
              />
              <div className="min-w-0 space-y-0.5">
                <Label htmlFor={id} className="cursor-pointer text-sm font-medium">
                  {task.label} <span className="font-mono text-xs text-muted-foreground">{task.name}</span>
                </Label>
                <p id={`${id}-description`} className="text-xs text-muted-foreground">
                  {task.description}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

/**
 * Choose the apps that Autopilot Branding removes and the cleanup tasks that it runs.
 * Mount it with a key so each open starts from the saved value.
 */
export function AutopilotBrandingCustomizeDialog({
  open,
  onOpenChange,
  value,
  onSave,
}: AutopilotBrandingCustomizeDialogProps): React.JSX.Element {
  const [draft, setDraft] = useState<AutopilotBrandingCustomization>(
    () => value ?? getDefaultAutopilotBrandingCustomization(),
  );
  const selectedApps = new Set<string>(draft.removedApps);
  const enabledTasks = new Set<string>(draft.enabledTasks);
  const isEmpty = draft.removedApps.length === 0 && draft.enabledTasks.length === 0;
  const isDefault = isDefaultAutopilotBrandingCustomization(draft);

  function handleSave(): void {
    if (isEmpty) return;
    onSave(isDefault ? undefined : normalizeAutopilotBrandingCustomization(draft));
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Customize Autopilot Branding</DialogTitle>
          <DialogDescription>
            Choose the in-box apps to remove and the cleanup tasks to run during Windows Autopilot (OOBE).
            The app sets no wallpaper, theme, layout, OEM information, language, or time zone.
          </DialogDescription>
        </DialogHeader>
        <p className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm">{EXISTING_APP_NOTE}</p>
        <AppChecklist
          selected={selectedApps}
          onToggle={(name, checked) =>
            setDraft((current) => ({ ...current, removedApps: toggle(current.removedApps, name, checked) }))
          }
        />
        <TaskToggles
          enabled={enabledTasks}
          onToggle={(name, checked) =>
            setDraft((current) => ({ ...current, enabledTasks: toggle(current.enabledTasks, name, checked) }))
          }
        />
        {isEmpty && (
          <p role="alert" className="text-sm text-destructive">
            Select at least one app to remove or one cleanup task.
          </p>
        )}
        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            disabled={isDefault}
            onClick={() => setDraft(getDefaultAutopilotBrandingCustomization())}
          >
            Reset to defaults
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={isEmpty} onClick={handleSave}>
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The "Customize" button of the Autopilot Branding item and its dialog. */
export function AutopilotBrandingCustomizeControl({
  value,
  onChange,
}: {
  value: AutopilotBrandingCustomization | undefined;
  onChange: (value: AutopilotBrandingCustomization | undefined) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [openCount, setOpenCount] = useState(0);
  return (
    <>
      {value && (
        <span className="shrink-0 rounded-full border border-hydrate/40 bg-hydrate/10 px-2 py-0.5 text-xs font-medium">
          Customized
        </span>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 shrink-0 text-xs"
        aria-label="Customize Autopilot Branding"
        onClick={() => {
          setOpenCount((count) => count + 1);
          setOpen(true);
        }}
      >
        Customize
      </Button>
      <AutopilotBrandingCustomizeDialog
        key={openCount}
        open={open}
        onOpenChange={setOpen}
        value={value}
        onSave={onChange}
      />
    </>
  );
}
