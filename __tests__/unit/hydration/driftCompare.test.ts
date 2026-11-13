import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildConditionalAccessCreatePlan } from "@/lib/graph/conditionalAccess";
import {
  fetchBaselinePolicies,
  fetchCompliancePolicies,
  fetchConditionalAccessPolicies,
  fetchDynamicGroups,
  fetchFilters,
  fetchStaticGroups,
  type BaselinePolicy,
  type ComplianceTemplate,
  type ConditionalAccessTemplate,
  type FilterTemplate,
  type GroupTemplate,
} from "@/lib/templates/loader";
import { cleanPolicyRecursively, cleanSettingsCatalogPolicy } from "@/lib/hydration/cleaners";
import { compareWithTemplate, formatDifference, type CompareKind } from "@/lib/hydration/drift/compare";
import { buildFilterCreateBody, buildGroupCreateBody } from "@/lib/hydration/existingObjects";
import { resolveOIBOrganizationId } from "@/lib/hydration/templatePlaceholders";
import { reverseKeys, serveTemplateFiles } from "../../helpers/templateFiles";

type JsonRecord = Record<string, unknown>;

const TENANT_ID = "11111111-2222-3333-4444-555555555555";
const ZERO_GUID = "00000000-0000-0000-0000-000000000000";

/*
 * Simulated Graph reads of a freshly created object. Each one adds the server fields
 * that Graph returns (IDs, timestamps, version counters, OData annotations, defaults for
 * unset properties) and reverses the property order. These shapes are assumptions about
 * Graph; they are documented in the PR.
 */

function graphGroup(body: JsonRecord): JsonRecord {
  return reverseKeys({
    "@odata.context": "https://graph.microsoft.com/v1.0/$metadata#groups/$entity",
    id: "group-id",
    deletedDateTime: null,
    classification: null,
    createdDateTime: "2026-01-01T00:00:00Z",
    description: body.description,
    displayName: body.displayName,
    groupTypes: body.groupTypes,
    mailEnabled: body.mailEnabled,
    mailNickname: body.mailNickname,
    membershipRule: body.membershipRule ?? null,
    membershipRuleProcessingState: body.membershipRuleProcessingState ?? null,
    securityEnabled: body.securityEnabled,
    securityIdentifier: "S-1-12-1",
    proxyAddresses: [],
  });
}

function graphFilter(body: JsonRecord): JsonRecord {
  return reverseKeys({
    "@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/assignmentFilters/$entity",
    id: "filter-id",
    createdDateTime: "2026-01-01T00:00:00Z",
    lastModifiedDateTime: "2026-01-01T00:00:00Z",
    displayName: body.displayName,
    description: body.description,
    platform: body.platform,
    rule: body.rule,
    roleScopeTags: ["0"],
    payloads: [],
    assignmentFilterManagementType: "devices",
  });
}

const CA_DEFAULTS = {
  conditions: {
    userRiskLevels: [],
    signInRiskLevels: [],
    clientAppTypes: [],
    servicePrincipalRiskLevels: [],
    platforms: null,
    locations: null,
    devices: null,
    clientApplications: null,
    applications: {
      includeApplications: [],
      excludeApplications: [],
      includeUserActions: [],
      includeAuthenticationContextClassReferences: [],
      applicationFilter: null,
    },
    users: {
      includeUsers: [],
      excludeUsers: [],
      includeGroups: [],
      excludeGroups: [],
      includeRoles: [],
      excludeRoles: [],
      includeGuestsOrExternalUsers: null,
      excludeGuestsOrExternalUsers: null,
    },
  },
  grantControls: null,
  sessionControls: null,
};

function merge(base: unknown, override: unknown): unknown {
  if (override === undefined) return base;
  if (!base || typeof base !== "object" || Array.isArray(base) || !override || typeof override !== "object" || Array.isArray(override)) {
    return override;
  }
  const result: JsonRecord = { ...(base as JsonRecord) };
  for (const [key, value] of Object.entries(override as JsonRecord)) result[key] = merge(result[key], value);
  return result;
}

/** Reverse every array of strings, as a stand-in for Graph returning collections in another order. */
function reverseStringArrays(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map(reverseStringArrays);
    return items.every((item) => typeof item === "string") ? items.toReversed() : items;
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as JsonRecord).map(([key, nested]) => [key, reverseStringArrays(nested)]));
}

