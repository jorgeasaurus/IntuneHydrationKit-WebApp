/**
 * MSAL redirect bridge page.
 *
 * MSAL Browser v5 uses `<origin>/auth/redirect` as the redirect URI for popup sign-in,
 * silent token renewal in a hidden iframe, and popup sign-out. The page loads one script
 * from this origin (`./bridge.js/route.ts`), which sends the authentication response to the
 * app window and closes the popup. The page does not echo the query string or hash.
 * A route handler is not wrapped by app/layout.tsx, so no app shell, providers, or
 * analytics load here. next.config.ts lets only this path be framed, and only by the same
 * origin, and its CSP allows scripts from this origin only.
 *
 * The script URL carries the msal-browser version. The page is never cached, so after an
 * msal-browser upgrade the page asks for a new URL and a browser or CDN cannot serve the
 * bridge of the earlier version.
 */
import { version as msalBrowserVersion } from "@azure/msal-browser";

const REDIRECT_PAGE_HTML =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Signing in</title></head>' +
  `<body><script src="/auth/redirect/bridge.js?v=${encodeURIComponent(msalBrowserVersion)}"></script></body></html>`;

export function GET(): Response {
  return new Response(REDIRECT_PAGE_HTML, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
