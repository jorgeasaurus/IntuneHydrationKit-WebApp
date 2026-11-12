import { z } from "@/lib/utils/zod";
import {
  TASK_CATEGORIES,
  type BaselineSelection,
  type CategorySelections,
  type CISCategoryId,
  type OIBPlatformId,
  type TaskCategory,
  type WizardState,
} from "@/types/hydration";

/**
 * The wizard scope of a run. A preview keeps it, so that "Run this for real" can build the
 * same queue again through the normal queue builder. It never contains the wizard
 * confirmation: each live run needs a new acknowledgement.
 */
export interface RunScope {
  selectedTargets: TaskCategory[];
  selectedCISCategories: CISCategoryId[];
  baselineSelection?: BaselineSelection;
  categorySelections?: CategorySelections;
}

/** License results of the pre-flight check. The engine uses them to skip tasks that need a missing license. */
export interface RunLicenses {
  hasConditionalAccessLicense: boolean;
  hasPremiumP2License: boolean;
  hasWindowsDriverUpdateLicense: boolean;
}

const CIS_CATEGORY_IDS = [
  "cis-android",
  "cis-apple",
  "cis-browser",
  "cis-windows-cis",
  "cis-linux",
  "cis-endpoint-security",
  "cis-visual-studio",
  "cis-windows-11",
  "cis-cloud-pc",
] as const satisfies readonly CISCategoryId[];
const OIB_PLATFORM_IDS = ["WINDOWS", "MACOS", "BYOD", "WINDOWS365"] as const satisfies readonly OIBPlatformId[];

// Compile-time check: the lists above contain every ID of the union types.
type MissingCISCategory = Exclude<CISCategoryId, (typeof CIS_CATEGORY_IDS)[number]>;
type MissingOIBPlatform = Exclude<OIBPlatformId, (typeof OIB_PLATFORM_IDS)[number]>;
const allIdsListed: [MissingCISCategory, MissingOIBPlatform] extends [never, never] ? true : never = true;
void allIdsListed;

const baselineSelectionSchema = z.strictObject({
  platforms: z.array(z.enum(OIB_PLATFORM_IDS)),
  selectedPolicies: z.array(z.string()),
  excludedPolicies: z.array(z.string()),
});
const categorySelectionSchema = z.strictObject({ selectedItems: z.array(z.string()) });

export const runScopeSchema = z.strictObject({
  selectedTargets: z.array(z.enum(TASK_CATEGORIES)).min(1),
  selectedCISCategories: z.array(z.enum(CIS_CATEGORY_IDS)),
  baselineSelection: baselineSelectionSchema.optional(),
  // Unknown selection keys are removed instead of rejected, so a new wizard category cannot block the record.
  categorySelections: z
    .object({
      groups: categorySelectionSchema.optional(),
      filters: categorySelectionSchema.optional(),
      compliance: categorySelectionSchema.optional(),
      conditionalAccess: categorySelectionSchema.optional(),
      appProtection: categorySelectionSchema.optional(),
      win32Apps: categorySelectionSchema.optional(),
      enrollment: categorySelectionSchema.optional(),
      baseline: baselineSelectionSchema.optional(),
      cisBaseline: categorySelectionSchema.optional(),
    })
    .optional(),
});

export const runLicensesSchema = z.strictObject({
  hasConditionalAccessLicense: z.boolean(),
  hasPremiumP2License: z.boolean(),
  hasWindowsDriverUpdateLicense: z.boolean(),
});

/** The scope of a wizard run. */
export function getWizardRunScope(state: WizardState): RunScope {
  return {
    selectedTargets: [...state.selectedTargets],
    selectedCISCategories: [...state.selectedCISCategories],
    ...(state.baselineSelection ? { baselineSelection: state.baselineSelection } : {}),
    ...(state.categorySelections ? { categorySelections: state.categorySelections } : {}),
  };
}

/** The license results of the wizard pre-flight check, or undefined when the check did not run. */
export function getWizardRunLicenses(state: WizardState): RunLicenses | undefined {
  const licenses = state.prerequisiteResult?.licenses;
  if (!licenses) return undefined;
  return {
    hasConditionalAccessLicense: licenses.hasConditionalAccessLicense,
    hasPremiumP2License: licenses.hasPremiumP2License,
    hasWindowsDriverUpdateLicense: licenses.hasWindowsDriverUpdateLicense,
  };
}
