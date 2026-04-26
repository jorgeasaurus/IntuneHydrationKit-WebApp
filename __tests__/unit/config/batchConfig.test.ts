import { afterEach, describe, expect, it } from "vitest";

import {
  BATCH_CONFIG,
  getBatchConfig,
  getEffectiveBatchSize,
  resetBatchSize,
  setBatchSize,
} from "@/lib/config/batchConfig";

describe("lib/config/batchConfig", () => {
  afterEach(() => {
    resetBatchSize();
  });

  it("returns defaults when no runtime override is set", () => {
    expect(getBatchConfig()).toEqual(BATCH_CONFIG);
    expect(getEffectiveBatchSize()).toBe(BATCH_CONFIG.defaultBatchSize);
  });

  it("applies runtime overrides without mutating static config", () => {
    setBatchSize(7);

    expect(getBatchConfig()).toEqual({
      ...BATCH_CONFIG,
      defaultBatchSize: 7,
    });
    expect(getEffectiveBatchSize()).toBe(7);
    expect(BATCH_CONFIG.defaultBatchSize).toBe(20);
  });

  it("clamps runtime overrides to the supported range and resets cleanly", () => {
    setBatchSize(0);
    expect(getEffectiveBatchSize()).toBe(1);

    setBatchSize(999);
    expect(getEffectiveBatchSize()).toBe(BATCH_CONFIG.maxBatchSize);

    resetBatchSize();
    expect(getEffectiveBatchSize()).toBe(BATCH_CONFIG.defaultBatchSize);
  });
});
