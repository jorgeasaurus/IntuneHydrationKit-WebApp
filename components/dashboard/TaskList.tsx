"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HydrationTask, TaskStatus } from "@/types/hydration";
import { CheckCircle2, XCircle, Circle, Loader2, Ban, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface TaskListProps {
  tasks: HydrationTask[];
}

const STATUS_ICONS: Record<TaskStatus, React.ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />,
  failed: <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />,
  running: <Loader2 className="h-4 w-4 text-blue-600 dark:text-blue-400 animate-spin" />,
  pending: <Circle className="h-4 w-4 text-gray-400" />,
  skipped: <Ban className="h-4 w-4 text-amber-600 dark:text-amber-400" />,
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  success: "Success",
  failed: "Failed",
  running: "Running",
  pending: "Pending",
  skipped: "Skipped",
};

export function TaskList({ tasks }: TaskListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Filter tasks
  const filteredTasks = tasks.filter((task) => {
    const matchesSearch = task.itemName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || task.status === statusFilter;
    const matchesCategory = categoryFilter === "all" || task.category === categoryFilter;
    return matchesSearch && matchesStatus && matchesCategory;
  });

  // Get unique categories
  const categories = Array.from(new Set(tasks.map((t) => t.category)));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Task Details</CardTitle>
        <CardDescription>
          {filteredTasks.length} of {tasks.length} tasks shown
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input
            placeholder="Search tasks..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as TaskStatus | "all")}
          >
            <SelectTrigger>
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="skipped">Skipped</SelectItem>
            </SelectContent>
          </Select>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category} value={category}>
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Task List */}
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No tasks match your filters</p>
            </div>
          ) : (
            filteredTasks.map((task) => (
              <div
                key={task.id}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3 transition-colors",
                  task.status === "running" && "bg-blue-50 dark:bg-blue-950/20",
                  task.status === "failed" && "bg-red-50 dark:bg-red-950/20"
                )}
              >
                <div className="mt-0.5">{STATUS_ICONS[task.status]}</div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium leading-none">{task.itemName}</p>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {STATUS_LABELS[task.status]}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {task.category.charAt(0).toUpperCase() + task.category.slice(1)}
                  </p>
                  {task.error && (
                    <div className={cn(
                      "flex items-start gap-2 mt-2 p-2 rounded",
                      task.status === "skipped"
                        ? "bg-amber-100 dark:bg-amber-900/20"
                        : "bg-red-100 dark:bg-red-900/20"
                    )}>
                      {task.status === "skipped" ? (
                        <AlertCircle className="h-3 w-3 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-3 w-3 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                      )}
                      <p className={cn(
                        "text-xs",
                        task.status === "skipped"
                          ? "text-amber-700 dark:text-amber-300"
                          : "text-red-700 dark:text-red-300"
                      )}>{task.error}</p>
                    </div>
                  )}
                  {task.startTime && task.endTime && (
                    <p className="text-xs text-muted-foreground">
                      Duration:{" "}
                      {Math.round((task.endTime.getTime() - task.startTime.getTime()) / 1000)}s
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