function graphConditionalAccess(template: JsonRecord): JsonRecord {
  const { payload } = buildConditionalAccessCreatePlan(template);
  return reverseKeys(
    reverseStringArrays({
      ...(merge(CA_DEFAULTS, payload) as JsonRecord),
      "@odata.context": "https://graph.microsoft.com/beta/$metadata#identity/conditionalAccess/policies/$entity",
      id: "policy-id",
      templateId: null,
      createdDateTime: "2026-01-01T00:00:00Z",
      modifiedDateTime: null,
      state: "disabled",
    }) as JsonRecord
  );
}

function graphCompliance(template: JsonRecord): JsonRecord {
  const body = cleanPolicyRecursively(template) as JsonRecord;
  const actions = Array.isArray(body.scheduledActionsForRule)
    ? (body.scheduledActionsForRule as JsonRecord[]).map((rule, index) => ({
        id: `rule-${index}`,
        ruleName: null,
        scheduledActionConfigurations: ((rule.scheduledActionConfigurations as JsonRecord[]) ?? [])
          .map((configuration, configIndex) => ({
            ...configuration,
            id: `config-${configIndex}`,
            notificationTemplateId: configuration.notificationTemplateId || ZERO_GUID,
          }))
          .toReversed(),
      }))
    : undefined;
  return reverseKeys({
    ...body,
    "@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceCompliancePolicies/$entity",
    id: "compliance-id",
    createdDateTime: "2026-01-01T00:00:00Z",
    lastModifiedDateTime: "2026-01-01T00:00:00Z",
    version: 3,
    ...(actions ? { scheduledActionsForRule: actions } : {}),
  });
}

function graphSettingsCatalog(template: JsonRecord): JsonRecord {
  const body = cleanSettingsCatalogPolicy(template);
  const reference = body.templateReference as { templateId?: string } | undefined;
  return reverseKeys({
    ...body,
    id: "policy-id",
    createdDateTime: "2026-01-01T00:00:00Z",
    lastModifiedDateTime: "2026-01-01T00:00:00Z",
    settingCount: (body.settings as unknown[]).length,
    creationSource: null,
    isAssigned: false,
    roleScopeTagIds: body.roleScopeTagIds ?? ["0"],
    templateReference: { templateId: reference?.templateId ?? "", templateFamily: "none", templateDisplayName: null, templateDisplayVersion: null },
    settings: (body.settings as JsonRecord[]).map((setting, index) => ({ id: String(index), ...setting })).toReversed(),
  });
}

function graphDeviceConfiguration(template: JsonRecord): JsonRecord {
  return reverseKeys({
    ...(cleanPolicyRecursively(template) as JsonRecord),
    id: "configuration-id",
    createdDateTime: "2026-01-01T00:00:00Z",
    lastModifiedDateTime: "2026-01-01T00:00:00Z",
    version: 2,
    supportsScopeTags: true,
    roleScopeTagIds: ["0"],
  });
}

let restoreFetch: () => void;
let groups: GroupTemplate[];
let filters: FilterTemplate[];
let conditionalAccess: ConditionalAccessTemplate[];
let compliance: ComplianceTemplate[];
let baseline: BaselinePolicy[];

beforeAll(async () => {
  restoreFetch = serveTemplateFiles();
  groups = [...(await fetchDynamicGroups()), ...(await fetchStaticGroups())];
  filters = await fetchFilters();
  conditionalAccess = await fetchConditionalAccessPolicies();
  compliance = await fetchCompliancePolicies();
  baseline = await fetchBaselinePolicies();
});

afterAll(() => restoreFetch());

describe("template files are loaded", () => {
  it("loads every category from public/IntuneTemplates", () => {
    expect(groups.length).toBeGreaterThan(10);
    expect(filters.length).toBeGreaterThan(10);
    expect(conditionalAccess.length).toBe(20);
    expect(compliance.length).toBe(10);
    expect(baseline.length).toBeGreaterThan(90);
  });
});

