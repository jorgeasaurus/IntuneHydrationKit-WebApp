"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { createGraphClient } from "@/lib/graph/client";
import { readBaselineChanges, type BaselineChangeItem } from "@/lib/hydration/baselineChangeReview";
import type { BaselineSelection, TenantConfig } from "@/types/hydration";

interface BaselineChangeReviewProps {
  tenantConfig?: TenantConfig;
  selection?: BaselineSelection;
}

function BaselineChangeList({ items }: { items: BaselineChangeItem[] }): React.JSX.Element {
  const newCount = items.filter((item) => item.status === "new").length;
  const existingCount = items.filter((item) => item.status === "existing").length;
  const unavailableCount = items.filter((item) => item.status === "unavailable").length;
  const olderCount = items.reduce((count, item) => count + item.olderVersions.length, 0);
  return (
    <div className="space-y-3 text-sm">
      <p>{newCount} new; {existingCount} existing; {olderCount} older versions; {unavailableCount} not checked.</p>
      <p className="text-slate-300">This is a name inventory. Settings are checked for existing policies during the run. Older versions remain in the tenant. No policies are deleted or updated.</p>
      <details>
        <summary className="cursor-pointer">View policy changes</summary>
        <ul className="mt-3 max-h-80 space-y-3 overflow-y-auto">
          {items.map((item) => (
            <li key={item.path}>
              <p className="font-medium">{item.name}</p>
              <p>{item.status === "new" ? "New policy" : item.status === "existing" ? `Existing policy (${item.matchType} name match)` : "Could not check this policy"}</p>
              {item.matched && <p className="break-all text-slate-300">Matched: {item.matched.name ?? item.matched.displayName} ({item.matched.id})</p>}
              {item.olderVersions.map((older) => <p key={older.id} className="text-slate-300">Older version retained: {older.name ?? older.displayName} ({older.id})</p>)}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

/** Check selected baseline names before a run, scoped to the current tenant and selection. */
function BaselineChangeReviewSession({ tenantConfig, selection }: BaselineChangeReviewProps): React.JSX.Element {
  const scope = JSON.stringify([tenantConfig?.tenantId, tenantConfig?.homeAccountId, selection]);
  const currentScope = useRef(scope);
  const requestId = useRef(0);
  const [result, setResult] = useState<{ scope: string; items: BaselineChangeItem[] }>();
  const [pendingScope, setPendingScope] = useState<string>();
  const [error, setError] = useState<{ scope: string; message: string }>();
  useEffect(() => {
    currentScope.current = scope;
    requestId.current += 1;
    return () => { requestId.current += 1; };
  }, [scope]);

  async function checkChanges(): Promise<void> {
    if (!tenantConfig?.tenantId || !tenantConfig.homeAccountId) return;
    const request = ++requestId.current;
    setPendingScope(scope);
    setError(undefined);
    try {
      const client = createGraphClient({ tenantId: tenantConfig.tenantId, homeAccountId: tenantConfig.homeAccountId });
      const items = await readBaselineChanges(client, selection);
      if (request === requestId.current && currentScope.current === scope) setResult({ scope, items });
    } catch {
      if (request === requestId.current && currentScope.current === scope) {
        setError({ scope, message: "The baseline inventory could not be read. Check your connection and sign-in, then try again." });
      }
    } finally {
      if (request === requestId.current) setPendingScope(undefined);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-white/15 bg-slate-950/70 p-5 text-slate-100" aria-label="Baseline change review">
      <h3 className="font-semibold">Baseline changes</h3>
      <p className="text-sm text-slate-300">Read the selected tenant to see new policies, existing name matches, and older policy versions before this run.</p>
      <Button variant="outline" className="border-white/20 bg-white/5 text-slate-100 hover:bg-white/10 hover:text-white" onClick={checkChanges} disabled={!tenantConfig?.homeAccountId || pendingScope === scope}>
        {pendingScope === scope ? "Checking baseline changes…" : "Check baseline changes"}
      </Button>
      {error?.scope === scope && <Alert role="alert" className="border-amber-400/40 bg-slate-950/80 text-slate-100"><AlertTitle>Check incomplete</AlertTitle><AlertDescription>{error.message}</AlertDescription></Alert>}
      {result?.scope === scope && <BaselineChangeList items={result.items} />}
    </section>
  );
}

/** Reset the review whenever its tenant, account, or selected policy scope changes. */
export function BaselineChangeReview(props: BaselineChangeReviewProps): React.JSX.Element {
  const scope = JSON.stringify([props.tenantConfig?.tenantId, props.tenantConfig?.homeAccountId, props.selection]);
  return <BaselineChangeReviewSession key={scope} {...props} />;
}
