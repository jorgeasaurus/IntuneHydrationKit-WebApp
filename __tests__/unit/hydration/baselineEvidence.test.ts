import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { GraphClient } from "@/lib/graph/client";
import type { HydrationTask } from "@/types/hydration";
import { compareBaselinePayloads, recordBaselineMatch } from "@/lib/hydration/baselineEvidence";
import { classifyBaselineChange } from "@/lib/hydration/baselineChangeReview";

const setting = (id: string, value = "enabled") => ({ settingInstance: { settingDefinitionId: id, choiceSettingValue: { value } } });
const template = { name: "Policy - v4.0", platforms: "windows10", technologies: "mdm", settings: [setting("one"), setting("two")] };
const task = () => ({ id: "test", itemName: "Policy - v4.0", category: "baseline", operation: "create", status: "pending" }) as HydrationTask;

describe("baseline settings evidence", () => {
  it("compares owned settings without names, assignments, metadata or setting order", () => {
    const actual = { ...template, name: "Other name", assignments: [{ id: "assigned" }], id: "tenant-id", settings: [...template.settings].reverse() };
    expect(compareBaselinePayloads(template, actual, "SettingsCatalog").status).toBe("matches");
  });

  it("reports changed paths without exposing values", () => {
    const actual = { ...template, settings: [setting("one", "sensitive-value"), setting("two")] };
    const result = compareBaselinePayloads(template, actual, "SettingsCatalog");
    expect(result.status).toBe("different");
    expect(result.differences).toEqual(["settings[0].settingInstance.choiceSettingValue.value"]);
    expect(JSON.stringify(result)).not.toContain("sensitive-value");
  });

  it("does not claim equality when Graph omits an owned field", () => {
    const { platforms: _platforms, ...actual } = template;
    expect(compareBaselinePayloads(template, actual, "SettingsCatalog").status).toBe("notChecked");
  });

  it("does not claim equality for encrypted setting values", () => {
    const secret = { ...template, settings: [{ settingInstance: { simpleSettingValue: { "@odata.type": "#microsoft.graph.deviceManagementConfigurationSecretSettingValue", value: "secret" } } }] };
    expect(compareBaselinePayloads(secret, secret, "SettingsCatalog").status).toBe("notChecked");
  });

  it("records a normalized name and reads all settings without writes", async () => {
    const current = task();
    const client = { get: vi.fn().mockResolvedValue({ ...template, id: "existing" }), getCollection: vi.fn().mockResolvedValue(template.settings), post: vi.fn() };
    await recordBaselineMatch(current, template, { id: "existing", name: "Policy  - v4.0" }, "SettingsCatalog", client as unknown as GraphClient);
    expect(current.match).toMatchObject({ id: "existing", name: "Policy  - v4.0", matchType: "normalized" });
    expect(current.match?.portalUrl).toContain("PolicySummaryBlade/policyId/existing");
    expect(current.drift?.status).toBe("matches");
    expect(client.getCollection).toHaveBeenCalledWith("/deviceManagement/configurationPolicies/existing/settings");
    expect(client.post).not.toHaveBeenCalled();
  });

  it("preserves match evidence when settings cannot be read", async () => {
    const current = task();
    await recordBaselineMatch(current, template, { id: "existing", name: current.itemName.toUpperCase() }, "SettingsCatalog", { get: vi.fn().mockRejectedValue(new Error("403")) } as unknown as GraphClient);
    expect(current.match?.matchType).toBe("exact");
    expect(current.drift?.status).toBe("notChecked");
  });

  it("expands compliance actions and detects changed block grace periods", async () => {
    const current = task();
    const policy = { scheduledActionsForRule: [{ scheduledActionConfigurations: [{ actionType: "block", gracePeriodHours: 0 }] }] };
    const client = { get: vi.fn().mockResolvedValue({ scheduledActionsForRule: [{ scheduledActionConfigurations: [{ actionType: "block", gracePeriodHours: 12 }] }] }) };
    await recordBaselineMatch(current, policy, { id: "existing", name: current.itemName }, "CompliancePolicies", client as unknown as GraphClient);
    expect(client.get).toHaveBeenCalledWith(expect.stringContaining("?$expand=scheduledActionsForRule($expand=scheduledActionConfigurations)"));
    expect(current.drift?.status).toBe("different");
  });
});

describe("baseline change inventory", () => {
  it("keeps normalized existing matches and reports only lower versions of the same policy", () => {
    const result = classifyBaselineChange("policy.json", "[IHD] Policy - v4.0", "SettingsCatalog", [
      { id: "same", name: "[IHD] Policy  - v4.0" }, { id: "older", name: "[IHD] Policy - v3.10" },
      { id: "newer", name: "[IHD] Policy - v10.0" }, { id: "other", name: "[IHD] Other - v3.0" },
    ]);
    expect(result.status).toBe("existing");
    expect(result.matchType).toBe("normalized");
    expect(result.olderVersions.map((policy) => policy.id)).toEqual(["older"]);
  });

  it("distinguishes unavailable inventory from a confirmed missing policy", () => {
    expect(classifyBaselineChange("p", "Policy", "SettingsCatalog").status).toBe("unavailable");
    expect(classifyBaselineChange("p", "Policy", "SettingsCatalog", []).status).toBe("new");
  });

  it("preserves compliance matching instead of applying settings-catalog normalization", () => {
    expect(classifyBaselineChange("p", "Policy - v4.0", "CompliancePolicies", [{ id: "id", displayName: "Policy  - v4.0" }]).status).toBe("new");
  });
});

