"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { AppSettings } from "@/types/hydration";

const DEFAULT_SETTINGS: AppSettings = {
  stopOnFirstError: true,
  theme: "system",
};

function normalizeTheme(theme: unknown): AppSettings["theme"] {
  if (
    theme === "light" ||
    theme === "dark" ||
    theme === "system" ||
    theme === "blueprint" ||
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

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // Load settings from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("app-settings");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSettings(normalizeSettings(parsed));
      } catch (error) {
        console.error("Failed to parse stored settings:", error);
      }
    }
  }, []);

  const updateSettings = (newSettings: Partial<AppSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      localStorage.setItem("app-settings", JSON.stringify(updated));
      return updated;
    });
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    localStorage.setItem("app-settings", JSON.stringify(DEFAULT_SETTINGS));
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, resetSettings }}>
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
