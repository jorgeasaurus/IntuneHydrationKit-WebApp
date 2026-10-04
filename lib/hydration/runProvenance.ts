import packageInfo from "@/package.json";
import manifest from "@/public/IntuneTemplates/OpenIntuneBaseline/manifest.json";
import type { RunProvenance } from "@/types/hydration";

/** Capture the source versions when a run starts. */
export function createRunProvenance(): RunProvenance {
  return {
    runId: crypto.randomUUID(),
    appVersion: packageInfo.version,
    baselineVersion: manifest.windowsVersion,
    baselineSourceSha: manifest.sourceSha,
  };
}
