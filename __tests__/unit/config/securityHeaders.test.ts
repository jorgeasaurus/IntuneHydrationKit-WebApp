import { describe, expect, it, vi } from "vitest";

vi.mock("@azure/msal-browser", () => ({
  LogLevel: {},
  PublicClientApplication: class {},
}));

import nextConfig from "../../../next.config";
import { MSAL_REDIRECT_BRIDGE_PATH } from "@/lib/auth/msalConfig";

type HeaderEntry = { source: string; headers: { key: string; value: string }[] };

/** Apply Next.js precedence: every matching entry applies, and the last value wins. */
function resolveHeaders(entries: HeaderEntry[], matchingSources: string[]) {
  const resolved = new Map<string, string>();
  for (const entry of entries) {
    if (!matchingSources.includes(entry.source)) continue;
    for (const header of entry.headers) resolved.set(header.key, header.value);
  }
  return resolved;
}

describe("security headers", () => {
  it("allows only the redirect bridge page to be framed, and only by the same origin", async () => {
    const entries = (await nextConfig.headers!()) as HeaderEntry[];
    expect(entries.map((entry) => entry.source)).toEqual([
      "/:path*",
      MSAL_REDIRECT_BRIDGE_PATH,
    ]);

    const site = resolveHeaders(entries, ["/:path*"]);
    expect(site.get("X-Frame-Options")).toBe("DENY");
    expect(site.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(site.get("Content-Security-Policy")).toContain(
      "frame-src 'self' https://login.microsoftonline.com"
    );

    const redirect = resolveHeaders(entries, ["/:path*", MSAL_REDIRECT_BRIDGE_PATH]);
    expect(redirect.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(redirect.get("Content-Security-Policy")).toBe(
      "default-src 'none'; script-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'"
    );
  });

  it("serves no Cross-Origin-Opener-Policy, which would break the MSAL redirect bridge", async () => {
    const entries = (await nextConfig.headers!()) as HeaderEntry[];
    const headerKeys = entries.flatMap((entry) => entry.headers.map((header) => header.key));

    expect(headerKeys).not.toContain("Cross-Origin-Opener-Policy");
  });
});
