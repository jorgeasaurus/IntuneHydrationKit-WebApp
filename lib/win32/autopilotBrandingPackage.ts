/**
 * Build the Autopilot Branding .intunewin package in the browser for a customized configuration.
 *
 * The unencrypted package content is public/win32-apps/autopilot-branding/content.zip, which
 * scripts/build-autopilot-branding.ps1 writes from the same files as the prebuilt package.
 * The builder replaces the AutopilotBranding.json entry with the customized configuration,
 * writes the content ZIP again, and encrypts and wraps it (lib/win32/intuneWinWriter.ts).
 */

import { buildAutopilotBrandingConfiguration } from "@/lib/win32/autopilotBrandingConfig";
import { createIntuneWinPackage } from "@/lib/win32/intuneWinWriter";
import { readStoredZipEntries, writeStoredZip } from "@/lib/win32/storedZip";
import { AUTOPILOT_BRANDING_WIN32_APP } from "@/templates/win32Apps";

export const AUTOPILOT_BRANDING_CONTENT_URL = "/win32-apps/autopilot-branding/content.zip";
export const AUTOPILOT_BRANDING_CONFIGURATION_ENTRY = "AutopilotBranding.json";
/** Name element of Detection.xml, the same as in the prebuilt package. */
export const AUTOPILOT_BRANDING_PACKAGE_NAME = "Autopilot Branding";
/** The largest package that /api/win32-upload accepts. */
export const MAX_WIN32_UPLOAD_BYTES = 4 * 1024 * 1024;

const CONTENT_LABEL = "The Autopilot Branding package content";

/** Build the package bytes from the content ZIP and a customization. Throws when the customization is not valid. */
export async function buildAutopilotBrandingPackage(
  contentZip: ArrayBuffer,
  customization: unknown,
): Promise<Uint8Array<ArrayBuffer>> {
  const entries = readStoredZipEntries(contentZip, CONTENT_LABEL);
  const configurationEntry = entries.find((entry) => entry.name === AUTOPILOT_BRANDING_CONFIGURATION_ENTRY);
  if (!configurationEntry) {
    throw new Error(`${CONTENT_LABEL} has no ${AUTOPILOT_BRANDING_CONFIGURATION_ENTRY}.`);
  }
  if (!entries.some((entry) => entry.name === AUTOPILOT_BRANDING_WIN32_APP.setupFilePath)) {
    throw new Error(`${CONTENT_LABEL} has no ${AUTOPILOT_BRANDING_WIN32_APP.setupFilePath}.`);
  }

  const configuration = buildAutopilotBrandingConfiguration(
    new TextDecoder().decode(configurationEntry.content),
    customization,
  );
  const configurationBytes = new TextEncoder().encode(configuration);
  const contentEntries = entries.map((entry) =>
    entry === configurationEntry ? { name: entry.name, content: configurationBytes } : entry,
  );
  const packageBytes = await createIntuneWinPackage(writeStoredZip(contentEntries), {
    name: AUTOPILOT_BRANDING_PACKAGE_NAME,
    setupFile: AUTOPILOT_BRANDING_WIN32_APP.setupFilePath,
  });
  if (packageBytes.length > MAX_WIN32_UPLOAD_BYTES) {
    throw new Error("The customized Autopilot Branding package is larger than the 4 MiB upload limit.");
  }
  return packageBytes;
}

/** Load the package content and build the package for a customization. */
export async function fetchCustomizedAutopilotBrandingPackage(customization: unknown): Promise<ArrayBuffer> {
  const response = await fetch(AUTOPILOT_BRANDING_CONTENT_URL);
  if (!response.ok) {
    throw new Error(
      `Unable to load the Autopilot Branding package content from ${AUTOPILOT_BRANDING_CONTENT_URL}: ${response.status} ${response.statusText}`,
    );
  }
  const packageBytes = await buildAutopilotBrandingPackage(await response.arrayBuffer(), customization);
  // writeStoredZip returns a view of a whole buffer.
  return packageBytes.buffer;
}
