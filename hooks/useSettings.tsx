"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import type { AppSettings } from "@/types/hydration";
import { APP_SETTINGS_STORAGE_KEY } from "@/lib/storageKeys";
import { DEFAULT_APP_SETTINGS } from "@/lib/settings";

function normalizeSettings(candidate: unknown): AppSettings {
  if (!candidate || typeof candidate !== "object") {
    return DEFAULT_APP_SETTINGS;
  }

  const parsed = candidate as Partial<AppSettings>;

  return {
    stopOnFirstError: typeof parsed.stopOnFirstError === "boolean"
      ? parsed.stopOnFirstError
      : DEFAULT_APP_SETTINGS.stopOnFirstError,
    demoMode: typeof parsed.demoMode === "boolean"
      ? parsed.demoMode
      : DEFAULT_APP_SETTINGS.demoMode,
  };
}

interface SettingsContextType {
  settings: AppSettings;
  updateSettings: (settings: Partial<AppSettings>) => void;
  resetSettings: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

function readStoredSettings(): AppSettings {
  if (typeof window === "undefined") {
    return DEFAULT_APP_SETTINGS;
  }

  const stored = localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
  if (!stored) {
    return DEFAULT_APP_SETTINGS;
  }

  try {
    return normalizeSettings(JSON.parse(stored));
  } catch (error) {
    console.error("Failed to parse stored settings:", error);
    // Remove the corrupted entry so it doesn't fail on every load
    localStorage.removeItem(APP_SETTINGS_STORAGE_KEY);
    return DEFAULT_APP_SETTINGS;
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => readStoredSettings());

  const updateSettings = useCallback((newSettings: Partial<AppSettings>) => {
    setSettings((prev) => normalizeSettings({ ...prev, ...newSettings }));
  }, []);

  // Persist settings whenever they change; keeps the updater pure
  useEffect(() => {
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_APP_SETTINGS);
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(DEFAULT_APP_SETTINGS));
  }, []);

  const value = useMemo(
    () => ({ settings, updateSettings, resetSettings }),
    [settings, updateSettings, resetSettings]
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}
