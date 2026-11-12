"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  getExecutionState,
  subscribeExecutionState,
  type ExecutionState,
} from "@/lib/hydration/executionStateStore";
import type { ExecutionOutcome } from "@/types/hydration";

/** Notification permission, or "unsupported" when the browser has no Notification API. */
export type NotificationAvailability = "unsupported" | NotificationPermission;

export interface CompletionNotificationContent {
  title: string;
  body: string;
}

const NOTIFICATION_TAG = "hydration-run-complete";

const OUTCOME_TITLES: Record<ExecutionOutcome, string> = {
  succeeded: "finished",
  completedWithIssues: "finished with issues",
  cancelled: "was cancelled",
  failed: "failed",
};

export function getNotificationAvailability(): NotificationAvailability {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

/** Ask for notification permission. Call this only from a user action, such as a click. */
export async function requestNotificationPermission(): Promise<NotificationAvailability> {
  const availability = getNotificationAvailability();
  if (availability !== "default") return availability;
  try {
    return await Notification.requestPermission();
  } catch {
    return getNotificationAvailability();
  }
}

/**
 * Build the notification text for a finished run. The text contains only the
 * outcome and the counts. It contains no tenant or object names, because the
 * notification can show on a lock screen.
 */
export function buildCompletionNotification(
  state: Pick<ExecutionState, "configuration" | "outcome" | "tasks">,
): CompletionNotificationContent | null {
  if (!state.outcome || !state.configuration) return null;
  const { operationMode, isPreview } = state.configuration;
  let changed = 0;
  let skipped = 0;
  let failed = 0;
  for (const task of state.tasks) {
    if (task.status === "success" && task.operation === operationMode) changed += 1;
    else if (task.status === "skipped") skipped += 1;
    else if (task.status === "failed") failed += 1;
  }
  const verb = operationMode === "delete" ? "deleted" : "created";
  const changedLabel = isPreview ? `Would be ${verb}` : verb.charAt(0).toUpperCase() + verb.slice(1);
  return {
    title: `Hydration ${isPreview ? "preview" : "run"} ${OUTCOME_TITLES[state.outcome]}`,
    body: `${changedLabel}: ${changed}. Skipped: ${skipped}. Failed: ${failed}.`,
  };
}

/**
 * Show a browser notification when the current run finishes while the tab is
 * hidden. The notification shows only when `enabled` is true and the user
 * gave permission. The hook never asks for permission.
 */
export function useRunCompletionNotification(enabled: boolean): void {
  const state = useSyncExternalStore(subscribeExecutionState, getExecutionState, getExecutionState);
  const lastSeenRef = useRef<Pick<ExecutionState, "runId" | "phase"> | null>(null);

  useEffect(() => {
    const previous = lastSeenRef.current;
    lastSeenRef.current = { runId: state.runId, phase: state.phase };

    // A run that was already complete when the page mounted does not notify.
    const justFinished =
      state.phase === "completed" &&
      previous !== null &&
      (previous.runId !== state.runId || previous.phase !== "completed");
    if (!justFinished || !enabled) return;
    if (document.visibilityState !== "hidden" || getNotificationAvailability() !== "granted") return;

    const content = buildCompletionNotification(state);
    if (!content) return;
    try {
      // The notification shows on creation. No reference is necessary.
      new Notification(content.title, { body: content.body, tag: NOTIFICATION_TAG });
    } catch {
      // Some mobile browsers allow notifications only from a service worker.
    }
  }, [enabled, state]);
}

/** Text that tells the user why the notification option cannot turn on, or null when it can. */
export function getNotificationPermissionHint(availability: NotificationAvailability): string | null {
  if (availability === "unsupported") return "This browser cannot show notifications.";
  if (availability === "denied") {
    return "Notifications are blocked for this site. Allow them in your browser site settings to use this option.";
  }
  return null;
}

function subscribeToNothing(): () => void {
  return () => {};
}

function getServerAvailability(): NotificationAvailability {
  return "unsupported";
}

/**
 * Current notification permission and a request function for a user action.
 * The browser has no permission change event for this API, so the hook keeps
 * the result of its own request.
 */
export function useNotificationPermission(): {
  availability: NotificationAvailability;
  request: () => Promise<NotificationAvailability>;
} {
  const browserAvailability = useSyncExternalStore(subscribeToNothing, getNotificationAvailability, getServerAvailability);
  const [requested, setRequested] = useState<NotificationAvailability | null>(null);

  const request = useCallback(async (): Promise<NotificationAvailability> => {
    const result = await requestNotificationPermission();
    setRequested(result);
    return result;
  }, []);

  return { availability: requested ?? browserAvailability, request };
}
