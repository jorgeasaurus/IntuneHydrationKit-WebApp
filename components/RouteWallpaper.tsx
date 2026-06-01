"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

import { shouldRenderWallpaper } from "@/components/routeWallpaperRules";

const DynamicWallpaper = dynamic(
  () => import("@/components/DynamicWallpaper").then((mod) => mod.DynamicWallpaper),
  { ssr: false }
);

export function RouteWallpaper(): React.JSX.Element | null {
  const pathname = usePathname();

  if (!shouldRenderWallpaper(pathname)) {
    return null;
  }

  return <DynamicWallpaper />;
}
