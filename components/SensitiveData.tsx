"use client";

import { useSettings } from "@/hooks/useSettings";

interface SensitiveDataProps {
  value?: string | null;
  fallback: string;
}

export function SensitiveData({ value, fallback }: SensitiveDataProps): React.JSX.Element {
  const { settings } = useSettings();
  const visibleValue = value || fallback;

  if (!settings.demoMode || !value) {
    return <span>{visibleValue}</span>;
  }

  return (
    <>
      <span aria-hidden="true" className="demo-sensitive-data">
        {value}
      </span>
      <span className="sr-only">Sensitive data hidden while Demo Mode is on</span>
    </>
  );
}
