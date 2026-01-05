/**
 * Microsoft Graph API type definitions
 */

export interface GraphError {
  error: {
    code: string;
    message: string;
    innerError?: {
      code: string;
      message: string;
      date: string;
      "request-id": string;
      "client-request-id": string;
    };
  };
}

export interface GraphResponse<T> {
  "@odata.context"?: string;
  "@odata.count"?: number;
  "@odata.nextLink"?: string;
  value: T[];
}

export interface DeviceFilter {
  "@odata.type": "#microsoft.graph.assignmentFilter";
  id?: string;
  displayName: string;
  description: string;
  platform: "android" | "iOS" | "macOS" | "windows10AndLater";
  rule: string;
  roleScopeTags?: string[];
}

export interface DeviceGroup {
  "@odata.type": "#microsoft.graph.group";
  id?: string;
  displayName: string;
  description: string;
  groupTypes: string[];
  mailEnabled: boolean;
  mailNickname: string;
  securityEnabled: boolean;
  membershipRule?: string;
  membershipRuleProcessingState?: "On" | "Paused";
}

export interface CompliancePolicy {
  "@odata.type": string;
  id?: string;
  displayName: string;
  description: string;
  [key: string]: unknown;
}

export interface ConditionalAccessPolicy {
  "@odata.type": "#microsoft.graph.conditionalAccessPolicy";
  id?: string;
  displayName: string;
  state: "enabled" | "disabled" | "enabledForReportingButNotEnforced";
  conditions: {
    signInRiskLevels?: string[];
    userRiskLevels?: string[];
    [key: string]: unknown;
  };
  grantControls?: unknown;
  sessionControls?: unknown;
}

export interface AppProtectionPolicy {
  "@odata.type": string;
  id?: string;
  displayName: string;
  description: string;
  [key: string]: unknown;
}
