import {
  formatAutopilotBrandingApp,
  getEnabledTaskNames,
  type AutopilotBrandingCustomization,
} from "@/lib/win32/autopilotBrandingConfig";
import { EXISTING_APP_NOTE } from "@/components/wizard/AutopilotBrandingCustomizeDialog";
import type { WizardState } from "@/types/hydration";

/** The customization that a create run of the wizard uses, or undefined. Delete runs do not use one. */
function getRunCustomization(state: WizardState): AutopilotBrandingCustomization | undefined {
  if (state.operationMode !== "create" || !state.selectedTargets.includes("win32Apps")) return undefined;
  return state.categorySelections?.win32Apps?.autopilotBranding;
}

/**
 * The review step summary of a customized Autopilot Branding app: the apps that it removes and
 * the tasks that run. Nothing shows when the run uses the kit configuration.
 */
export function AutopilotBrandingReview({ state }: { state: WizardState }): React.JSX.Element | null {
  const customization = getRunCustomization(state);
  if (!customization) return null;
  const tasks = getEnabledTaskNames(customization);
  return (
    <section
      aria-labelledby="ab-review-title"
      className="rounded-2xl border border-border/80 bg-background/60 p-5 space-y-3"
    >
      <h3 id="ab-review-title" className="text-sm font-semibold">
        Autopilot Branding (customized)
      </h3>
      <p className="text-sm text-muted-foreground">
        The app package is built in this browser with these choices. {EXISTING_APP_NOTE}
      </p>
      <div>
        <p className="text-xs font-medium">
          Apps to remove ({customization.removedApps.length})
        </p>
        {customization.removedApps.length > 0 ? (
          <ul className="mt-1 grid gap-x-4 text-sm sm:grid-cols-2">
            {customization.removedApps.map((name) => (
              <li key={name} className="break-words">{formatAutopilotBrandingApp(name)}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">No apps are removed.</p>
        )}
      </div>
      <div>
        <p className="text-xs font-medium">Tasks that run ({tasks.length})</p>
        <ul className="mt-1 text-sm font-mono">
          {tasks.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
