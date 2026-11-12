"use client";

import { useMemo, useSyncExternalStore } from "react";
import { getExecutionState, subscribeExecutionState } from "@/lib/hydration/executionStateStore";
import type { ExecutionResult } from "@/lib/hydration/types";
import { getCachedTemplates, type BaselinePolicy } from "@/lib/templates/loader";
import { findBaselineTemplateForTask } from "@/lib/templates/baselineLookup";
import { getPortalLink, type PortalLink } from "@/lib/utils/portalLinks";
import type { CloudEnvironment, HydrationTask } from "@/types/hydration";

interface CreatedObject {
  id: string;
  policyType?: string;
}

interface CreatedObjects {
  runId: number;
  cloud: CloudEnvironment;
  objects: ReadonlyMap<string, CreatedObject>;
}

/**
 * IDs of objects that the current run created, keyed by task ID.
 *
 * The IDs stay in memory for this page session only. The saved execution record
 * does not contain them, so a restored run after a page refresh has no links.
 */
let createdObjects: CreatedObjects | null = null;
const listeners = new Set<() => void>();
const NO_LINKS: ReadonlyMap<string, PortalLink> = new Map();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const unsubscribeExecution = subscribeExecutionState(listener);
  return () => {
    listeners.delete(listener);
    unsubscribeExecution();
  };
}

function getSnapshot(): CreatedObjects | null {
  const current = createdObjects;
  return current && current.runId === getExecutionState().runId ? current : null;
}

function getServerSnapshot(): CreatedObjects | null {
  return null;
}

function getBaselinePolicyType(task: HydrationTask): string | undefined {
  const templates = getCachedTemplates("baseline") as BaselinePolicy[] | null;
  return templates ? findBaselineTemplateForTask(templates, task)?._oibPolicyType : undefined;
}

/** Keep the IDs of objects that a live create run made. Preview runs create nothing. */
export function recordCreatedObjects(
  runId: number,
  cloud: CloudEnvironment,
  results: readonly ExecutionResult[],
): void {
  const objects = new Map<string, CreatedObject>();
  for (const result of results) {
    const { task, createdId } = result;
    if (!createdId || result.skipped || task.operation !== "create") continue;
    objects.set(task.id, {
      id: createdId,
      ...(task.category === "baseline" ? { policyType: getBaselinePolicyType(task) } : {}),
    });
  }
  createdObjects = { runId, cloud, objects };
  listeners.forEach((listener) => listener());
}

/** Test-only: remove the recorded IDs. */
export function clearCreatedObjectsForTests(): void {
  createdObjects = null;
  listeners.forEach((listener) => listener());
}

/**
 * Build portal links for successful create tasks of the current live run.
 * Failed, skipped, delete, and preview tasks never get a link.
 */
export function buildCreatedObjectLinks(
  tasks: readonly HydrationTask[],
  created: CreatedObjects | null,
  isPreview: boolean,
): ReadonlyMap<string, PortalLink> {
  if (!created || isPreview) return NO_LINKS;
  const links = new Map<string, PortalLink>();
  for (const task of tasks) {
    if (task.status !== "success" || task.operation !== "create") continue;
    const object = created.objects.get(task.id);
    if (!object) continue;
    const link = getPortalLink({
      cloud: created.cloud,
      category: task.category,
      objectId: object.id,
      objectName: task.itemName,
      policyType: object.policyType,
    });
    if (link) links.set(task.id, link);
  }
  return links;
}

/** Portal links for the tasks on screen, keyed by task ID. */
export function useCreatedObjectLinks(
  tasks: readonly HydrationTask[],
  isPreview: boolean,
): ReadonlyMap<string, PortalLink> {
  const created = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return useMemo(() => buildCreatedObjectLinks(tasks, created, isPreview), [created, isPreview, tasks]);
}
