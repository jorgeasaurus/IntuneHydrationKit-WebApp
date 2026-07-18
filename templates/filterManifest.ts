/**
 * Lightweight device filter template manifest.
 *
 * Keep this module free of JSON imports so client paths that only fetch
 * templates over HTTP do not bundle the static fallback data.
 */

export const DEVICE_FILTER_TEMPLATE_MANIFEST = [
  { path: "Filters/Android-Filters.json", count: 3 },
  { path: "Filters/Windows-Architecture-Filters.json", count: 3 },
  { path: "Filters/Windows-Manufacturer-Filters.json", count: 3 },
  { path: "Filters/Windows-OSVersion-Filters.json", count: 3 },
  { path: "Filters/Windows-VM-Filters.json", count: 12 },
  { path: "Filters/iOS-Filters.json", count: 3 },
  { path: "Filters/iOS-OSVersion-Filters.json", count: 2 },
  { path: "Filters/macOS-Architecture-Filters.json", count: 2 },
  { path: "Filters/macOS-Filters.json", count: 3 },
  { path: "Filters/macOS-OSVersion-Filters.json", count: 4 },
] as const;

export const DEVICE_FILTER_TEMPLATE_PATHS = DEVICE_FILTER_TEMPLATE_MANIFEST.map(
  (file) => file.path
);

export const DEVICE_FILTER_TEMPLATE_COUNT = DEVICE_FILTER_TEMPLATE_MANIFEST.reduce(
  (total, file) => total + file.count,
  0
);
