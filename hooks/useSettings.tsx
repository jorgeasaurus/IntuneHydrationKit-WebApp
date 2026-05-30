"use client";

import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from "react";
import { AppSettings } from "@/types/hydration";
import { APP_SETTINGS_STORAGE_KEY } from "@/lib/storageKeys";

const DEFAULT_SETTINGS: AppSettings = {
  stopOnFirstError: false,
  theme: "system",
};

function normalizeTheme(theme: unknown): AppSettings["theme"] {
  if (
    theme === "light" ||
    theme === "dark" ||
    theme === "system" ||
    theme === "corporate-1999"
  ) {
    return theme;
  }

  return DEFAULT_SETTINGS.theme;
}

function normalizeSettings(candidate: unknown): AppSettings {
  if (!candidate || typeof candidate !== "object") {
    return DEFAULT_SETTINGS;
  }

  const parsed = candidate as Partial<AppSettings>;

  return {
    stopOnFirstError: parsed.stopOnFirstError ?? DEFAULT_SETTINGS.stopOnFirstError,
    theme: normalizeTheme(parsed.theme),
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
    return DEFAULT_SETTINGS;
  }

  const stored = localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
  if (!stored) {
    return DEFAULT_SETTINGS;
  }

  try {
    return normalizeSettings(JSON.parse(stored));
  } catch (error) {
    console.error("Failed to parse stored settings:", error);
    return DEFAULT_SETTINGS;
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => readStoredSettings());

  const updateSettings = useCallback((newSettings: Partial<AppSettings>) => {
    setSettings((prev) => {
      const updated = normalizeSettings({ ...prev, ...newSettings });
      localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS));
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
