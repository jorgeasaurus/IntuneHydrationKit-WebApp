import { clearExecutionRecord } from "@/lib/hydration/executionRecord";
import { resetExecutionSession } from "@/lib/hydration/executionStateStore";

export function resetHydrationFlow(storage: Storage, resetWizard: () => void): void {
  clearExecutionRecord(storage);
  resetExecutionSession();
  resetWizard();
}
