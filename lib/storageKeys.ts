export const APP_SETTINGS_STORAGE_KEY = "app-settings:v1";

export const EXECUTION_RECORD_STORAGE_KEY = "hydration-execution:v1";

/** Saved scope profiles. Device presets without tenant data. Sign-out does not clear them. */
export const SCOPE_PROFILES_STORAGE_KEY = "scope-profiles:v1";

/** Past run summaries for the signed-in account and tenant. Sign-out clears them. */
export const RUN_HISTORY_STORAGE_KEY = "run-history:v1";

/**
 * Run ID of a finished run that history could not store (storage blocked or full), so a
 * restored dashboard can try again. The ID can contain the tenant ID. Sign-out clears it.
 */
export const RUN_HISTORY_PENDING_STORAGE_KEY = "run-history-pending:v1";
