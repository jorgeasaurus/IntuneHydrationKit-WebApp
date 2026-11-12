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
 * Builds the Content-Security-Policy value.
 *
 * Scripts keep 'unsafe-inline' because Next.js writes inline bootstrap scripts
 * into statically generated pages. A nonce policy needs middleware and makes
 * every page dynamic. 'unsafe-eval' is for the development server only.
 */
function buildContentSecurityPolicy({
  allowSameOriginFraming,
}: {
  allowSameOriginFraming: boolean;
}): string {
  const directives: Record<string, string[]> = {
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
    // The iframe starts at the login host and ends at the redirect URI on this
    // origin, so 'self' is needed too. MsalProvider wraps every page.
    "frame-src": ["'self'", ...MSAL_AUTHORITY_ORIGINS],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "https:"],
    "font-src": ["'self'", "data:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": [allowSameOriginFraming ? "'self'" : "'none'"],
  };

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

// The MSAL redirect URI is the site origin (lib/auth/msalConfig.ts), so the
// silent renewal iframe lands on "/". Only this path may be framed, and only by
// this origin. The source matches "/" exactly, not its subpaths.
const MSAL_REDIRECT_SOURCE = "/";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
  },
  async headers() {
    const sitePolicy = buildContentSecurityPolicy({ allowSameOriginFraming: false });
    const redirectTargetPolicy = buildContentSecurityPolicy({ allowSameOriginFraming: true });

    // When two entries set the same header, Next.js uses the last entry. The
    // redirect entry comes after the catch-all so that it replaces its values.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: sitePolicy },
          ...COMMON_SECURITY_HEADERS,
        ],
      },
      {
        source: MSAL_REDIRECT_SOURCE,
        headers: [
          { key: "Content-Security-Policy", value: redirectTargetPolicy },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
