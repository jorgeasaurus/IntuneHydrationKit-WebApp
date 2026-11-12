import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { GraphClient } from "@/lib/graph/client";
import { generateDriftCSV, generateDriftJSON } from "@/lib/hydration/drift/export";
import { runDriftScan } from "@/lib/hydration/drift/scan";
import { serveTemplateFiles } from "../../helpers/templateFiles";

const MARKER = "Imported by Intune Hydration Kit";

let restoreFetch: () => void;
beforeAll(() => {
  restoreFetch = serveTemplateFiles();
});
afterAll(() => restoreFetch());

function createClient() {
  const kitGroup = {
    id: "kit-group",
    displayName: "[IHD] Intune - Autopilot Devices",
    description: `All devices enrolled via Windows Autopilot ${MARKER}`,
  };
  const client = {
    getCollection: vi.fn(async (endpoint: string) => {
      if (endpoint.startsWith("/groups")) {
        return [
          kitGroup,
          { id: "admin-group", displayName: "Intune - Non-Autopilot Devices", description: "Admin copy" },
          { id: "orphan-group", displayName: "[IHD] Retired group", description: MARKER },
        ];
      }
      if (endpoint.startsWith("/identity/conditionalAccess")) throw new Error("[403] Forbidden");
      return [];
    }),
    get: vi.fn(async (endpoint: string) => {
      if (endpoint.startsWith("/groups/kit-group")) {
        return {
          ...kitGroup,
          groupTypes: ["DynamicMembership"],
          mailEnabled: false,
          securityEnabled: true,
          membershipRule: '(device.devicePhysicalIDs -any (_ -startsWith "[ZTDID]"))',
          membershipRuleProcessingState: "On",
        };
      }
      throw new Error(`Unexpected GET ${endpoint}`);
    }),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    batch: vi.fn(),
  };
  return client;
}

describe("runDriftScan", () => {
  it("reports kit objects, unmarked matches, missing templates, orphans, and unread caches with GET requests only", async () => {
    const client = createClient();
    const report = await runDriftScan(client as unknown as GraphClient, "tenant-1");

    expect(report.kitObjects).toEqual([
      expect.objectContaining({ category: "groups", objectId: "kit-group", marker: "present", comparison: expect.objectContaining({ status: "matches" }) }),
    ]);
    expect(report.unmarkedMatches).toEqual([
      expect.objectContaining({ objectId: "admin-group", marker: "missing", comparison: expect.objectContaining({ status: "cannotCompare" }) }),
    ]);
    expect(report.orphans).toEqual([{ objectType: "groups", objectId: "orphan-group", objectName: "[IHD] Retired group" }]);
    expect(report.missing.length).toBeGreaterThan(50);
    // Conditional Access could not be read: every CA template is reported as not checked, not as missing.
    expect(report.unchecked.filter((item) => item.category === "conditionalAccess")).toHaveLength(20);
    expect(report.missing.some((item) => item.category === "conditionalAccess")).toBe(false);
    expect(report.orphanTypesNotChecked).toEqual([
      { objectType: "Conditional Access policies", reason: "Could not read the existing Conditional Access policies ([403] Forbidden)." },
    ]);

    expect(client.post).not.toHaveBeenCalled();
    expect(client.patch).not.toHaveBeenCalled();
    expect(client.delete).not.toHaveBeenCalled();
    expect(client.batch).not.toHaveBeenCalled();

    const csv = generateDriftCSV(report).split("\n");
    expect(csv[0]).toContain('"Section","Category","Template"');
    expect(csv.some((row) => row.startsWith('"Kit object without template","groups"'))).toBe(true);
    expect(JSON.parse(generateDriftJSON(report))).toMatchObject({ reportType: "drift", tenantId: "tenant-1" });
  });
});
