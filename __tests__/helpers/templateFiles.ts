import { readFileSync } from "node:fs";
import path from "node:path";
import { vi } from "vitest";

const PUBLIC_ROOT = path.join(process.cwd(), "public");

/**
 * Serve the real template files in public/ to the template loaders. Requests for
 * /IntuneTemplates/... read the file from disk, so a test uses the shipped templates.
 * Returns a function that removes the stub.
 */
export function serveTemplateFiles(): () => void {
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
    try {
      const body = readFileSync(path.join(PUBLIC_ROOT, pathname));
      return new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
    } catch {
      return new Response("Not found", { status: 404, statusText: "Not Found" });
    }
  });
  return () => vi.unstubAllGlobals();
}

/** Reverse the key order of every object, as a stand-in for the property order that Graph returns. */
export function reverseKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map(reverseKeys) as T;
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).reverse().map(([key, nested]) => [key, reverseKeys(nested)])
  ) as T;
}
