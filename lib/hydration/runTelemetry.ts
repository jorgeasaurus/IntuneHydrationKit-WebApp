import type { BatchRequest } from "@/lib/graph/batch";
import type { BatchExecutionStats, HydrationTask } from "@/types/hydration";

/** Count dispatched batches and tasks that entered each execution path. */
export function createRunTelemetry(batchSize: number, batchingEnabled: boolean) {
  let batchRequestCount = 0;
  const batchedTasks = new Set<string>();
  const sequentialTasks = new Set<string>();
  return {
    onBatchDispatch(requests: BatchRequest[]) {
      batchRequestCount++;
      requests.forEach((request) => batchedTasks.add(`${request.method}:${request.url}:${request.id}`));
    },
    onSequentialTask(task: HydrationTask) {
      sequentialTasks.add(task.id);
    },
    snapshot(): BatchExecutionStats {
      return { batchingEnabled, batchSize, batchRequestCount, batchedTaskCount: batchedTasks.size, sequentialTaskCount: sequentialTasks.size };
    },
  };
}
