import { describe, expect, it } from "vitest";

import robots from "@/app/robots";

describe("robots", () => {
  it("lets crawlers fetch app routes so they can read the noindex metadata", () => {
    const result = robots();

    expect(result.rules).toEqual({ userAgent: "*", allow: "/" });
    expect(result).not.toHaveProperty("host");
    expect(result.sitemap).toMatch(/\/sitemap\.xml$/);
  });
});
