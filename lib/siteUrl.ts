// Canonical site URL used across metadata, structured data, robots, and
// sitemap. Reading directly from `process.env.NEXT_PUBLIC_SITE_URL ?? default`
// in each consumer would let an accidentally-empty env var slip past `??`
// (which only treats null/undefined as missing) and break `new URL(...)`, and
// would also risk drift between consumers if the fallback hostname ever
// changes (e.g., www vs non-www).
const DEFAULT_SITE_URL = "https://www.intunehydrationkit.com";

function resolve(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return raw && raw.length > 0 ? raw : DEFAULT_SITE_URL;
}

export const SITE_URL = resolve();
