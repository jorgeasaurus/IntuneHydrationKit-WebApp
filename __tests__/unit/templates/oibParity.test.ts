import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createBaselineCompliancePolicy,
  createSettingsCatalogPolicy,
} from "@/lib/hydration/policyCreators";
import { fetchBaselinePolicyByManifestFile, fetchOIBManifest } from "@/lib/templates/loader";

function expectNoExportMetadata(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(expectNoExportMetadata);
  } else if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      expect(key).not.toMatch(/^(id|assignments|createdDateTime|lastModifiedDateTime|version)$/);
      expect(key).not.toMatch(/^_oib|^#/);
      if (key !== "@odata.type") expect(key).not.toContain("@odata.");
      expectNoExportMetadata(nested);
    }
  }
}

describe("bundled OpenIntuneBaseline PowerShell parity", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const filePath = path.join(process.cwd(), "public", decodeURIComponent(url));
      return new Response(new Uint8Array(readFileSync(filePath)));
    }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("loads all nine v4 Windows compliance policies and preserves block action grace periods", async () => {
    const manifest = await fetchOIBManifest();
    const files = manifest!.files.filter((file) =>
      file.platform === "WINDOWS" && file.policyType === "CompliancePolicies"
    );
    expect(files).toHaveLength(9);

    for (const file of files) {
      expect(file.path).toMatch(/ - v4\.0\.json$/);
      const policy = await fetchBaselinePolicyByManifestFile(file);
      expect(policy).not.toBeNull();
      const source = JSON.stringify(policy);
      const post = vi.fn().mockResolvedValue({ id: "created-policy" });
      await createBaselineCompliancePolicy(
        { post } as unknown as Parameters<typeof createBaselineCompliancePolicy>[0],
        policy!
      );

      expect(post).toHaveBeenCalledOnce();
      const [endpoint, payload] = post.mock.calls[0];
      expect(endpoint).toBe("/deviceManagement/deviceCompliancePolicies");
      expect(payload.displayName).toMatch(/^\[IHD\] /);
      expect(payload.description).toContain("Imported by Intune Hydration Kit");
      expect(payload["@odata.type"]).toBe("#microsoft.graph.windows10CompliancePolicy");
      expect(payload.scheduledActionsForRule).toEqual([
        expect.objectContaining({
          scheduledActionConfigurations: [expect.objectContaining({
            actionType: "block",
            gracePeriodHours: file.path.includes(" - BitLocker - ") ? 12 : 0,
          })],
        }),
      ]);
      expectNoExportMetadata(payload);
      expect(JSON.stringify(policy)).toBe(source);
    }
  });

  it("loads the updated audit policy and retains its configured setting values", async () => {
    const manifest = await fetchOIBManifest();
    const file = manifest!.files.find((item) => item.path.endsWith(
      "Win - OIB - SC - Device Security - D - Audit and Event Logging - v4.0.json"
    ));
    expect(file).toBeDefined();
    expect(file!.policyType).toBe("SettingsCatalog");
    const policy = await fetchBaselinePolicyByManifestFile(file!);
    const source = JSON.stringify(policy);
    const post = vi.fn().mockResolvedValue({ id: "created-policy" });
    await createSettingsCatalogPolicy(
      { post } as unknown as Parameters<typeof createSettingsCatalogPolicy>[0],
      policy!
    );

    expect(post).toHaveBeenCalledOnce();
    const [endpoint, payload] = post.mock.calls[0];
    expect(endpoint).toBe("/deviceManagement/configurationPolicies");
    expect(payload.name).toBe("[IHD] Win - OIB - SC - Device Security - D - Audit and Event Logging - v4.0");
    expect(payload.description).toContain("Imported by Intune Hydration Kit");
    expect(payload).not.toHaveProperty("displayName");
    expect(payload.settings).toHaveLength(policy!.settings!.length);
    expect(payload.settings).toContainEqual(expect.objectContaining({
      settingInstance: expect.objectContaining({
        settingDefinitionId: "device_vendor_msft_policy_config_admx_auditsettings_includecmdline",
        choiceSettingValue: expect.objectContaining({
          value: "device_vendor_msft_policy_config_admx_auditsettings_includecmdline_1",
        }),
      }),
    }));
    expectNoExportMetadata(payload);
    expect(JSON.stringify(policy)).toBe(source);
  });
});
