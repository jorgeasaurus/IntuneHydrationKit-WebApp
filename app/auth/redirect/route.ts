/**
 * Blank redirect page for MSAL silent token renewal.
 *
 * MSAL loads `<origin>/auth/redirect` in a hidden same-origin iframe and reads the
 * authorization response from the iframe URL. The page does not need to run code, so it
 * contains no scripts and does not echo the query string or hash. A route handler is not
 * wrapped by app/layout.tsx, so no app shell, providers, or analytics load here.
 * next.config.ts lets only this path be framed, and only by the same origin.
 */
const REDIRECT_PAGE_HTML =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Signing in</title></head><body></body></html>';

export function GET(): Response {
  return new Response(REDIRECT_PAGE_HTML, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
