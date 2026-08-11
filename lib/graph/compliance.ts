/**
 * Microsoft Graph API operations for Compliance Policies
 */

import { GraphClient } from "./client";
import { CompliancePolicy, DeletionResult } from "@/types/graph";
import { HYDRATION_MARKER, hasHydrationMarker } from "@/lib/utils/hydrationMarker";

/**
 * Interface for device compliance script definition (stored in template)
 */
interface DeviceComplianceScriptDefinition {
  displayName?: string;
  description?: string;
  publisher?: string;
  runAs32Bit?: boolean;
  runAsAccount?: string;
  enforceSignatureCheck?: boolean;
  detectionScriptContentBase64?: string;
  rules?: unknown;
}

/**
 * Interface for device compliance script (API response)
 */
interface DeviceComplianceScript {
  id: string;
  displayName: string;
  description?: string;
}

/**
 * Get all device compliance scripts
 */
async function getAllDeviceComplianceScripts(
  client: GraphClient
): Promise<DeviceComplianceScript[]> {
  return client.getCollection<DeviceComplianceScript>(
    "/deviceManagement/deviceComplianceScripts"
  );
}

/**
 * Get a device compliance script by display name
 */
async function getDeviceComplianceScriptByName(
  client: GraphClient,
  displayName: string
): Promise<DeviceComplianceScript | null> {
  const scripts = await getAllDeviceComplianceScripts(client);
  return scripts.find(
    (s) => s.displayName.toLowerCase() === displayName.toLowerCase()
  ) || null;
}

/**
 * Create a device compliance script for Custom Compliance
 */
async function createDeviceComplianceScript(
  client: GraphClient,
  definition: DeviceComplianceScriptDefinition,
  fallbackDisplayName: string
): Promise<DeviceComplianceScript> {
  const scriptBody = {
    displayName: definition.displayName || `${fallbackDisplayName} Script`,
    description: definition.description || "",
    publisher: definition.publisher || "Publisher",
    runAs32Bit: Boolean(definition.runAs32Bit),
    runAsAccount: definition.runAsAccount || "system",
    enforceSignatureCheck: Boolean(definition.enforceSignatureCheck),
    detectionScriptContent: definition.detectionScriptContentBase64,
  };

  return client.post<DeviceComplianceScript>(
    "/deviceManagement/deviceComplianceScripts",
    scriptBody
  );
}

/**
 * Get all compliance policies in the tenant
 */
async function getAllCompliancePolicies(
  client: GraphClient
): Promise<CompliancePolicy[]> {
  return client.getCollection<CompliancePolicy>("/deviceManagement/deviceCompliancePolicies");
}

/**
 * Get a compliance policy by ID
 */
async function getCompliancePolicyById(
  client: GraphClient,
  policyId: string
): Promise<CompliancePolicy> {
  return client.get<CompliancePolicy>(
    `/deviceManagement/deviceCompliancePolicies/${policyId}`
  );
}

/**
 * Get a compliance policy by display name
 */
async function getCompliancePolicyByName(
  client: GraphClient,
  displayName: string
): Promise<CompliancePolicy | null> {
  const policies = await getAllCompliancePolicies(client);
  const found = policies.find(
    (policy) => policy.displayName.toLowerCase() === displayName.toLowerCase()
  );
  return found || null;
}

/**
 * Check if a compliance policy exists by display name (case-insensitive)
 */
export async function compliancePolicyExists(
  client: GraphClient,
  displayName: string
): Promise<boolean> {
  const policy = await getCompliancePolicyByName(client, displayName);
  return policy !== null;
}

/**
 * Create a new compliance policy
 * Handles Custom Compliance policies by first creating the compliance script
 */
