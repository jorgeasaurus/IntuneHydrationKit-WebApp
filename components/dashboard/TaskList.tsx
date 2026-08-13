"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HydrationTask, TaskStatus } from "@/types/hydration";
import { AlertCircle, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { TaskRow } from "@/components/dashboard/TaskRow";
import { getTaskCategoryLabel } from "@/components/dashboard/categoryLabels";

interface TaskListProps {
  tasks: HydrationTask[];
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  success: "Success",
  failed: "Failed",
  running: "Running",
  pending: "Pending",
  skipped: "Skipped",
};

const STATUS_FILTERS: Array<TaskStatus | "all"> = [
  "all",
  "running",
  "failed",
  "success",
  "skipped",
  "pending",
];

export function TaskList({ tasks }: TaskListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const deferredSearchTerm = useDeferredValue(searchTerm);

  const statusCounts = useMemo(() => {
    const counts: Record<TaskStatus | "all", number> = {
      all: tasks.length,
      pending: 0,
      running: 0,
      success: 0,
      failed: 0,
      skipped: 0,
    };

    for (const task of tasks) {
      counts[task.status] += 1;
    }

    return counts;
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const normalizedSearch = deferredSearchTerm.trim().toLowerCase();

    return tasks.filter((task) => {
      const matchesSearch = !normalizedSearch
        || task.itemName.toLowerCase().includes(normalizedSearch)
        || getTaskCategoryLabel(task.category).toLowerCase().includes(normalizedSearch);
      const matchesStatus = statusFilter === "all" || task.status === statusFilter;
      const matchesCategory = categoryFilter === "all" || task.category === categoryFilter;
      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [categoryFilter, deferredSearchTerm, statusFilter, tasks]);

  const categories = useMemo(
    () => Array.from(new Set(tasks.map((task) => task.category)))
      .sort((a, b) => getTaskCategoryLabel(a).localeCompare(getTaskCategoryLabel(b))),
    [tasks]
  );

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-white/10 bg-black/15">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-sky-200">
          Live task stream
        </p>
        <CardTitle>Task Details</CardTitle>
        <CardDescription>
          <span aria-live="polite">
            {filteredTasks.length} of {tasks.length} tasks shown
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 pt-6">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="relative">
            <Label className="sr-only" htmlFor="task-search">
              Search tasks
            </Label>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
            />
            <Input
              id="task-search"
              placeholder="Search tasks or categories…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-9"
            />
            {searchTerm && (
              <button
                type="button"
                aria-label="Clear task search"
                onClick={() => setSearchTerm("")}
                className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            )}
          </div>

          <div>
            <Label className="sr-only" htmlFor="task-category-filter">
              Filter tasks by category
            </Label>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger id="task-category-filter" aria-label="Filter tasks by category">
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {getTaskCategoryLabel(category)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div
          role="group"
          aria-label="Filter tasks by status"
          className="flex gap-2 overflow-x-auto pb-1"
        >
          {STATUS_FILTERS.map((status) => {
            const isActive = statusFilter === status;
            const label = status === "all" ? "All" : STATUS_LABELS[status];

            return (
              <button
                key={status}
                type="button"
                aria-label={`${label}: ${statusCounts[status]} ${statusCounts[status] === 1 ? "task" : "tasks"}`}
                aria-pressed={isActive}
                onClick={() => setStatusFilter(status)}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-2 rounded-full border px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors",
                  isActive
                    ? "border-sky-200/50 bg-sky-200 text-slate-950 shadow-[0_0_24px_rgb(125_211_252_/_0.16)]"
                    : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/25 hover:bg-white/[0.08] hover:text-white"
                )}
              >
                <span>{label}</span>
                <span
                  className={cn(
                    "tabular-nums",
                    isActive ? "text-slate-700" : "text-slate-500"
                  )}
                >
                  {statusCounts[status]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="max-h-[600px] overflow-y-auto pr-1">
          {filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-black/15 py-12 text-center">
              <AlertCircle className="mb-3 size-7 text-slate-400" />
              <p className="text-sm font-medium text-slate-200">No tasks match your filters</p>
              <p className="mt-1 text-xs text-slate-400">Change the search or filter selection.</p>
            </div>
          ) : (
            <ol aria-label="Hydration tasks" className="space-y-2">
              {filteredTasks.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </ol>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
