import { z } from "@/lib/utils/zod";
import {
  TASK_CATEGORIES,
  type BaselineSelection,
  type CategorySelection,
  type CategorySelections,
  type CISCategoryId,
  type OIBPlatformId,
  type TaskCategory,
  type Win32AppsSelection,
  type WizardState,
} from "@/types/hydration";
import { autopilotBrandingCustomizationSchema } from "@/lib/win32/autopilotBrandingConfig";

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

/**
 * Zod shape for every key of T. The `satisfies` checks below fail to compile when the wizard
 * type gets a key that the schema does not have, so a stored scope can never drop a selection.
 */
type ShapeFor<T> = { [K in keyof Required<T>]: z.ZodType };

const baselineSelectionSchema = z.strictObject({
  platforms: z.array(z.enum(OIB_PLATFORM_IDS)),
  selectedPolicies: z.array(z.string()),
  excludedPolicies: z.array(z.string()),
} satisfies ShapeFor<BaselineSelection>);
const categorySelectionSchema = z.strictObject({
  selectedItems: z.array(z.string()),
} satisfies ShapeFor<CategorySelection>);
const win32AppsSelectionSchema = z.strictObject({
  selectedItems: z.array(z.string()),
  autopilotBranding: autopilotBrandingCustomizationSchema.optional(),
} satisfies ShapeFor<Win32AppsSelection>);

const categorySelectionsShape = {
  groups: categorySelectionSchema.optional(),
  filters: categorySelectionSchema.optional(),
  compliance: categorySelectionSchema.optional(),
  conditionalAccess: categorySelectionSchema.optional(),
  appProtection: categorySelectionSchema.optional(),
  win32Apps: win32AppsSelectionSchema.optional(),
  enrollment: categorySelectionSchema.optional(),
  notification: categorySelectionSchema.optional(),
  baseline: baselineSelectionSchema.optional(),
  cisBaseline: categorySelectionSchema.optional(),
} satisfies ShapeFor<CategorySelections>;

/** Category selection keys that a stored scope can keep. Tests compare it with the wizard categories. */
export const STORED_SELECTION_KEYS = Object.keys(categorySelectionsShape) as Array<keyof CategorySelections>;

/**
 * Strict schema: an unknown key is rejected, never removed. Removing a selection would make the
 * whole category selected, so "Run this for real" would create more than the preview checked.
 */
export const runScopeSchema = z.strictObject({
  selectedTargets: z.array(z.enum(TASK_CATEGORIES)).min(1),
  selectedCISCategories: z.array(z.enum(CIS_CATEGORY_IDS)),
  baselineSelection: baselineSelectionSchema.optional(),
  categorySelections: z.strictObject(categorySelectionsShape).optional(),
} satisfies ShapeFor<RunScope>);

/**
 * The scope to keep with a run, or undefined when the schema cannot keep it exactly.
 * Without a scope, "Run this for real" is not offered (fail closed).
 */
export function toStoredRunScope(scope: RunScope | undefined): RunScope | undefined {
  if (!scope) return undefined;
  const parsed = runScopeSchema.safeParse(scope);
  return parsed.success ? (parsed.data as RunScope) : undefined;
}

export const runLicensesSchema = z.strictObject({
  hasConditionalAccessLicense: z.boolean(),
  hasPremiumP2License: z.boolean(),
  hasWindowsDriverUpdateLicense: z.boolean(),
});

/**
 * The scope of a wizard run, or undefined when it cannot be kept exactly
 * (then the preview cannot be run for real from the dashboard).
 */
export function getWizardRunScope(state: WizardState): RunScope | undefined {
  return toStoredRunScope({
    selectedTargets: [...state.selectedTargets],
    selectedCISCategories: [...state.selectedCISCategories],
    ...(state.baselineSelection ? { baselineSelection: state.baselineSelection } : {}),
    ...(state.categorySelections ? { categorySelections: state.categorySelections } : {}),
  });
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
