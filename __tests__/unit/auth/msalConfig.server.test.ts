// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

/**
 * Server render: msal-browser v5 creates the instance without `window`, tries sessionStorage,
 * logs "window is not defined", and uses memory storage. The app logger must not print that.
 */
describe("msalConfig on the server", () => {
  it("creates the MSAL instance without console output", async () => {
    expect(typeof window).toBe("undefined");
    const consoleSpies = (["error", "warn", "info", "debug"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {})
    );

    const { msalInstance } = await import("@/lib/auth/msalConfig");

    expect(msalInstance.getActiveAccount()).toBeNull();
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
