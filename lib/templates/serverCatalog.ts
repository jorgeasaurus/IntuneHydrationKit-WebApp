/**
 * Server-side access to the template catalog.
 *
 * The template loader reads bundled files with relative URLs such as
 * "/IntuneTemplates/...". The browser resolves these against the site origin.
 * On the server, a relative URL is not valid for fetch, so this module reads the
 * same files from the `public` folder. Use it only in Server Components and
 * route handlers (for example the /templates/[id] pages and the sitemap).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  findTemplateBySlug,
  loadTemplateDocumentationCatalog,
  loadTemplateDocumentationPayload,
  type TemplateDocumentationCatalog,
  type TemplateDocumentationItem,
} from "@/lib/templates/catalog";
import {
  fetchWinGetVersionCatalog,
  findWinGetCatalogApp,
  type WinGetCatalogApp,
  type WinGetVersionCatalog,
} from "@/lib/winget/versionCatalog";

const PUBLIC_DIR = path.join(process.cwd(), "public");
const PUBLIC_FILE_FETCH = Symbol.for("intuneHydrationKit.publicFileFetch");

type FetchWithMarker = typeof fetch & { [PUBLIC_FILE_FETCH]?: true };

function getRelativePath(input: Parameters<typeof fetch>[0]): string | null {
  if (typeof input !== "string" || !input.startsWith("/") || input.startsWith("//")) {
    return null;
  }

  return input;
}

/**
 * Returns the absolute path of a file in `public` for a site-relative URL.
 * Returns null when the URL points outside `public`.
 */
export function resolvePublicFilePath(url: string): string | null {
  const pathname = decodeURIComponent(url.split(/[?#]/, 1)[0] ?? "");
  const filePath = path.resolve(PUBLIC_DIR, `.${pathname}`);

  return filePath.startsWith(`${PUBLIC_DIR}${path.sep}`) ? filePath : null;
}

async function readPublicFile(url: string): Promise<Response> {
  const filePath = resolvePublicFilePath(url);
  if (!filePath) {
    return new Response(null, { status: 404, statusText: "Not Found" });
  }

  try {
    return new Response(new Uint8Array(await readFile(filePath)));
  } catch {
    return new Response(null, { status: 404, statusText: "Not Found" });
  }
}

/**
 * Lets the global fetch read site-relative URLs from `public`. Other URLs go to
 * the original fetch without change. A relative URL fails in server fetch, so
 * this does not change any request that worked before.
 */
function installPublicFileFetch(): void {
  const current = globalThis.fetch as FetchWithMarker;
  if (current[PUBLIC_FILE_FETCH]) {
    return;
  }

  const publicFileFetch: FetchWithMarker = Object.assign(
    (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const relativePath = getRelativePath(input);
      return relativePath ? readPublicFile(relativePath) : current(input, init);
    },
    { [PUBLIC_FILE_FETCH]: true as const }
  );

  globalThis.fetch = publicFileFetch;
}

let catalogPromise: Promise<TemplateDocumentationCatalog> | null = null;

/** Loads the template catalog once per server process. */
export function loadServerTemplateCatalog(): Promise<TemplateDocumentationCatalog> {
  installPublicFileFetch();
  catalogPromise ??= loadTemplateDocumentationCatalog().catch((error: unknown) => {
    catalogPromise = null;
    throw error;
  });

  return catalogPromise;
}

/** Returns the catalog item for a detail page slug, or undefined. */
export async function getServerTemplateBySlug(
  slug: string
): Promise<TemplateDocumentationItem | undefined> {
  const catalog = await loadServerTemplateCatalog();
  return findTemplateBySlug(catalog.items, slug);
}

export type ServerTemplatePayloadResult =
  | { status: "ready"; payload: unknown }
  | { status: "error"; error: string };

/**
 * Loads the import-ready payload of a catalog item on the server. A missing or
 * unreadable file gives an error result instead of an exception. OIB and CIS
 * loaders report a failure as null; the Win32 loader throws.
 */
export async function loadServerTemplatePayload(
  item: TemplateDocumentationItem
): Promise<ServerTemplatePayloadResult> {
  installPublicFileFetch();
  try {
    const payload = await loadTemplateDocumentationPayload(item);
    return payload === null || payload === undefined
      ? { status: "error", error: `The payload file for "${item.displayName}" could not be read.` }
      : { status: "ready", payload };
  } catch (error) {
    return {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

let winGetCatalogPromise: Promise<WinGetVersionCatalog> | null = null;

/**
 * Returns the WinGet version catalog entry for a Win32 app item, or null when the item is
 * not a WinGet app in the catalog. Throws when the catalog file is not valid, so a build
 * with a malformed catalog fails.
 */
export async function getServerWinGetCatalogApp(
  item: TemplateDocumentationItem
): Promise<WinGetCatalogApp | null> {
  if (item.payloadSource.kind !== "win32") {
    return null;
  }

  installPublicFileFetch();
  winGetCatalogPromise ??= fetchWinGetVersionCatalog().catch((error: unknown) => {
    winGetCatalogPromise = null;
    throw error;
  });

  const catalog = await winGetCatalogPromise;
  return findWinGetCatalogApp(catalog, item.payloadSource.template.packageIdentifier) ?? null;
}
