/**
 * Batch configuration for Microsoft Graph API batch operations
 * Allows configurable batch sizes and feature flags
 */

export interface BatchConfiguration {
  /** Number of requests per batch */
  readonly defaultBatchSize: number;
  /** Delay in milliseconds between batch submissions */
  readonly delayBetweenBatches: number;
  /** Feature flag to enable/disable batching (fallback to sequential) */
  readonly enableBatching: boolean;
  /** Per-category batch size overrides (categories not listed use defaultBatchSize) */
  readonly categoryBatchSizes?: Readonly<Record<string, number>>;
}

/**
 * Default batch configuration
 * Modify defaultBatchSize to change batch sizes across the application
 */
export const BATCH_CONFIG: BatchConfiguration = Object.freeze({
  defaultBatchSize: 20,
  delayBetweenBatches: 1000,
  enableBatching: true,
  categoryBatchSizes: Object.freeze({
    // Both categories can write to /deviceManagement/configurationPolicies.
    baseline: 15,
    cisBaseline: 15,
  }),
});

/**
 * Get the fixed batch configuration
 */
export function getBatchConfig(): BatchConfiguration {
  return BATCH_CONFIG;
}
