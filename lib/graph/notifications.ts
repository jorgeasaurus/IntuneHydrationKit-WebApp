/* oxlint-disable react-doctor/async-await-in-loop -- localized messages and policy reads run one at a time to limit Graph throttling. */
/**
 * Microsoft Graph API operations for Intune notification message templates.
 *
 * A notification message template has no description field. The kit marks its
 * templates in the display name (see hasNotificationTemplateMarker). Compliance
 * policies (noncompliance actions) and enrollment notifications refer to a template
 * by ID; a template has no assignments.
 */

import { isRunCancelledError } from "@/lib/utils/retry";
import { GraphClient } from "./client";

export const NOTIFICATION_TEMPLATES_ENDPOINT = "/deviceManagement/notificationMessageTemplates";

/** Localized message of a notification template (one per locale). */
export interface LocalizedNotificationMessage {
  locale: string;
  subject: string;
  messageTemplate: string;
  isDefault?: boolean;
}

/** Notification template as the loader gives it: the Graph body plus its localized messages. */
export interface NotificationTemplate extends Record<string, unknown> {
  displayName: string;
  localizedMessages?: LocalizedNotificationMessage[];
}

/** Notification template in the tenant. */
export interface TenantNotificationTemplate {
  id: string;
  displayName?: string;
}

/**
 * Get all notification message templates in the tenant.
 */
export async function getAllNotificationTemplates(client: GraphClient): Promise<TenantNotificationTemplate[]> {
  return client.getCollection<TenantNotificationTemplate>(`${NOTIFICATION_TEMPLATES_ENDPOINT}?$select=id,displayName`);
}

export interface NotificationTemplateCreateResult {
  created: TenantNotificationTemplate;
  /** Localized messages that Graph did not create. Empty when every message was created. */
  failedMessages: Array<{ locale: string; error: string }>;
}

/**
 * Create a notification template, then one localized message per locale under it.
 * GraphClient.post applies the create retry rule: a request is sent again only when
 * Graph proved that it did not process it. A localized message that fails is recorded,
 * and the other messages are still sent. A cancelled run stops at once.
 */
