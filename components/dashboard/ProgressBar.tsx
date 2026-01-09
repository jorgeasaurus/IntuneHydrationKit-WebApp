"use client";

import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HydrationTask } from "@/types/hydration";

interface ProgressBarProps {
  tasks: HydrationTask[];
  title?: string;
  description?: string;
}

export function ProgressBar({ tasks, title, description }: ProgressBarProps) {
  const total = tasks.length;
  const completed = tasks.filter(
    (t) => t.status === "success" || t.status === "failed" || t.status === "skipped"
  ).length;
  const succeeded = tasks.filter((t) => t.status === "success").length;
  const failed = tasks.filter((t) => t.status === "failed").length;
  const skipped = tasks.filter((t) => t.status === "skipped").length;
  const running = tasks.filter((t) => t.status === "running").length;

  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title || "Overall Progress"}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="font-medium">
              {completed} of {total} tasks completed
            </span>
            <span className="text-muted-foreground">{percentage}%</span>
          </div>
          <Progress value={percentage} className="h-2" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Succeeded</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              {succeeded}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Failed</p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{failed}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Skipped</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {skipped}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Running</p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{running}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