describe("groups", () => {
  it("reports an untouched group as matching, for every dynamic and static group template", () => {
    for (const template of groups) {
      const body = buildGroupCreateBody(template) as unknown as JsonRecord;
      const result = compareWithTemplate("group", template as unknown as JsonRecord, graphGroup(body));
      expect(result.status, template.displayName).toBe("matches");
    }
  });

  it("ignores case and white space in the membership rule", () => {
    const template = groups.find((group) => group.membershipRule)!;
    const body = buildGroupCreateBody(template) as unknown as JsonRecord;
    const rule = `  ${String(body.membershipRule).toUpperCase().replace(/ /g, "   ")} `;
    expect(compareWithTemplate("group", template as unknown as JsonRecord, graphGroup({ ...body, membershipRule: rule })).status).toBe("matches");
  });

  it("reports a changed membership rule with the template and tenant values", () => {
    const template = groups.find((group) => group.membershipRule)!;
    const body = buildGroupCreateBody(template) as unknown as JsonRecord;
    const result = compareWithTemplate(
      "group",
      template as unknown as JsonRecord,
      graphGroup({ ...body, membershipRule: '(device.deviceOSType -eq "Linux")' })
    );
    expect(result.status).toBe("differs");
    expect(result.differences).toEqual([
      {
        path: "membershipRule",
        template: JSON.stringify(String(template.membershipRule).replace(/\s+/g, " ").trim().toLowerCase()),
        tenant: JSON.stringify('(device.deviceostype -eq "linux")'),
      },
    ]);
  });

  it("reports a paused membership rule", () => {
    const template = groups.find((group) => group.membershipRule)!;
    const body = buildGroupCreateBody(template) as unknown as JsonRecord;
    const result = compareWithTemplate("group", template as unknown as JsonRecord, graphGroup({ ...body, membershipRuleProcessingState: "Paused" }));
    expect(result.differences.map((difference) => difference.path)).toEqual(["membershipRuleProcessingState"]);
  });

  it("does not compare the name or the description", () => {
    const template = groups[0];
    const body = buildGroupCreateBody(template) as unknown as JsonRecord;
    const actual = graphGroup({ ...body, displayName: "Renamed", description: "Edited" });
    expect(compareWithTemplate("group", template as unknown as JsonRecord, actual).status).toBe("matches");
  });
});

describe("device filters", () => {
  it("reports an untouched filter as matching, for every filter template", () => {
    for (const template of filters) {
      const body = buildFilterCreateBody(template) as unknown as JsonRecord;
      expect(compareWithTemplate("filter", template as unknown as JsonRecord, graphFilter(body)).status, template.displayName).toBe("matches");
    }
  });

  it("reports a changed rule with values", () => {
    const template = filters[0];
    const body = buildFilterCreateBody(template) as unknown as JsonRecord;
    const result = compareWithTemplate("filter", template as unknown as JsonRecord, graphFilter({ ...body, rule: '(device.model -eq "X")' }));
    expect(result.status).toBe("differs");
    expect(result.differences).toHaveLength(1);
    expect(result.differences[0].path).toBe("rule");
    expect(formatDifference(result.differences[0])).toContain('tenant "(device.model -eq \\"x\\")"');
  });

  it("accepts an enum value in another case", () => {
    const template = filters.find((filter) => filter.platform === "windows10AndLater")!;
    const body = buildFilterCreateBody(template) as unknown as JsonRecord;
    expect(compareWithTemplate("filter", template as unknown as JsonRecord, graphFilter({ ...body, platform: "Windows10AndLater" })).status).toBe("matches");
  });
});

describe("Conditional Access", () => {
  it("reports an untouched policy as matching, for every Conditional Access template", () => {
    for (const template of conditionalAccess) {
      const result = compareWithTemplate("conditionalAccess", template as unknown as JsonRecord, graphConditionalAccess(template as unknown as JsonRecord));
      expect(result.status, `${template.displayName}: ${result.reason} ${result.differences.map(formatDifference).join("; ")}`).toBe("matches");
    }
  });

  it("does not compare the state or the display name", () => {
    const template = conditionalAccess[0] as unknown as JsonRecord;
    const actual = { ...graphConditionalAccess(template), state: "enabled", displayName: "Renamed" };
    expect(compareWithTemplate("conditionalAccess", template, actual).status).toBe("matches");
  });

  it("accepts enum values in another case", () => {
    const template = conditionalAccess.find((policy) => policy.displayName.includes("Block legacy authentication"))! as unknown as JsonRecord;
    const actual = graphConditionalAccess(template);
    const conditions = actual.conditions as JsonRecord;
    conditions.clientAppTypes = ["ExchangeActiveSync", "Other"];
    (actual.grantControls as JsonRecord).operator = "or";
    expect(compareWithTemplate("conditionalAccess", template, actual).status).toBe("matches");
  });

  it("reports an added exclusion group with values", () => {
    const template = conditionalAccess.find((policy) => policy.displayName.includes("Block legacy authentication"))! as unknown as JsonRecord;
    const actual = graphConditionalAccess(template);
    ((actual.conditions as JsonRecord).users as JsonRecord).excludeGroups = ["AAAA-group"];
    const result = compareWithTemplate("conditionalAccess", template, actual);
    expect(result.status).toBe("differs");
    expect(result.differences).toEqual([{ path: "conditions.users.excludeGroups", template: "[]", tenant: '["aaaa-group"]' }]);
  });
});

