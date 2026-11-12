/* oxlint-disable react-doctor/async-await-in-loop -- localized messages and policy reads run one at a time to limit Graph throttling. */
/**
 * Microsoft Graph API operations for Intune notification message templates.
 *
 * A notification message template has no description field. The kit marks its
 * templates in the display name (see hasNotificationTemplateMarker). Compliance
 * policies refer to a template by ID in their noncompliance actions; a template
 * has no assignments.
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
    actionsProperty: "scheduledActions",
    nameProperty: "name",
  },
] as const;

/**
 * Get the names of the compliance policies whose noncompliance actions send this
 * notification template. Reads every compliance policy with its actions expanded.
 * Throws when a list cannot be read, or when a policy comes back without its action
 * list, so the caller does not delete a template that it could not check.
 */
export async function getNotificationTemplateReferences(
  client: GraphClient,
  templateId: string
): Promise<string[]> {
  const target = templateId.toLowerCase();
  const references: string[] = [];

  for (const collection of REFERENCING_COLLECTIONS) {
    const policies = await client.getCollection<Record<string, unknown>>(
      `${collection.endpoint}?$select=id,${collection.nameProperty}` +
        `&$expand=${collection.actionsProperty}($expand=scheduledActionConfigurations)`
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
        references.push(String(policy[collection.nameProperty] ?? policy.id));
      }
    }
  }

  return references;
}
