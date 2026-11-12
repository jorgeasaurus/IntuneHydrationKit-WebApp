import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as getRedirectPage } from "@/app/auth/redirect/route";
import { GET as getBridgeScript } from "@/app/auth/redirect/bridge.js/route";

const BRIDGE_SCRIPT_SRC = "/auth/redirect/bridge.js";

describe("GET /auth/redirect", () => {
  it("returns an uncached page that loads only the same-origin bridge script", async () => {
    const response = getRedirectPage();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = await response.text();
    expect(body.startsWith("<!doctype html>")).toBe(true);
    // A static title keeps the response URL out of the tab title and history.
    expect(body).toContain("<title>Signing in</title>");
    expect(body.match(/<script\b[^>]*>/gi)).toEqual([`<script src="${BRIDGE_SCRIPT_SRC}">`]);
    // No inline script, so the page CSP needs only script-src 'self'.
    expect(body).toContain(`<script src="${BRIDGE_SCRIPT_SRC}"></script>`);
    expect(body).not.toMatch(/<link/i);
  });

  it("does not read the request, so the query string and hash cannot reach the body", () => {
    expect(getRedirectPage.length).toBe(0);
  });
});

describe(`GET ${BRIDGE_SCRIPT_SRC}`, () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/");
  });

  it("serves the redirect bridge from the installed msal-browser version", async () => {
    const response = getBridgeScript();

    expect(response.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    const script = await response.text();
    const { version } = JSON.parse(
      readFileSync(
        path.join(process.cwd(), "node_modules", "@azure", "msal-browser", "package.json"),
        "utf8"
      )
    ) as { version: string };
    expect(script.startsWith(`/*! @azure/msal-browser v${version} `)).toBe(true);
    expect(script).toContain("msalRedirectBridge.broadcastResponseToMainFrame()");
  });

  it("sends a popup response to the app window, clears it from the URL, and closes the popup", async () => {
    const posted: { channel: string; message: unknown }[] = [];
    class FakeBroadcastChannel {
      constructor(private readonly name: string) {}
      postMessage(message: unknown) {
        posted.push({ channel: this.name, message });
      }
      close() {}
    }
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    const close = vi.spyOn(window, "close").mockImplementation(() => {});

    const libraryState = Buffer.from(
      JSON.stringify({ id: "interaction-id", meta: { interactionType: "popup" } })
    ).toString("base64url");
    const responseFragment = `code=auth-code&state=${libraryState}`;
    window.history.replaceState(null, "", `/auth/redirect#${responseFragment}`);

    const script = await getBridgeScript().text();
    // Run the script as a classic browser script, as the page does.
    new Function(script)();

    await vi.waitFor(() => expect(close).toHaveBeenCalled());
    expect(posted).toEqual([
      { channel: "interaction-id", message: { v: 1, payload: responseFragment } },
    ]);
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/auth/redirect");
  });
});
