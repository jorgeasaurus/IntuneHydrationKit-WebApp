"use client";

import { TargetSelectionView } from "@/components/wizard/TargetSelectionView";
import { useTargetSelectionController } from "@/components/wizard/useTargetSelectionController";

export function TargetSelection() {
  const model = useTargetSelectionController();

  return <TargetSelectionView model={model} />;
}
