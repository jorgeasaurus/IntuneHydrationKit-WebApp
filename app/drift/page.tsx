"use client";

import Link from "next/link";
import { LayoutDashboard, Wand2 } from "lucide-react";
import { AppNavigation } from "@/components/AppNavigation";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { DriftScanView } from "@/components/drift/DriftScanView";
import { Button } from "@/components/ui/button";

export default function DriftPage(): React.JSX.Element {
  return (
    <ProtectedRoute>
      <div className="relative z-10 min-h-screen">
        <AppNavigation
          eyebrow={<span className="font-mono text-[11px] uppercase tracking-[0.28em] text-hydrate">Tenant check</span>}
          title="Drift Scan"
          description="Compare kit objects in the tenant with the current templates."
          actions={
            <>
              <Button variant="outline" asChild className="size-9 px-0 sm:w-auto sm:px-3">
                <Link href="/wizard">
                  <Wand2 aria-hidden="true" className="size-4 sm:mr-2" />
                  <span className="sr-only sm:not-sr-only">Wizard</span>
                </Link>
              </Button>
              <Button variant="outline" asChild className="size-9 px-0 sm:w-auto sm:px-3">
                <Link href="/dashboard">
                  <LayoutDashboard aria-hidden="true" className="size-4 sm:mr-2" />
                  <span className="sr-only sm:not-sr-only">Dashboard</span>
                </Link>
              </Button>
            </>
          }
        />
        <main className="container mx-auto max-w-5xl px-4 py-8">
          <DriftScanView />
        </main>
      </div>
    </ProtectedRoute>
  );
}
