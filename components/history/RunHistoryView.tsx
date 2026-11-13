"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { History, Home, Trash2, Wand2 } from "lucide-react";
import { AppNavigation } from "@/components/AppNavigation";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { RunHistoryDetail } from "@/components/history/RunHistoryDetail";
import { RunHistoryList } from "@/components/history/RunHistoryList";
import { Button } from "@/components/ui/button";
import { useRunHistory } from "@/hooks/useRunHistory";
import { MAX_RUN_HISTORY_ENTRIES, type RunHistoryEntry } from "@/lib/history/runHistory";
import { formatDateTime } from "@/lib/utils/dateFormat";

type PendingDelete = { kind: "one"; entry: RunHistoryEntry } | { kind: "all" } | null;

/** List of past runs for the signed-in account and tenant, with a results view for one run. */
export function RunHistoryView(): React.JSX.Element {
  const history = useRunHistory();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);
  const [status, setStatus] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const selected = history.entries.find((entry) => entry.id === selectedId) ?? null;
  const previousSelectedId = useRef(selectedId);

  // Opening a run or returning to the list replaces the content, so move focus to the heading.
  useEffect(() => {
    if (previousSelectedId.current === selectedId) return;
    previousSelectedId.current = selectedId;
    headingRef.current?.focus();
  }, [selectedId]);

  function confirmDelete(): void {
    if (!pendingDelete) return;
    if (pendingDelete.kind === "all") {
      history.clear();
      setSelectedId(null);
      setStatus("Deleted all runs from history.");
      return;
    }
    const removed = history.remove(pendingDelete.entry.id);
    if (pendingDelete.entry.id === selectedId) setSelectedId(null);
    setStatus(removed
      ? `Deleted the run on ${formatDateTime(pendingDelete.entry.endTime)} from history.`
      : "The app cannot delete the run. Try again.");
  }

  return (
    <div className="relative z-10 min-h-screen">
      <AppNavigation
        brandHref="/"
        eyebrow={(
          <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-hydrate">Session records</span>
        )}
        title="Run history"
        description="Runs in this browser tab for the signed-in account and tenant"
        actions={(
          <>
            <Button variant="outline" asChild className="size-9 px-0 sm:w-auto sm:px-3">
              <Link href="/wizard">
                <Wand2 aria-hidden="true" className="size-4 sm:mr-2" />
                <span className="sr-only sm:not-sr-only">Wizard</span>
              </Link>
            </Button>
            <Button variant="outline" asChild className="size-9 px-0 sm:w-auto sm:px-3">
              <Link href="/">
                <Home aria-hidden="true" className="size-4 sm:mr-2" />
                <span className="sr-only sm:not-sr-only">Home</span>
              </Link>
            </Button>
          </>
        )}
      />

      <main className="container mx-auto max-w-5xl space-y-6 px-4 py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 ref={headingRef} tabIndex={-1} className="text-2xl font-bold tracking-tight outline-none">
              {selected ? "Run results" : "Past runs"}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              The app keeps up to {MAX_RUN_HISTORY_ENTRIES} runs in this browser tab. Closing the tab or signing out deletes them. Download
              the reports to keep a permanent record.
            </p>
          </div>
          {!selected && history.entries.length > 0 && (
            <Button variant="outline" onClick={() => setPendingDelete({ kind: "all" })}>
              <Trash2 aria-hidden="true" />
              Clear all
            </Button>
          )}
        </div>

        {!history.storageAvailable && (
          <p className="text-sm text-muted-foreground">
            This browser blocks session storage, so the app cannot keep a run history.
          </p>
        )}

        {selected ? (
          <RunHistoryDetail entry={selected} onBack={() => setSelectedId(null)} />
        ) : history.entries.length === 0 ? (
          <div className="data-card rounded-2xl border bg-card/90 p-8 text-center">
            <History aria-hidden="true" className="mx-auto mb-3 size-8 text-muted-foreground" />
            <p className="font-medium">No runs yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              When a run finishes, its results show here.
            </p>
            <Button asChild className="mt-4">
              <Link href="/wizard">Open the wizard</Link>
            </Button>
          </div>
        ) : (
          <RunHistoryList
            entries={history.entries}
            onOpen={(entry) => setSelectedId(entry.id)}
            onDelete={(entry) => setPendingDelete({ kind: "one", entry })}
          />
        )}

        <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {status}
        </p>
      </main>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={pendingDelete?.kind === "all" ? "Delete all runs from history?" : "Delete this run from history?"}
        description={pendingDelete?.kind === "all"
          ? "The app deletes every run in the history of this tab. Your tenant does not change. You cannot undo this."
          : "The app deletes this run from the history of this tab. Your tenant does not change. You cannot undo this."}
        confirmLabel={pendingDelete?.kind === "all" ? "Delete all runs" : "Delete run"}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
