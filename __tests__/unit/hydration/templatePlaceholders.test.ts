import { describe, expect, it } from "vitest";

import { resolveOIBOrganizationId } from "@/lib/hydration/templatePlaceholders";

describe("resolveOIBOrganizationId", () => {
  it("returns an independent payload when no tenant ID is available", () => {
    const template = {
      settings: [
        {
          value: "%OrganizationId%",
        },
      ],
    };

    const resolved = resolveOIBOrganizationId(template);
    resolved.settings[0].value = "modified";

    expect(resolved).not.toBe(template);
    expect(template.settings[0].value).toBe("%OrganizationId%");
  });

  it("replaces organization IDs in nested payload values", () => {
    const resolved = resolveOIBOrganizationId(
      { settings: [{ value: "%OrganizationId%" }] },
      "12345678-1234-1234-1234-123456789abc"
    );

    expect(resolved.settings[0].value).toBe("12345678-1234-1234-1234-123456789abc");
  });
});
