import type { NextConfig } from "next";
import packageJson from "./package.json";

const isDevelopment = process.env.NODE_ENV !== "production";
const MSAL_AUTHORITY_ORIGINS = [
  "https://login.microsoftonline.com",
  "https://*.login.microsoftonline.com",
];
const VERCEL_ANALYTICS_SCRIPT_ORIGIN = "https://va.vercel-scripts.com";
const VERCEL_ANALYTICS_CONNECT_ORIGIN = "https://vitals.vercel-insights.com";

/**
 * Content-Security-Policy for the app pages.
 *
 * Scripts keep 'unsafe-inline' because Next.js writes inline bootstrap scripts
 * into statically generated pages. A nonce policy needs middleware and makes
 * every page dynamic. 'unsafe-eval' is for the development server only.
 */
const SITE_POLICY_DIRECTIVES: Record<string, string[]> = {
  "default-src": ["'self'"],
  "script-src": [
    "'self'",
    "'unsafe-inline'",
    ...(isDevelopment ? ["'unsafe-eval'"] : []),
    VERCEL_ANALYTICS_SCRIPT_ORIGIN,
  ],
  "connect-src": [
    "'self'",
    "https://graph.microsoft.com",
    ...MSAL_AUTHORITY_ORIGINS,
    VERCEL_ANALYTICS_CONNECT_ORIGIN,
  ],
  // MSAL renews tokens in a hidden iframe when no refresh token is usable.
  // The iframe starts at the login host and ends at MSAL_REDIRECT_BRIDGE_SOURCE
  // on this origin, so 'self' is needed too. MsalProvider wraps every page.
  "frame-src": ["'self'", ...MSAL_AUTHORITY_ORIGINS],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": ["'self'", "data:", "https:"],
  "font-src": ["'self'", "data:"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "frame-ancestors": ["'none'"],
};

/**
 * Content-Security-Policy for the MSAL redirect bridge page. The page runs one
 * script file from this origin (no inline script) and has no styles, images,
 * or forms. It can be framed by this origin only.
 */
const REDIRECT_BRIDGE_POLICY_DIRECTIVES: Record<string, string[]> = {
  "default-src": ["'none'"],
  "script-src": ["'self'"],
  "base-uri": ["'none'"],
  "form-action": ["'none'"],
  "frame-ancestors": ["'self'"],
};

function serializePolicy(directives: Record<string, string[]>): string {
  return Object.entries(directives)
    .map(([directive, sources]) => `${directive} ${sources.join(" ")}`)
    .join("; ");
}

const COMMON_SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=(), accelerometer=(), gyroscope=(), magnetometer=()",
  },
];

// All MSAL flows use <origin>/auth/redirect as the redirect URI
// (MSAL_REDIRECT_BRIDGE_PATH in lib/auth/msalConfig.ts). The hidden renewal
// iframe lands on this page, so only this path may be framed, and only by
// this origin. The source matches the path exactly, not its subpaths.
// Do not add a Cross-Origin-Opener-Policy header to this page: MSAL requires
// the bridge page to be served without COOP.
const MSAL_REDIRECT_BRIDGE_SOURCE = "/auth/redirect";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
  },
  async headers() {
    // When two entries set the same header, Next.js uses the last entry. The
    // redirect entry comes after the catch-all so that it replaces its values.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: serializePolicy(SITE_POLICY_DIRECTIVES) },
          ...COMMON_SECURITY_HEADERS,
        ],
      },
      {
        source: MSAL_REDIRECT_BRIDGE_SOURCE,
        headers: [
          {
            key: "Content-Security-Policy",
            value: serializePolicy(REDIRECT_BRIDGE_POLICY_DIRECTIVES),
          },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
