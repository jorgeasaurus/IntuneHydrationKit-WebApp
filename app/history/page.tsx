"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { RunHistoryView } from "@/components/history/RunHistoryView";

export default function HistoryPage(): React.JSX.Element {
  return (
    <ProtectedRoute>
      <RunHistoryView />
    </ProtectedRoute>
  );
}
