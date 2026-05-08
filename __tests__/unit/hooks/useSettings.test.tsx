import { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsProvider, useSettings } from "@/hooks/useSettings";
import { AppSettings } from "@/types/hydration";

const DEFAULT_SETTINGS = {
  stopOnFirstError: false,
  theme: "system",
} as const;

let store: Record<string, string> = {};

const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete store[key];
  }),
  clear: vi.fn(() => {
    store = {};
  }),
};

function wrapper({ children }: { children: ReactNode }) {
  return <SettingsProvider>{children}</SettingsProvider>;
}

describe("useSettings", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    store = {};
    Object.defineProperty(window, "localStorage", {
      value: localStorageMock,
      configurable: true,
    });
    window.localStorage.clear();
  });

  it("provides default settings when nothing is stored", () => {
    const { result } = renderHook(() => useSettings(), { wrapper });

    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("loads stored settings synchronously and normalizes unsupported themes", () => {
    window.localStorage.setItem(
      "app-settings",
      JSON.stringify({
        stopOnFirstError: false,
        theme: "retro-terminal",
      })
    );

    const { result } = renderHook(() => useSettings(), { wrapper });

    expect(result.current.settings).toEqual({
      stopOnFirstError: false,
      theme: "system",
    });
  });

  it("keeps defaults and logs when stored settings are invalid JSON", () => {
    window.localStorage.setItem("app-settings", "{");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() => useSettings(), { wrapper });

    expect(errorSpy).toHaveBeenCalledWith(
      "Failed to parse stored settings:",
      expect.any(SyntaxError)
    );

    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("merges updates into settings and persists them", () => {
    const { result } = renderHook(() => useSettings(), { wrapper });

    act(() => {
      result.current.updateSettings({ theme: "dark" });
      result.current.updateSettings({ stopOnFirstError: false });
    });

    expect(result.current.settings).toEqual({
      stopOnFirstError: false,
      theme: "dark",
    });
    expect(JSON.parse(window.localStorage.getItem("app-settings") ?? "{}")).toEqual({
      stopOnFirstError: false,
      theme: "dark",
    });
  });

  it("normalizes invalid updates before applying and persisting them", () => {
    const { result } = renderHook(() => useSettings(), { wrapper });

    act(() => {
      result.current.updateSettings({ theme: "retro-terminal" as AppSettings["theme"] });
    });

    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
    expect(JSON.parse(window.localStorage.getItem("app-settings") ?? "{}")).toEqual(DEFAULT_SETTINGS);
  });

  it("resets settings to defaults and persists the reset", () => {
    const { result } = renderHook(() => useSettings(), { wrapper });

    act(() => {
      result.current.updateSettings({ theme: "corporate-1999", stopOnFirstError: false });
      result.current.resetSettings();
    });

    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
    expect(JSON.parse(window.localStorage.getItem("app-settings") ?? "{}")).toEqual(DEFAULT_SETTINGS);
  });

  it("throws when used outside the provider", () => {
    expect(() => renderHook(() => useSettings())).toThrow(
      "useSettings must be used within a SettingsProvider"
    );
  });
});