describe("compliance", () => {
  it("reports an untouched policy as matching, or cannot compare for script and Settings Catalog compliance", () => {
    for (const template of compliance) {
      const result = compareWithTemplate("compliance", template as JsonRecord, graphCompliance(template as JsonRecord));
      const expectedStatus = template.deviceCompliancePolicyScript || !template["@odata.type"] ? "cannotCompare" : "matches";
      expect(result.status, `${template.displayName}: ${result.reason} ${result.differences.map(formatDifference).join("; ")}`).toBe(expectedStatus);
    }
  });

  it("reports a changed setting with values", () => {
    const template = compliance.find((policy) => policy["@odata.type"] === "#microsoft.graph.iosCompliancePolicy")! as JsonRecord;
    const actual = { ...graphCompliance(template), passcodeMinimumLength: 4 };
    const result = compareWithTemplate("compliance", template, actual);
    expect(result.status).toBe("differs");
    expect(result.differences).toEqual([{ path: "passcodeMinimumLength", template: String(template.passcodeMinimumLength), tenant: "4" }]);
  });

  it("reports a changed scheduled action grace period", () => {
    const template = compliance.find((policy) => policy["@odata.type"] === "#microsoft.graph.iosCompliancePolicy")! as JsonRecord;
    const actual = graphCompliance(template);
    const configurations = (actual.scheduledActionsForRule as JsonRecord[])[0].scheduledActionConfigurations as JsonRecord[];
    configurations.find((configuration) => configuration.actionType === "block")!.gracePeriodHours = 24;
    const result = compareWithTemplate("compliance", template, actual);
    expect(result.status).toBe("differs");
    expect(result.differences.map((difference) => difference.path)).toEqual([
      "scheduledActionsForRule[0].scheduledActionConfigurations[0].gracePeriodHours",
    ]);
  });
});

function baselineKind(template: BaselinePolicy): CompareKind | undefined {
  switch (template._oibPolicyType) {
    case "AppProtection":
      return undefined;
    case "CompliancePolicies":
      return "compliance";
    case "DeviceConfiguration":
    case "UpdatePolicies":
      return "DeviceConfiguration";
    case "DriverUpdateProfiles":
      return "DriverUpdateProfiles";
    default:
      return "SettingsCatalog";
  }
}

function graphBaseline(kind: CompareKind, template: JsonRecord): JsonRecord {
  if (kind === "SettingsCatalog") return graphSettingsCatalog(template);
  if (kind === "compliance") return graphCompliance(template);
  return graphDeviceConfiguration(template);
}

describe("OpenIntuneBaseline", () => {
  it("reports every untouched baseline policy as matching, or cannot compare for secret values", () => {
    const statuses = new Map<string, number>();
    for (const loaded of baseline) {
      const kind = baselineKind(loaded);
      if (!kind) continue;
      const template = resolveOIBOrganizationId(loaded, TENANT_ID) as unknown as JsonRecord;
      const result = compareWithTemplate(kind, template, graphBaseline(kind, template));
      const hasSecret = JSON.stringify(cleanSettingsCatalogPolicy(template)).includes("SecretSettingValue");
      const expectedStatus = kind === "SettingsCatalog" && hasSecret ? "cannotCompare" : "matches";
      expect(result.status, `${loaded._oibFilePath}: ${result.reason} ${result.differences.map(formatDifference).join("; ")}`).toBe(expectedStatus);
      statuses.set(kind, (statuses.get(kind) ?? 0) + 1);
    }
    expect(statuses.get("SettingsCatalog")).toBeGreaterThan(50);
    expect(statuses.get("compliance")).toBeGreaterThan(5);
    expect(statuses.get("DeviceConfiguration")).toBeGreaterThan(0);
    expect(statuses.get("DriverUpdateProfiles")).toBeGreaterThan(0);
  });

  it("reports one changed Settings Catalog value by path, without the value", () => {
    const loaded = baseline.find((policy) => baselineKind(policy) === "SettingsCatalog" && JSON.stringify(policy).includes("choiceSettingValue"))!;
    const template = resolveOIBOrganizationId(loaded, TENANT_ID) as unknown as JsonRecord;
    const actual = graphSettingsCatalog(template);
    const text = JSON.stringify(actual);
    const original = text.match(/"choiceSettingValue":\{[^{}]*?"value":"([^"]+)"/)![1];
    const changed = JSON.parse(text.replace(`"value":"${original}"`, `"value":"${original}_changed"`)) as JsonRecord;
    const result = compareWithTemplate("SettingsCatalog", template, changed);
    expect(result.status).toBe("differs");
    expect(result.differences).toHaveLength(1);
    expect(result.differences[0].template).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain(`${original}_changed`);
  });
});
