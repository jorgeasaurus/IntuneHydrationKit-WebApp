"use client";

import { useSettings } from "@/hooks/useSettings";
import { cn } from "@/lib/utils";

interface SensitiveDataProps {
  value?: string | null;
  fallback: string;
  className?: string;
}

export function SensitiveData({ value, fallback, className }: SensitiveDataProps): React.JSX.Element {
  const { settings } = useSettings();
  const visibleValue = value || fallback;

  if (!settings.demoMode || !value) {
    return <span className={className}>{visibleValue}</span>;
  }

  return (
    <>
      <span aria-hidden="true" className={cn("demo-sensitive-data", className)}>
        {value}
      </span>
      <span className="sr-only">Sensitive data hidden while Demo Mode is on</span>
    </>
  );
}
