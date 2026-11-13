import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * MSAL redirect bridge script for the /auth/redirect page.
 *
 * MSAL Browser v5 sends every popup, hidden-iframe, and logout-popup response to the
 * redirect page. The page must run `broadcastResponseToMainFrame()`, which sends the
 * response to the app window through a BroadcastChannel and closes the popup.
 *
 * The script is the UMD build of `@azure/msal-browser/redirect-bridge` from the installed
 * package, so it always matches the msal-browser version of the app. It is served from this
 * origin (never from a CDN) and the call is in this file, so the page CSP needs only
 * `script-src 'self'`. The file is generated once at build time.
 */
export const dynamic = "force-static";

const UMD_BUNDLE = readFileSync(
  path.join(
    process.cwd(),
    "node_modules",
    "@azure",
    "msal-browser",
    "lib",
    "redirect-bridge",
    "msal-redirect-bridge.min.js"
  ),
  "utf8"
);

// The UMD bundle defines the global `msalRedirectBridge`.
const BRIDGE_SCRIPT = `${UMD_BUNDLE}
msalRedirectBridge.broadcastResponseToMainFrame().catch(function (error) {
  console.error("MSAL redirect bridge failed:", error && error.errorCode ? error.errorCode : error);
});
`;

export function GET(): Response {
  return new Response(BRIDGE_SCRIPT, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      // Revalidate on each use. The page also puts the msal-browser version in the URL.
      "Cache-Control": "no-cache",
    },
  });
}
