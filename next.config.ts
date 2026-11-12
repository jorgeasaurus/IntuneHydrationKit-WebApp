import type { NextConfig } from "next";
import packageJson from "./package.json";

const isDevelopment = process.env.NODE_ENV !== "production";
const MSAL_AUTHORITY_ORIGINS = [
  "https://login.microsoftonline.com",
  "https://*.login.microsoftonline.com",
];
const VERCEL_ANALYTICS_SCRIPT_ORIGIN = "https://va.vercel-scripts.com";
const VERCEL_ANALYTICS_CONNECT_ORIGIN = "https://vitals.vercel-insights.com";
// Third-party widget on the landing page (components/landing/AppreciateButton.tsx).
const APPRECIATE_WIDGET_ORIGIN = "https://appreciate-button.com";

/**
 * Builds the Content-Security-Policy value.
 *
 * Scripts keep 'unsafe-inline' because Next.js writes inline bootstrap scripts
 * into statically generated pages. A nonce policy needs middleware and makes
 * every page dynamic. 'unsafe-eval' is for the development server only.
 */
function buildContentSecurityPolicy({
  allowAppreciateWidget,
  allowSameOriginFraming = false,
}: {
  allowAppreciateWidget: boolean;
  allowSameOriginFraming?: boolean;
}): string {
  const widgetOrigins = allowAppreciateWidget ? [APPRECIATE_WIDGET_ORIGIN] : [];
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      ...(isDevelopment ? ["'unsafe-eval'"] : []),
      VERCEL_ANALYTICS_SCRIPT_ORIGIN,
      ...widgetOrigins,
    ],
    "connect-src": [
      "'self'",
      "https://graph.microsoft.com",
      ...MSAL_AUTHORITY_ORIGINS,
      VERCEL_ANALYTICS_CONNECT_ORIGIN,
      ...widgetOrigins,
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

// Routes that hold Graph tokens. Their policy does not allow the third-party widget.
// A CSP applies to the document that the browser loaded. After a client-side
// navigation from "/" to "/wizard", the landing policy stays in effect, so this
// split protects only documents that load these routes directly.
const TOKEN_ROUTE_SOURCES = ["/wizard", "/wizard/:path*", "/dashboard", "/dashboard/:path*"];

// The MSAL redirect URI is the site origin (lib/auth/msalConfig.ts), so the
// silent renewal iframe lands on "/". Only this path may be framed, and only by
// this origin. The source matches "/" exactly, not its subpaths.
const MSAL_REDIRECT_SOURCE = "/";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
  },
  async headers() {
    const landingPolicy = buildContentSecurityPolicy({ allowAppreciateWidget: true });
    const tokenRoutePolicy = buildContentSecurityPolicy({ allowAppreciateWidget: false });
    const redirectTargetPolicy = buildContentSecurityPolicy({
      allowAppreciateWidget: true,
      allowSameOriginFraming: true,
    });

    // When two entries set the same header, Next.js uses the last entry. The
    // token route and redirect entries come after the catch-all so that they
    // replace its values.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: landingPolicy },
          ...COMMON_SECURITY_HEADERS,
        ],
      },
      ...TOKEN_ROUTE_SOURCES.map((source) => ({
        source,
        headers: [{ key: "Content-Security-Policy", value: tokenRoutePolicy }],
      })),
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
