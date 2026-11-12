import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Zod's JIT probe calls `new Function("")`. The production Content-Security-Policy has no
 * 'unsafe-eval', so the probe causes a violation report. Every module that builds zod
 * schemas must import `z` from "@/lib/utils/zod", which sets jitless mode first.
 */
const ROOT = path.resolve(__dirname, "../../..");
const SOURCE_DIRS = ["app", "components", "hooks", "lib", "types", "templates"];
const SHARED_MODULE = path.join("lib", "utils", "zod.ts");
const ZOD_IMPORT = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["']zod(?:\/[^"']*)?["']/;

function listSourceFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry);
    if (statSync(fullPath).isDirectory()) return listSourceFiles(fullPath);
    return /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(entry) ? [fullPath] : [];
  });
}

describe("zod jitless configuration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("imports zod only through the shared jitless module", () => {
    const files = SOURCE_DIRS.flatMap((dir) => listSourceFiles(path.join(ROOT, dir)));
    const directImports = files
      .map((file) => path.relative(ROOT, file))
      .filter((file) => file !== SHARED_MODULE)
      .filter((file) => ZOD_IMPORT.test(readFileSync(path.join(ROOT, file), "utf8")));

    expect(files.length).toBeGreaterThan(0);
    expect(directImports).toEqual([]);
    expect(readFileSync(path.join(ROOT, SHARED_MODULE), "utf8")).toMatch(/z\.config\(\{\s*jitless:\s*true\s*\}\)/);
  });

  it("parses comparison reports without the zod JIT probe when no other schema module loaded first", async () => {
    vi.resetModules();
    const RealFunction = Function;
    const functionConstructor = vi.fn(function (this: unknown, ...args: string[]) {
      return new RealFunction(...args);
    });
    vi.stubGlobal("Function", functionConstructor);

    const { parseComparisonReport } = await import("@/lib/hydration/reportComparison");
    const report = parseComparisonReport(JSON.stringify({
      executionMode: "preview",
      summary: { tenantId: "example-tenant", operationMode: "create", startTime: "2026-10-04T02:36:16.000Z" },
      tasks: [{ category: "groups", itemName: "Example Group", status: "success", outcome: "success" }],
    }));
    const { z } = await import("zod");

    expect(report.tasks).toHaveLength(1);
    expect(functionConstructor).not.toHaveBeenCalled();
    expect(z.config().jitless).toBe(true);
  });
});
