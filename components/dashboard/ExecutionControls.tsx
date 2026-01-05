"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Pause, Play, Square, Download } from "lucide-react";
import { HydrationTask } from "@/types/hydration";
import { format } from "date-fns";

interface ExecutionControlsProps {
  tasks: HydrationTask[];
  isPaused: boolean;
  isCompleted: boolean;
  startTime: Date;
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
  onDownloadLog?: () => void;
}

export function ExecutionControls({
  tasks,
  isPaused,
  isCompleted,
  startTime,
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

  const formatDuration = (ms: number): string => {
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
  };

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
            <p className="font-medium">{format(startTime, "PPp")}</p>
          </div>
          {isCompleted && (
            <div>
              <p className="text-muted-foreground">Completed</p>
              <p className="font-medium">{format(new Date(), "PPp")}</p>
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
                <Pause className="h-4 w-4 mr-2" />
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
                <Play className="h-4 w-4 mr-2" />
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
              <Square className="h-4 w-4 mr-2" />
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
            <Download className="h-4 w-4 mr-2" />
            Download Execution Log
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
