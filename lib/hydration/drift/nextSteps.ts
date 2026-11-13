/**
 * What an administrator can do with each drift finding.
 *
 * The drift scan only reads. Every change goes through the wizard (create, update, delete)
 * or through the admin portal, so these texts name the path and its limit.
 */

import { planUpdate } from "../updateResolver";
import type { DriftItem } from "./scan";

export type DriftSectionId = "differs" | "missing" | "orphans" | "cannotCompare" | "unmarked" | "matches";

export interface DriftNextStep {
  /** "kit": the wizard can fix it. "manual": only the admin portal or delete-and-create can. */
  kind: "kit" | "manual";
  label: string;
  text: string;
}

const UPDATE_STEP: DriftNextStep = {
  kind: "kit",
  label: "Kit can update",
  text: "In the wizard, run Create with this item selected and turn on \"Update existing kit objects to match the template\".",
};

/** Next step for a kit object that differs from its template. */
export function getDifferenceNextStep(item: DriftItem): DriftNextStep {
  if (planUpdate(item.category, item.comparison).action === "update") return UPDATE_STEP;
  if (item.category === "conditionalAccess") {
    return {
      kind: "manual",
      label: "Change by hand",
      text: "The kit never changes a Conditional Access policy. Change the setting in the Entra admin center. Or delete the disabled policy with the kit, then create it again.",
    };
  }
  if (item.category === "filters") {
    return {
      kind: "manual",
      label: "Delete and create again",
      text: "The platform of a device filter cannot change after it is created. Delete the filter with the kit, then create it again. Assignments that use the filter must be assigned again.",
    };
  }
  return {
    kind: "manual",
    label: "Change by hand",
    text: "The kit cannot update this type. Change the setting in the admin portal. Or delete the object with the kit, then create it again.",
  };
}

/** What to do with a whole section of the report. */
export const SECTION_NEXT_STEPS: Record<DriftSectionId, string> = {
  differs:
    "A setting was changed in the tenant, or the template changed after the object was created. Decide for each object: keep the tenant value, or bring it back to the template. The kit can update the rules of groups and device filters. Other types are changed by hand, or deleted and created again.",
  missing:
    "These templates have no object in the tenant. To create them, run the wizard in Create mode and select them. Objects that exist are skipped. Some Conditional Access templates need an Entra ID P2 license and are skipped without it.",
  orphans:
    "These objects carry the kit marker but match no template name in the scanned categories. Objects from CIS Baseline templates and from renamed or removed templates show here. Keep the ones in use. To remove the others, run the wizard in Delete mode for their category: it deletes only objects with the kit marker.",
  cannotCompare:
    "The scan cannot compare the settings of these types, so they are neither a match nor a difference. No action is needed. Review them in the admin portal if you must confirm their settings.",
  unmarked:
    "These objects have a template name but were not created by the kit. The kit does not compare, update, or delete them, and Create mode skips their names. Rename or remove them if you want the kit version.",
  matches: "These objects match their templates. No action is needed.",
};