export async function createCompliancePolicy(
  client: GraphClient,
  policy: CompliancePolicy
): Promise<CompliancePolicy> {
  // Deep clone to avoid mutating original
  const policyBody = structuredClone(policy) as CompliancePolicy & {
    deviceCompliancePolicyScript?: {
      displayName?: string;
      deviceComplianceScriptId?: string;
      rulesContent?: string;
    };
    deviceCompliancePolicyScriptDefinition?: DeviceComplianceScriptDefinition;
  };

  // Ensure the hydration marker is in the description
  if (!hasHydrationMarker(policyBody.description)) {
    policyBody.description = `${policyBody.description || ""} ${HYDRATION_MARKER}`.trim();
  }

  // Handle Custom Compliance policies with deviceCompliancePolicyScript
  // Case 1: Both script reference and definition exist - create script and set IDs
  // Case 2: Only script reference exists without definition - clean invalid properties
  if (policyBody.deviceCompliancePolicyScript) {
    if (policyBody.deviceCompliancePolicyScriptDefinition) {
      // Case 1: We have the full definition - create the script
      const scriptDefinition = policyBody.deviceCompliancePolicyScriptDefinition;
      const scriptDisplayName = scriptDefinition.displayName || `${policyBody.displayName} Script`;

      // Step 1: Check if compliance script already exists or create it
      let scriptId: string;
      const existingScript = await getDeviceComplianceScriptByName(client, scriptDisplayName);

      if (existingScript) {
        scriptId = existingScript.id;
      } else if (scriptDefinition.detectionScriptContentBase64) {
        // Create the compliance script
        const newScript = await createDeviceComplianceScript(
          client,
          scriptDefinition,
          policyBody.displayName
        );
        scriptId = newScript.id;
      } else {
        throw new Error(
          `Custom Compliance policy "${policyBody.displayName}" missing detectionScriptContentBase64 in deviceCompliancePolicyScriptDefinition`
        );
      }

      // Step 2: Convert rules to base64
      if (!scriptDefinition.rules) {
        throw new Error(
          `Custom Compliance policy "${policyBody.displayName}" missing rules in deviceCompliancePolicyScriptDefinition`
        );
      }

      const rulesJson = JSON.stringify(scriptDefinition.rules);
      const rulesBase64 = btoa(unescape(encodeURIComponent(rulesJson)));

      // Step 3: Update the policy body with resolved values
      policyBody.deviceCompliancePolicyScript = {
        deviceComplianceScriptId: scriptId,
        rulesContent: rulesBase64,
      };

      // Remove the script definition (internal helper, not part of API)
      delete policyBody.deviceCompliancePolicyScriptDefinition;
    } else {
      // Case 2: Script reference exists but no definition - clean invalid properties
      // Only keep valid properties: deviceComplianceScriptId, rulesContent
      const scriptRef = policyBody.deviceCompliancePolicyScript;
      if (scriptRef && typeof scriptRef === "object") {
        policyBody.deviceCompliancePolicyScript = {
          deviceComplianceScriptId: scriptRef.deviceComplianceScriptId,
          rulesContent: scriptRef.rulesContent,
        };
      }
    }
  }

  // Use postNoRetry to avoid duplicate creation on 504 timeout
  // Compliance policy creation often returns 504 but the policy IS created
  return client.postNoRetry<CompliancePolicy>(
    "/deviceManagement/deviceCompliancePolicies",
    policyBody
  );
}

/**
 * Delete a compliance policy by ID
 * Only deletes if created by Intune Hydration Kit and has no active assignments
 */
async function deleteCompliancePolicy(
  client: GraphClient,
  policyId: string
): Promise<DeletionResult> {
  const policy = await getCompliancePolicyById(client, policyId);

  if (!hasHydrationMarker(policy.description)) {
    throw new Error(
      `Cannot delete policy "${policy.displayName}": Not created by Intune Hydration Kit`
    );
  }

  // Check for active assignments - skip deletion if assigned
  const assignments = await getCompliancePolicyAssignments(client, policyId);
  if (assignments.length > 0) {
    console.log(`[Compliance] Skipping deletion of "${policy.displayName}" - has ${assignments.length} active assignment(s)`);
    return {
      deleted: false,
      skipped: true,
      reason: `Policy has ${assignments.length} active assignment(s)`
    };
  }

  await client.delete(`/deviceManagement/deviceCompliancePolicies/${policyId}`);
  return { deleted: true, skipped: false };
}

/**
 * Delete a compliance policy by display name
 * Only deletes if created by Intune Hydration Kit and has no active assignments
 */
export async function deleteCompliancePolicyByName(
  client: GraphClient,
  displayName: string
): Promise<DeletionResult> {
  const policy = await getCompliancePolicyByName(client, displayName);

  if (!policy || !policy.id) {
    throw new Error(`Compliance policy "${displayName}" not found`);
  }

  return deleteCompliancePolicy(client, policy.id);
}

/**
 * Get assignments for a compliance policy
 */
async function getCompliancePolicyAssignments(
  client: GraphClient,
  policyId: string
): Promise<unknown[]> {
  return client.getCollection(
    `/deviceManagement/deviceCompliancePolicies/${policyId}/assignments`
  );
}
