import { describe, expect, it } from "vitest";

import { BATCH_CONFIG, getBatchConfig } from "@/lib/config/batchConfig";

describe("lib/config/batchConfig", () => {
  it("returns the fixed batch configuration", () => {
    expect(getBatchConfig()).toBe(BATCH_CONFIG);
    expect(BATCH_CONFIG).toEqual({
      defaultBatchSize: 20,
      delayBetweenBatches: 1000,
      enableBatching: true,
      categoryBatchSizes: {
        cisBaseline: 15,
      },
    });
  });
});
