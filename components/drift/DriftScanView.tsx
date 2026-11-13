"use client";

import { useEffect, useRef, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { RefreshCw, ScanSearch } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SensitiveData } from "@/components/SensitiveData";
import { DriftResult } from "@/components/drift/DriftResult";
import { createGraphClient } from "@/lib/graph/client";
import { runDriftScan, type DriftReport } from "@/lib/hydration/drift/scan";

const SCANNED = "Groups, device filters, compliance policies, Conditional Access policies, App Protection policies, and OpenIntuneBaseline policies";
const NOT_SCANNED = "Enrollment profiles, Win32 apps, notification templates, and CIS Baseline policies";

/** Read-only drift scan of the signed-in tenant. */
export function DriftScanView(): React.JSX.Element {
  const { instance, accounts } = useMsal();
  const account = instance.getActiveAccount() ?? accounts[0];
  const [report, setReport] = useState<DriftReport>();
  const [progress, setProgress] = useState<string>();
  const [error, setError] = useState<string>();
  const cancelled = useRef(false);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      cancelled.current = true;
    };
  }, []);

  async function scan(): Promise<void> {
    if (!account) return;
    cancelled.current = false;
    setError(undefined);
    setReport(undefined);
    setProgress("Starting the scan...");
    try {
      const client = createGraphClient({ tenantId: account.tenantId, homeAccountId: account.homeAccountId });
      const result = await runDriftScan(client, account.tenantId, {
        shouldCancel: () => cancelled.current,
        onProgress: (message) => {
          if (active.current) setProgress(message);
        },
      });
      if (active.current) setReport(result);
    } catch {
      if (!active.current) return;
      setError(
        cancelled.current
          ? "The scan was cancelled. No result is shown."
          : "The tenant could not be read. Check your connection and sign-in, then try again."
      );
    } finally {
      if (active.current) setProgress(undefined);
    }
  }

  const running = progress !== undefined;
  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-white/10 bg-black/15">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-sky-200">Read-only</p>
              <CardTitle className="mt-2">Compare the tenant with the templates</CardTitle>
              <CardDescription className="mt-1 max-w-2xl">
                The scan reads the objects that the kit created in{" "}
                <SensitiveData value={account?.tenantId} fallback="the signed-in tenant" /> and compares them with the
                current templates. It sends GET requests only and does not change the tenant.
              </CardDescription>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button onClick={scan} disabled={!account || running}>
                {report ? (
                  <RefreshCw aria-hidden="true" className="mr-2 size-4" />
                ) : (
                  <ScanSearch aria-hidden="true" className="mr-2 size-4" />
                )}
                {running ? "Scanning…" : report ? "Scan again" : "Start drift scan"}
              </Button>
              {running && (
                <Button variant="outline" onClick={() => { cancelled.current = true; }}>
                  Cancel scan
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-slate-400">Scanned</dt>
              <dd className="mt-1 text-slate-200">{SCANNED}.</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Not scanned</dt>
              <dd className="mt-1 text-slate-200">{NOT_SCANNED}.</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Compared</dt>
              <dd className="mt-1 text-slate-200">
                Only the settings that a template defines. Names, descriptions, assignments, and Graph metadata are not
                compared.
              </dd>
            </div>
          </dl>
          {running && (
            <p role="status" aria-live="polite" className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 font-mono text-xs text-slate-300">
              {progress}
            </p>
          )}
          {error && (
            <Alert role="alert">
              <AlertTitle>Scan incomplete</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
      {report && <DriftResult report={report} />}
    </div>
  );
}
