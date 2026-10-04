import type { GraphClient } from "@/lib/graph/client";
import type { BaselineSelection } from "@/types/hydration";
import { fetchOIBManifest, fetchBaselinePolicyByManifestFile } from "@/lib/templates/loader";
import { findBaselineMatch, getBaselineEndpoint, type BaselineMatchCandidate } from "./baselineEvidence";
import { normalizeName } from "./utils";

export interface BaselineChangeItem {
  path: string;
  name: string;
  status: "new" | "existing" | "unavailable";
  matched?: BaselineMatchCandidate;
  matchType?: "exact" | "normalized";
  olderVersions: BaselineMatchCandidate[];
}

function policyVersion(name: string): { family: string; version: number[] } | undefined {
  const match = name.match(/^(.*) - v(\d+(?:\.\d+)*)$/i);
  return match ? { family: normalizeName(match[1]), version: match[2].split(".").map(Number) } : undefined;
}

function isOlderVersion(name: string, target: string): boolean {
  const existing = policyVersion(name);
  const current = policyVersion(target);
  if (!existing || !current || existing.family !== current.family) return false;
  for (let index = 0; index < Math.max(existing.version.length, current.version.length); index++) {
    const delta = (existing.version[index] ?? 0) - (current.version[index] ?? 0);
    if (delta !== 0) return delta < 0;
  }
  return false;
}

/** Summarize the name match and older versions without changing tenant objects. */
export function classifyBaselineChange(path: string, name: string, policyType: string, policies?: BaselineMatchCandidate[]): BaselineChangeItem {
  if (!policies) return { path, name, status: "unavailable", olderVersions: [] };
  const getName = (policy: BaselineMatchCandidate) => policy.name ?? policy.displayName;
  const matched = findBaselineMatch(policyType, name, policies);
  return {
    path, name, status: matched ? "existing" : "new", matched,
    matchType: matched ? (getName(matched)?.toLowerCase() === name.toLowerCase() ? "exact" : "normalized") : undefined,
    olderVersions: policies.filter((policy) => isOlderVersion(getName(policy) ?? "", name)),
  };
}

/** Read the selected baseline inventory. All tenant requests are GET requests. */
export async function readBaselineChanges(client: GraphClient, selection?: BaselineSelection): Promise<BaselineChangeItem[]> {
  const manifest = await fetchOIBManifest();
  if (!manifest) throw new Error("The baseline manifest could not be loaded.");
  const paths = selection?.selectedPolicies.length ? new Set(selection.selectedPolicies) : undefined;
  const files = manifest.files.filter((file) => !paths || paths.has(file.path));
  const templates = await Promise.all(files.map(async (file) => {
    const policy = await fetchBaselinePolicyByManifestFile(file);
    const appType = String(policy?.["@odata.type"] ?? "").toLowerCase();
    const endpoint = file.policyType === "AppProtection"
      ? (appType.includes("android") ? "/deviceAppManagement/androidManagedAppProtections" : "/deviceAppManagement/iosManagedAppProtections")
      : getBaselineEndpoint(file.policyType);
    return { file, policy, endpoint };
  }));
  const endpoints = [...new Set(templates.flatMap(({ endpoint }) => endpoint ? [endpoint] : []))];
  const inventory = new Map(await Promise.all(endpoints.map(async (endpoint) => {
    try {
      const field = endpoint.endsWith("configurationPolicies") ? "name" : "displayName";
      return [endpoint, await client.getCollection<BaselineMatchCandidate>(`${endpoint}?$select=id,${field}`)] as const;
    } catch {
      return [endpoint, undefined] as const;
    }
  })));
  return templates.map(({ file, policy, endpoint }) => classifyBaselineChange(
    file.path,
    policy?.name ?? policy?.displayName ?? file.displayName,
    file.policyType,
    policy && endpoint ? inventory.get(endpoint) : undefined
  ));
}
