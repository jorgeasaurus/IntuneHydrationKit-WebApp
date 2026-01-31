/**
 * Batch configuration for Microsoft Graph API batch operations
 * Allows configurable batch sizes and feature flags
 */

export interface BatchConfiguration {
  /** Number of requests per batch (default: 10, max: 20) */
  defaultBatchSize: number;
  /** Microsoft Graph API maximum batch size */
  maxBatchSize: number;
  /** Delay in milliseconds between batch submissions */
  delayBetweenBatches: number;
  /** Feature flag to enable/disable batching (fallback to sequential) */
  enableBatching: boolean;
}

/**
 * Default batch configuration
 * Modify defaultBatchSize to change batch sizes across the application
 */
export const BATCH_CONFIG: BatchConfiguration = {
  defaultBatchSize: 20,
  maxBatchSize: 20,
  delayBetweenBatches: 2000,
  enableBatching: true,
};

// Runtime configuration storage
let runtimeBatchSize: number | null = null;

/**
 * Get current batch configuration with any runtime overrides
 */
export function getBatchConfig(): BatchConfiguration {
  return {
    ...BATCH_CONFIG,
    defaultBatchSize: runtimeBatchSize ?? BATCH_CONFIG.defaultBatchSize,
  };
}

/**
 * Override batch size at runtime
 * @param size - New batch size (clamped to 1-20)
 */
export function setBatchSize(size: number): void {
  runtimeBatchSize = Math.max(1, Math.min(size, BATCH_CONFIG.maxBatchSize));
}

/**
 * Reset batch size to default
 */
export function resetBatchSize(): void {
  runtimeBatchSize = null;
}

/**
 * Get effective batch size (with runtime override if set)
 */
export function getEffectiveBatchSize(): number {
  return runtimeBatchSize ?? BATCH_CONFIG.defaultBatchSize;
}
