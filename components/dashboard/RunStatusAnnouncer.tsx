"use client";

import { useEffect, useRef, useState } from "react";
import type { ExecutionOutcome, HydrationTask } from "@/types/hydration";
import {
  ANNOUNCEMENT_INTERVAL_MS,
  INITIAL_ANNOUNCEMENT_CURSOR,
  buildOutcomeAnnouncement,
  buildProgressAnnouncement,
  type AnnouncementCursor,
} from "@/components/dashboard/runAnnouncements";

interface RunStatusAnnouncerProps {
  tasks: HydrationTask[];
  isCompleted: boolean;
  outcome: ExecutionOutcome | null;
  /** False when another region (for example a role="alert" notice) already announces the outcome. */
  announceOutcome: boolean;
}

/**
 * Polite, throttled screen-reader announcements for a hydration run.
 * The live region mounts empty. Text goes into it only after mount, so
 * screen readers detect each change. Progress is summarised every few tasks,
 * failures are announced as they occur, and the final outcome is announced once.
 */
export function RunStatusAnnouncer({
  tasks,
  isCompleted,
  outcome,
  announceOutcome,
}: RunStatusAnnouncerProps): React.JSX.Element {
  const [message, setMessage] = useState("");
  const cursorRef = useRef<AnnouncementCursor>(INITIAL_ANNOUNCEMENT_CURSOR);
  const lastAnnouncedAtRef = useRef(0);
  const tasksRef = useRef(tasks);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    if (isCompleted) return;

    const flush = (): void => {
      timerRef.current = null;
      const next = buildProgressAnnouncement(tasksRef.current, cursorRef.current);
      if (!next) return;
      cursorRef.current = next.cursor;
      lastAnnouncedAtRef.current = Date.now();
      setMessage(next.message);
    };

    if (timerRef.current) return;
    const wait = lastAnnouncedAtRef.current + ANNOUNCEMENT_INTERVAL_MS - Date.now();
    timerRef.current = setTimeout(flush, Math.max(0, wait));
  }, [tasks, isCompleted]);

  useEffect(() => {
    if (!isCompleted) return;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!announceOutcome) return;
    // Defer one tick so the empty region is in the accessibility tree first.
    const timer = setTimeout(() => {
      setMessage(buildOutcomeAnnouncement(tasksRef.current, outcome));
    }, 0);
    return () => clearTimeout(timer);
  }, [announceOutcome, isCompleted, outcome]);

  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        // Reset the handle: Strict Mode runs this cleanup and then the effects again,
        // and a stale handle would stop any new timer from being scheduled.
        timerRef.current = null;
      }
    },
    [],
  );

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="run-status-announcer"
      className="sr-only"
    >
      {message}
    </div>
  );
}
