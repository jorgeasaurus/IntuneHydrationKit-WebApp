import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { resolveOIBOrganizationId } from "@/lib/hydration/templatePlaceholders";
import manifest from "@/public/IntuneTemplates/OpenIntuneBaseline/manifest.json";

const ORGANIZATION_ID_PLACEHOLDER = "%OrganizationId%";
const OIB_ROOT = path.join(process.cwd(), "public/IntuneTemplates/OpenIntuneBaseline");
const EXPECTED_ORGANIZATION_ID_TEMPLATES = [
  "MACOS/IntuneManagement/SettingsCatalog/MacOS - OIB - Microsoft OneDrive - U - Known Folder Move - v1.0.json",
  "WINDOWS/IntuneManagement/SettingsCatalog/Win - OIB - SC - Microsoft OneDrive - D - Configuration - v3.2.json",
  "WINDOWS/IntuneManagement/SettingsCatalog/Win - OIB - SC - Microsoft OneDrive - U - Configuration - v3.8.json",
];

function readOIBTemplate(templatePath: string): unknown {
  const buffer = readFileSync(path.join(OIB_ROOT, templatePath));
  const text = buffer[0] === 0xff && buffer[1] === 0xfe
    ? buffer.subarray(2).toString("utf16le")
    : buffer.toString("utf8");

  return JSON.parse(text.replace(/\0/g, ""));
}

function countOrganizationIdPlaceholders(value: unknown): number {
  if (typeof value === "string") {
    return [...value.matchAll(/%OrganizationId%/g)].length;
  }

  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + countOrganizationIdPlaceholders(item), 0);
  }

  if (value && typeof value === "object") {
    return Object.values(value).reduce(
      (total, item) => total + countOrganizationIdPlaceholders(item),
      0
    );
  }

  return 0;
}

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

  it("resolves every OrganizationId placeholder in the bundled OIB templates", () => {
    const organizationIdTemplates = manifest.files
      .map((file) => file.path)
      .filter((templatePath) => countOrganizationIdPlaceholders(readOIBTemplate(templatePath)) > 0);

    expect(organizationIdTemplates).toEqual(EXPECTED_ORGANIZATION_ID_TEMPLATES);

    const tenantId = "12345678-1234-1234-1234-123456789abc";
    const totalPlaceholders = organizationIdTemplates.reduce((total, templatePath) => {
      const template = readOIBTemplate(templatePath);
      const resolved = resolveOIBOrganizationId(template, tenantId);

      expect(countOrganizationIdPlaceholders(template)).toBeGreaterThan(0);
      expect(countOrganizationIdPlaceholders(resolved)).toBe(0);
      expect(JSON.stringify(resolved)).toContain(tenantId);

      return total + countOrganizationIdPlaceholders(template);
    }, 0);

    expect(totalPlaceholders).toBe(5);
  });
});
