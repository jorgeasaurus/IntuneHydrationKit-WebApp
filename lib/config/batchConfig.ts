/**
 * Batch configuration for Microsoft Graph API batch operations
 * Allows configurable batch sizes and feature flags
 */

export interface BatchConfiguration {
  /** Number of requests per batch */
  defaultBatchSize: number;
  /** Delay in milliseconds between batch submissions */
  delayBetweenBatches: number;
  /** Feature flag to enable/disable batching (fallback to sequential) */
  enableBatching: boolean;
  /** Per-category batch size overrides (categories not listed use defaultBatchSize) */
  categoryBatchSizes?: Record<string, number>;
}

/**
 * Default batch configuration
 * Modify defaultBatchSize to change batch sizes across the application
 */
export const BATCH_CONFIG: BatchConfiguration = {
  defaultBatchSize: 20,
  delayBetweenBatches: 1000,
  enableBatching: true,
  categoryBatchSizes: {
    // CIS baselines write to /deviceManagement/configurationPolicies (settings catalog),
    // hitting the per-tenant deviceintent.tenant.app.write throttle bucket.
    // Smaller batches avoid overwhelming this limit.
    cisBaseline: 15,
  },
};

/**
 * Get the fixed batch configuration
 */
export function getBatchConfig(): BatchConfiguration {
  return BATCH_CONFIG;
}