function localAdministratorTemplate(): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(process.cwd(), "public/IntuneTemplates/OpenIntuneBaseline/WINDOWS/IntuneManagement/SettingsCatalog/Win - OIB - ES - Local Group Membership - D - Local Administrators - v3.7.json"), "utf8"));
}

function visitObjects(value: unknown, visit: (record: Record<string, unknown>) => void): void {
  if (Array.isArray(value)) value.forEach((item) => visitObjects(item, visit));
  else if (value && typeof value === "object") {
    visit(value as Record<string, unknown>);
    Object.values(value).forEach((nested) => visitObjects(nested, visit));
  }
}

function memberCollection(policy: Record<string, unknown>): Array<Record<string, unknown>> {
  let members: Array<Record<string, unknown>> = [];
  visitObjects(policy, (record) => {
    if (String(record.settingDefinitionId).endsWith("accessgroup_users")) members = record.simpleSettingCollectionValue as Array<Record<string, unknown>>;
  });
  return members;
}

describe("local administrator comparison", () => {
  it("accepts omitted type annotations and reordered children without false drift", () => {
    const expected = localAdministratorTemplate();
    const actual = structuredClone(expected);
    visitObjects(actual, (record) => {
      delete record["@odata.type"];
      if (Array.isArray(record.children)) record.children.reverse();
    });
    expect(compareBaselinePayloads(expected, actual, "SettingsCatalog").status).toBe("matches");
  });

  it("reports present conflicting type annotations", () => {
    const expected = localAdministratorTemplate();
    const actual = structuredClone(expected);
    memberCollection(actual)[0]["@odata.type"] = "#microsoft.graph.deviceManagementConfigurationIntegerSettingValue";
    const result = compareBaselinePayloads(expected, actual, "SettingsCatalog");
    expect(result.status).toBe("different");
    expect(result.differences.some((field) => field.endsWith("@odata.type"))).toBe(true);
  });

  it("ignores member ordering but preserves duplicate counts", () => {
    const expected = localAdministratorTemplate();
    memberCollection(expected).push({ "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue", settingValueTemplateReference: null, value: "AnotherMember" });
    const actual = structuredClone(expected);
    memberCollection(actual).reverse();
    expect(compareBaselinePayloads(expected, actual, "SettingsCatalog").status).toBe("matches");
    memberCollection(actual).push({ ...memberCollection(actual)[0] });
    expect(compareBaselinePayloads(expected, actual, "SettingsCatalog").status).toBe("different");
  });

  it("summarizes membership counts without values or security claims", () => {
    const expected = localAdministratorTemplate();
    const actual = structuredClone(expected);
    memberCollection(actual).push({ ...memberCollection(actual)[0], value: "PrivateTenantMember" });
    visitObjects(actual, (record) => { delete record["@odata.type"]; });
    const result = compareBaselinePayloads(expected, actual, "SettingsCatalog");
    expect(result.status).toBe("different");
    expect(result.reason).toContain("Local administrator members differ from the baseline (baseline: 1; tenant: 2)");
    expect(result.reason).toContain("The existing policy was not changed.");
    expect(result.reason).not.toContain("could not be checked");
    expect(JSON.stringify(result)).not.toContain("PrivateTenantMember");
    expect(JSON.stringify(result)).not.toContain("WLapsAdmin");
    expect(result.differences).toHaveLength(1);
  });

  it("reports incomplete evidence when only one reordered member omits an owned field", () => {
    const expected = localAdministratorTemplate();
    memberCollection(expected).push({ ...memberCollection(expected)[0], value: "AnotherMember" });
    const actual = structuredClone(expected);
    delete memberCollection(actual)[1].settingValueTemplateReference;
    memberCollection(actual).reverse();
    const result = compareBaselinePayloads(expected, actual, "SettingsCatalog");
    expect(result.status).toBe("notChecked");
    expect(result.differences).toEqual([]);
    expect(result.reason).toContain("1 field(s) could not be checked");
  });

  it("does not reuse a returned member for two baseline members", () => {
    const expected = localAdministratorTemplate();
    memberCollection(expected).push({ ...memberCollection(expected)[0] });
    const actual = structuredClone(expected);
    memberCollection(actual)[1].value = "DifferentMember";
    delete memberCollection(actual)[1].settingValueTemplateReference;
    const result = compareBaselinePayloads(expected, actual, "SettingsCatalog");
    expect(result.status).toBe("different");
    expect(result.reason).toContain("baseline: 2; tenant: 2");
  });

  it("assigns incomplete members without consuming another member's only match", () => {
    const expected = { simpleSettingCollectionValue: [{ value: "first" }, { value: "second" }] };
    const actual = { simpleSettingCollectionValue: [{}, { value: "first" }] };
    expect(compareBaselinePayloads(expected, actual, "SettingsCatalog").status).toBe("notChecked");
  });

  it("detects changed membership even when the counts match", () => {
    const expected = localAdministratorTemplate();
    const actual = structuredClone(expected);
    memberCollection(actual)[0].value = "DifferentMember";
    const result = compareBaselinePayloads(expected, actual, "SettingsCatalog");
    expect(result.status).toBe("different");
    expect(result.reason).toContain("baseline: 1; tenant: 1");
  });

  it("keeps order significant for arrays without known set semantics", () => {
    const expected = { rules: ["first", "second"] };
    expect(compareBaselinePayloads(expected, { rules: ["second", "first"] }, "CompliancePolicies").status).toBe("different");
  });
});
