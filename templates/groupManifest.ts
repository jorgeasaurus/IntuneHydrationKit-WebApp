/**
 * Lightweight group template manifest.
 *
 * Kept free of the full group template arrays so client components that only
 * need counts (e.g. the wizard UI) do not bundle every template. A unit test
 * asserts these counts stay in sync with templates/groups.ts.
 */

export const DYNAMIC_GROUP_TEMPLATE_COUNT = 59;
export const STATIC_GROUP_TEMPLATE_COUNT = 5;
export const GROUP_TEMPLATE_COUNT =
  DYNAMIC_GROUP_TEMPLATE_COUNT + STATIC_GROUP_TEMPLATE_COUNT;
