"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export interface AppSettings {
  defaultCloudEnvironment: string;
  defaultBaselineRepo: string;
  defaultBaselineBranch: string;
  stopOnFirstError: boolean;
  enableVerboseLogging: boolean;
  autoDownloadReports: boolean;
  theme: "light" | "dark" | "system";
}

const DEFAULT_SETTINGS: AppSettings = {
  defaultCloudEnvironment: "Global",
  defaultBaselineRepo: "https://github.com/jorgeasaurus/OpenIntuneBaseline",
  defaultBaselineBranch: "main",
  stopOnFirstError: false,
  enableVerboseLogging: false,
  autoDownloadReports: false,
  theme: "system",
};

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
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
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
