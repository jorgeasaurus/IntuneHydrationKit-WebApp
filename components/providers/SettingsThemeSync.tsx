"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

import { useSettings } from "@/hooks/useSettings";

export function SettingsThemeSync(): null {
  const { settings } = useSettings();
  const { setTheme } = useTheme();

  useEffect(() => {
    setTheme(settings.theme);
  }, [setTheme, settings.theme]);

  return null;
}
