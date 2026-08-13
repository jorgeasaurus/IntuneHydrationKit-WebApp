import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { SensitiveData } from "@/components/SensitiveData";
import { SettingsProvider } from "@/hooks/useSettings";

describe("SensitiveData", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows sensitive data normally when Demo Mode is off", () => {
    render(
      <SettingsProvider>
        <SensitiveData value="operator@contoso.com" fallback="Not signed in" />
      </SettingsProvider>
    );

    expect(screen.getByText("operator@contoso.com")).not.toHaveClass("demo-sensitive-data");
    expect(screen.queryByText(/sensitive data hidden/i)).not.toBeInTheDocument();
  });

  it("visually blurs sensitive data and replaces its accessible text in Demo Mode", () => {
    localStorage.setItem(
      "app-settings:v1",
      JSON.stringify({ stopOnFirstError: false, demoMode: true })
    );

    render(
      <SettingsProvider>
        <SensitiveData value="operator@contoso.com" fallback="Not signed in" />
      </SettingsProvider>
    );

    expect(screen.getByText("operator@contoso.com")).toHaveClass("demo-sensitive-data");
    expect(screen.getByText("operator@contoso.com")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText(/sensitive data hidden while demo mode is on/i)).toHaveClass("sr-only");
  });

  it("does not blur fallback text in Demo Mode", () => {
    localStorage.setItem(
      "app-settings:v1",
      JSON.stringify({ stopOnFirstError: false, demoMode: true })
    );

    render(
      <SettingsProvider>
        <SensitiveData fallback="Awaiting validation" />
      </SettingsProvider>
    );

    expect(screen.getByText("Awaiting validation")).not.toHaveClass("demo-sensitive-data");
    expect(screen.queryByText(/sensitive data hidden/i)).not.toBeInTheDocument();
  });
});
