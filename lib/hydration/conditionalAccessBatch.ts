import type {
  ApiVersion,
  BatchRequest,
  BatchResponse,
  BatchResponseError,
} from "@/lib/graph/batch";
import { CONDITIONAL_ACCESS_POLICIES_ENDPOINT } from "@/lib/graph/conditionalAccess";
import type { HydrationTask } from "@/types/hydration";

const REDACTED_LOG_VALUE = "[REDACTED]";
const SENSITIVE_LOG_KEY_PATTERN = /(authorization|password|secret|token)/i;
const BATCH_BAD_REQUEST_PATTERN = /\[400\]|badrequest|malformed|incorrect/i;
const PRIVATE_PREVIEW_AUTHORIZATION_PATTERN =
  /1101:.*tenant must be explicitly authorized.*private preview feature:\s*([A-Za-z0-9_-]+)/i;

interface ConditionalAccessBatchItem {
  task: HydrationTask;
  request: BatchRequest;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function sanitizeForConsoleLog(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForConsoleLog(item));
  }

  const record = asRecord(value);
  if (!record) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, nestedValue]) => [
      key,
      SENSITIVE_LOG_KEY_PATTERN.test(key)
        ? REDACTED_LOG_VALUE
        : sanitizeForConsoleLog(nestedValue),
    ])
  );
}

function isConditionalAccessCreateRequest(
  item: ConditionalAccessBatchItem
): boolean {
  return (
    item.task.category === "conditionalAccess" &&
    item.request.method === "POST" &&
    item.request.url === CONDITIONAL_ACCESS_POLICIES_ENDPOINT
  );
}

export function shouldLogConditionalAccessCreateFailure(
  item: ConditionalAccessBatchItem,
  response: BatchResponse,
  error: Pick<BatchResponseError, "code" | "message">
): boolean {
  if (!isConditionalAccessCreateRequest(item)) {
    return false;
  }

  return (
    response.status === 400 ||
    BATCH_BAD_REQUEST_PATTERN.test(error.code ?? "") ||
    BATCH_BAD_REQUEST_PATTERN.test(error.message)
  );
}

export function logConditionalAccessCreateFailureDiagnostics(
  item: ConditionalAccessBatchItem,
  response: BatchResponse,
  error: Pick<BatchResponseError, "code" | "message">,
  version: ApiVersion
): void {
  console.error("[BatchExecutor] Conditional Access create failed diagnostics:", {
    task: {
      id: item.task.id,
      itemName: item.task.itemName,
      operation: item.task.operation,
      category: item.task.category,
    },
    request: {
      id: item.request.id,
      method: item.request.method,
      url: item.request.url,
      apiVersion: version,
      headers: sanitizeForConsoleLog(item.request.headers),
      body: sanitizeForConsoleLog(item.request.body),
    },
    response: {
      id: response.id,
      status: response.status,
      code: error.code,
      message: error.message,
      headers: sanitizeForConsoleLog(response.headers),
      body: sanitizeForConsoleLog(response.body),
    },
  });
}

export function logConditionalAccessBatchRequestFailureDiagnostics(
  items: ConditionalAccessBatchItem[],
  errorMessage: string,
  version: ApiVersion
): void {
  if (!BATCH_BAD_REQUEST_PATTERN.test(errorMessage)) {
    return;
  }

  const conditionalAccessItems = items.filter(isConditionalAccessCreateRequest);
  if (conditionalAccessItems.length === 0) {
    return;
  }

  console.error("[BatchExecutor] Conditional Access batch request failed diagnostics:", {
    apiVersion: version,
    error: errorMessage,
    requests: conditionalAccessItems.map((item) => ({
      taskId: item.task.id,
      itemName: item.task.itemName,
      requestId: item.request.id,
      method: item.request.method,
      url: item.request.url,
      headers: sanitizeForConsoleLog(item.request.headers),
      body: sanitizeForConsoleLog(item.request.body),
    })),
  });
}

export function getPrivatePreviewFeatureName(error: Pick<BatchResponseError, "innerMessage" | "message">): string | null {
  const match = PRIVATE_PREVIEW_AUTHORIZATION_PATTERN.exec(
    error.innerMessage || error.message
  );

  return match?.[1] ?? null;
}

export function getPrivatePreviewSkipReason(featureName: string): string {
  return `Requires tenant authorization for Microsoft Graph private preview feature: ${featureName}`;
}
