import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Intune Hydration Kit",
    short_name: "Hydration Kit",
    description:
      "Bootstrap Microsoft Intune tenants with OpenIntuneBaseline policies, compliance, and conditional access.",
    start_url: "/",
    display: "standalone",
    background_color: "#005588",
    theme_color: "#005588",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
