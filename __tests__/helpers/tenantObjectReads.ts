import { vi } from "vitest";

import type { ExecutionContext } from "@/lib/hydration/types";

type Get = (endpoint: string, version?: string) => Promise<unknown>;

/**
 * Make `client.get` answer a read of one tenant object by ID from the context's
 * prefetched caches, the way Graph would. The delete resolver reads each object again
 * before it deletes it. Every other GET (assignments, lists) goes to the original mock.
 */
export function serveCachedObjects<T extends ExecutionContext>(
  context: T,
  /** Return false for an endpoint that the test's own mock must answer. */
  shouldServe: (endpoint: string) => boolean = () => true
): T {
  const client = context.client as unknown as { get: Get };
  const original = client.get;
  client.get = vi.fn(async (endpoint: string, version?: string) => {
    const id = endpoint.split("?")[0].split("/").pop();
    if (id && id !== "assignments" && shouldServe(endpoint)) {
      for (const [key, value] of Object.entries(context)) {
        if (!key.startsWith("cached") || !Array.isArray(value)) continue;
        const match = (value as Array<{ id?: string }>).find((item) => item?.id === id);
        if (match) return match;
      }
    }
    return original(endpoint, version);
  }) as unknown as Get;
  return context;
}
