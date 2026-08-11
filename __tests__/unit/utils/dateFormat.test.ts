import { describe, expect, it } from "vitest";
import { formatClockTime, formatDateTime, formatFileTimestamp } from "@/lib/utils/dateFormat";

describe("date formatting", () => {
  const date = new Date(2026, 3, 26, 9, 10, 11);

  it("formats display dates with the existing US English style", () => {
    expect(formatDateTime(date)).toBe("Apr 26, 2026, 9:10 AM");
  });

  it("formats clock and filename timestamps with padded values", () => {
    expect(formatClockTime(date)).toBe("09:10:11");
    expect(formatFileTimestamp(date)).toBe("2026-04-26-091011");
  });
});
