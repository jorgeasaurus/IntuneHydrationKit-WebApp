"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Pause, Play, Square, Download, Layers } from "lucide-react";
import { HydrationTask, BatchProgress } from "@/types/hydration";
import { formatDateTime } from "@/lib/utils/dateFormat";

interface ExecutionControlsProps {
  tasks: HydrationTask[];
  isPaused: boolean;
  isCompleted: boolean;
  startTime: Date;
  endTime?: Date | null;
  batchProgress?: BatchProgress | null;
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
  onDownloadLog?: () => void;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

export function ExecutionControls({
  tasks,
  isPaused,
  isCompleted,
  startTime,
  endTime,
  batchProgress,
  onPause,
  onResume,
  onCancel,
  onDownloadLog,
}: ExecutionControlsProps) {
  const [elapsedTime, setElapsedTime] = useState(0);

  // Update elapsed time every second
  useEffect(() => {
    if (isCompleted || isPaused) return;

    const interval = setInterval(() => {
      setElapsedTime(Date.now() - startTime.getTime());
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime, isCompleted, isPaused]);

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(
    (t) => t.status === "success" || t.status === "failed" || t.status === "skipped"
  ).length;

  // Calculate estimated time remaining
  const avgTimePerTask =
    completedTasks > 0 ? elapsedTime / completedTasks : 0;
  const remainingTasks = totalTasks - completedTasks;
  const estimatedTimeRemaining = avgTimePerTask * remainingTasks;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Execution Controls</CardTitle>
        <CardDescription>
          {isCompleted
            ? "Execution completed"
            : isPaused
              ? "Execution paused"
              : "Execution in progress"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Batch Progress Indicator */}
        {batchProgress && batchProgress.isActive && (
          <section
            aria-label="Batch processing status"
            className="overflow-hidden rounded-xl border border-white/[0.12] bg-slate-950/65 text-slate-100 shadow-[inset_0_1px_0_rgb(255_255_255_/_0.06)] backdrop-blur-md"
          >
            <div className="flex flex-col gap-4 border-b border-white/10 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-sky-300/20 bg-sky-300/10 text-sky-100">
                  <Layers aria-hidden="true" className="size-4" />
                </span>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-sky-200">
                    Graph batch
                  </p>
                  <h3 className="mt-1 text-sm font-semibold text-white">Batch processing</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    Parallel requests are active for the current task group.
                  </p>
                </div>
              </div>

              <span className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-100">
                <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-emerald-300" />
                Active
              </span>
            </div>

            <div className="space-y-3 p-4">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">Batch</p>
                  <p className="mt-1 font-medium tabular-nums text-white">
                    {batchProgress.currentBatch} / {batchProgress.totalBatches}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">Capacity</p>
                  <p className="mt-1 font-medium tabular-nums text-white">
                    {batchProgress.itemsInBatch} per batch
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">Graph API</p>
                  <p className="mt-1 font-medium text-white">{batchProgress.apiVersion}</p>
                </div>
              </div>

              <progress
                aria-label="Batch progress"
                value={batchProgress.currentBatch}
                max={batchProgress.totalBatches}
                className="h-1.5 w-full overflow-hidden rounded-full bg-white/10 accent-sky-300 [&::-moz-progress-bar]:bg-sky-300 [&::-webkit-progress-bar]:bg-white/10 [&::-webkit-progress-value]:bg-sky-300"
              />
              <p className="text-xs text-slate-400">
                Processing {batchProgress.itemsInBatch} items through the Graph API $batch endpoint.
              </p>
            </div>
          </section>
        )}

        {/* Timer */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Elapsed Time</p>
            <p className="text-2xl font-bold font-mono">{formatDuration(elapsedTime)}</p>
          </div>
          {!isCompleted && remainingTasks > 0 && completedTasks > 0 && (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Estimated Remaining</p>
              <p className="text-2xl font-bold font-mono">
                {formatDuration(estimatedTimeRemaining)}
              </p>
            </div>
          )}
        </div>

        {/* Start/End Time */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Started</p>
            <p className="font-medium">{formatDateTime(startTime)}</p>
          </div>
          {isCompleted && (
            <div>
              <p className="text-muted-foreground">Completed</p>
              <p className="font-medium">{endTime ? formatDateTime(endTime) : "Completed"}</p>
            </div>
          )}
        </div>

        {/* Control Buttons */}
        {!isCompleted && (
          <div className="flex gap-2">
            {!isPaused ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onPause}
                disabled={!onPause}
                className="flex-1"
              >
                <Pause className="size-4 mr-2" />
                Pause
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={onResume}
                disabled={!onResume}
                className="flex-1"
              >
                <Play className="size-4 mr-2" />
                Resume
              </Button>
            )}
            <Button
              variant="destructive"
              size="sm"
              onClick={onCancel}
              disabled={!onCancel}
              className="flex-1"
            >
              <Square className="size-4 mr-2" />
              Cancel
            </Button>
          </div>
        )}

        {/* Download Log */}
        {isCompleted && (
          <Button
            variant="outline"
            size="sm"
            onClick={onDownloadLog}
            disabled={!onDownloadLog}
            className="w-full"
          >
            <Download className="size-4 mr-2" />
            Download Execution Log
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