export async function createNotificationTemplate(
  client: GraphClient,
  template: NotificationTemplate
): Promise<NotificationTemplateCreateResult> {
  const { localizedMessages = [], ...body } = template;
  const created = await client.post<TenantNotificationTemplate>(NOTIFICATION_TEMPLATES_ENDPOINT, body);
  if (!created?.id) {
    throw new Error(`Graph did not return an ID for notification template "${template.displayName}"`);
  }

  const failedMessages: NotificationTemplateCreateResult["failedMessages"] = [];
  for (const message of localizedMessages) {
    try {
      await client.post(`${NOTIFICATION_TEMPLATES_ENDPOINT}/${created.id}/localizedNotificationMessages`, message);
    } catch (error) {
      if (isRunCancelledError(error)) throw error;
      failedMessages.push({
        locale: message.locale || "unknown locale",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { created, failedMessages };
}

interface ComplianceActionItem {
  notificationTemplateId?: string | null;
}

interface ComplianceScheduledAction {
  scheduledActionConfigurations?: ComplianceActionItem[];
}

/**
 * Compliance policy collections that can refer to a notification template, with the
 * navigation property that holds the noncompliance actions.
 */
const REFERENCING_COLLECTIONS = [
  {
    label: "compliance policy",
    endpoint: "/deviceManagement/deviceCompliancePolicies",
    actionsProperty: "scheduledActionsForRule",
    nameProperty: "displayName",
  },
  {
    label: "Settings Catalog compliance policy",
    endpoint: "/deviceManagement/compliancePolicies",
    // Graph beta deviceManagementCompliancePolicy uses the same navigation property name.
    actionsProperty: "scheduledActionsForRule",
    nameProperty: "name",
  },
] as const;

export const ENROLLMENT_CONFIGURATIONS_ENDPOINT = "/deviceManagement/deviceEnrollmentConfigurations";
const ENROLLMENT_NOTIFICATION_ODATA_TYPE = "#microsoft.graph.deviceenrollmentnotificationconfiguration";
const ENROLLMENT_NOTIFICATION_CONFIGURATION_TYPE = "enrollmentnotificationsconfiguration";

/**
 * Whether an enrollment notification configuration sends the template. Graph keeps the
 * template ID in notificationMessageTemplateId and in notificationTemplates, as
 * "<templateType>_<templateId>" entries. Throws when the configuration has neither field.
 */
function enrollmentNotificationRefersTo(configuration: Record<string, unknown>, target: string, name: string): boolean {
  const { notificationMessageTemplateId: templateId, notificationTemplates: entries } = configuration;
  if (typeof templateId !== "string" && !Array.isArray(entries)) {
    throw new Error(`Could not read the notification templates of enrollment notification "${name}"`);
  }
  if (typeof templateId === "string" && templateId.toLowerCase() === target) return true;
  return (
    Array.isArray(entries) &&
    entries.some((entry) => typeof entry === "string" && entry.toLowerCase().split("_").pop() === target)
  );
}

/**
 * Get the enrollment notifications that send this template. Reads every enrollment
 * configuration without $select: the template fields exist only on the derived type
 * deviceEnrollmentNotificationConfiguration, and a list read without $select returns
 * the properties of each derived type. Throws when the list cannot be read, or when a
 * configuration cannot be classified or read, so the template is not deleted.
 */
async function getEnrollmentNotificationReferences(client: GraphClient, target: string): Promise<string[]> {
  const configurations = await client.getCollection<Record<string, unknown>>(ENROLLMENT_CONFIGURATIONS_ENDPOINT);
  const references: string[] = [];
  for (const configuration of configurations) {
    const name = String(configuration.displayName ?? configuration.id);
    const odataType = configuration["@odata.type"];
    const configurationType = configuration.deviceEnrollmentConfigurationType;
    if (typeof odataType !== "string" && typeof configurationType !== "string") {
      throw new Error(`Could not determine the type of enrollment configuration "${name}"`);
    }
    const isNotification =
      (typeof odataType === "string" && odataType.toLowerCase() === ENROLLMENT_NOTIFICATION_ODATA_TYPE) ||
      (typeof configurationType === "string" &&
        configurationType.toLowerCase() === ENROLLMENT_NOTIFICATION_CONFIGURATION_TYPE);
    if (isNotification && enrollmentNotificationRefersTo(configuration, target, name)) {
      references.push(`enrollment notification "${name}"`);
    }
  }
  return references;
}

/**
 * Get the objects that send this notification template: compliance policies (their
 * noncompliance actions) and enrollment notifications. Each entry names the object.
 * Throws when a list cannot be read, or when an object comes back without the fields
 * that the check needs, so the caller does not delete a template that it could not check.
 */
export async function getNotificationTemplateReferences(
  client: GraphClient,
  templateId: string
): Promise<string[]> {
  const target = templateId.toLowerCase();
  const references: string[] = [];

  for (const collection of REFERENCING_COLLECTIONS) {
    const policies = await client.getCollection<Record<string, unknown>>(
      // No $select: some Intune list endpoints leave out an expanded navigation property
      // that is not in $select, and a missing action list fails every delete (fail closed).
      `${collection.endpoint}?$expand=${collection.actionsProperty}($expand=scheduledActionConfigurations)`
    );
    for (const policy of policies) {
      const actions = policy[collection.actionsProperty];
      if (!Array.isArray(actions)) {
        throw new Error(
          `Could not read the noncompliance actions of ${collection.label} "${String(policy[collection.nameProperty] ?? policy.id)}"`
        );
      }
      const refersToTemplate = (actions as ComplianceScheduledAction[]).some((action) => {
        const configurations = action.scheduledActionConfigurations;
        if (!Array.isArray(configurations)) {
          throw new Error(
            `Could not read the noncompliance actions of ${collection.label} "${String(policy[collection.nameProperty] ?? policy.id)}"`
          );
        }
        return configurations.some((item) => item.notificationTemplateId?.toLowerCase() === target);
      });
      if (refersToTemplate) {
        references.push(`${collection.label} "${String(policy[collection.nameProperty] ?? policy.id)}"`);
      }
    }
  }

  references.push(...(await getEnrollmentNotificationReferences(client, target)));
  return references;
}
