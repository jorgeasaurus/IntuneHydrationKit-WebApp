import { z } from "zod";

// Zod's JIT feature probe calls `new Function("")`. The production Content-Security-Policy
// has no 'unsafe-eval', so the probe causes a script-src violation report on every page.
// Jitless mode must be set before the first schema is built. Every module that builds
// zod schemas imports `z` from this module, never from "zod", so the configuration
// always runs first.
z.config({ jitless: true });

export { z };
