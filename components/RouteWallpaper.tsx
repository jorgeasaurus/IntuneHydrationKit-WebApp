"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { shouldRenderWallpaper } from "@/components/routeWallpaperRules";

const DynamicWallpaper = dynamic(
  () => import("@/components/DynamicWallpaper").then((mod) => mod.DynamicWallpaper),
  { ssr: false }
);

// Lightweight, dependency-free surface shown before the animated wallpaper
// loads and as the permanent background for reduced-motion users. Mirrors the
// CSS surface used by DynamicWallpaper so the page background never flashes.
function StaticWallpaper(): React.JSX.Element {
  return (
    <div aria-hidden="true" tabIndex={-1} className="dynamic-wallpaper">
      <div className="dynamic-wallpaper__scrim" />
    </div>
  );
}

export function RouteWallpaper(): React.JSX.Element | null {
  const pathname = usePathname();
  // The static surface is the deliberate initial state: the animated wallpaper
  // is mounted later via requestIdleCallback so it never blocks LCP/INP, and it
  // depends on browser-only APIs (matchMedia/requestIdleCallback) unavailable
  // during SSR. The false -> true transition is the deferral, not lazy init.
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    // Only defer-mount the heavy wallpaper on routes that actually render it.
    // On non-wallpaper routes the component returns null, so scheduling an idle
    // callback + state update there is wasted work.
    if (!shouldRenderWallpaper(pathname)) {
      return;
    }

    const motionQuery =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;

    // Defer the heavy three.js + Vanta wallpaper until the browser is idle so
    // it never competes with LCP/INP during initial render and hydration.
    // Reduced-motion users never download it at all. Pair schedule+cancel from
    // the same API so we never queue with requestIdleCallback and cancel with
    // clearTimeout (or vice versa) if only one half is polyfilled.
    const hasIdleCallback =
      typeof window.requestIdleCallback === "function" &&
      typeof window.cancelIdleCallback === "function";
    const schedule = hasIdleCallback
      ? window.requestIdleCallback.bind(window)
      : (cb: () => void) => window.setTimeout(cb, 200);
    const cancel = hasIdleCallback
      ? window.cancelIdleCallback.bind(window)
      : (handle: number) => window.clearTimeout(handle);

    let idleHandle: number | undefined;

    const load = (): void => {
      if (motionQuery?.matches) {
        setAnimated(false);
        return;
      }
      idleHandle = schedule(() => setAnimated(true)) as number;
    };

    const handleMotionChange = (event: MediaQueryListEvent): void => {
      if (idleHandle !== undefined) {
        cancel(idleHandle);
        idleHandle = undefined;
      }
      if (event.matches) {
        setAnimated(false);
      } else {
        idleHandle = schedule(() => setAnimated(true)) as number;
      }
    };

    // Older Safari (<14) exposes addListener/removeListener instead of the
    // standard add/removeEventListener on MediaQueryList.
    const subscribe = (query: MediaQueryList): (() => void) => {
      if (typeof query.addEventListener === "function") {
        query.addEventListener("change", handleMotionChange);
        return () => query.removeEventListener("change", handleMotionChange);
      }
      query.addListener(handleMotionChange);
      return () => query.removeListener(handleMotionChange);
    };

    load();
    const unsubscribe = motionQuery ? subscribe(motionQuery) : undefined;

    return () => {
      if (idleHandle !== undefined) {
        cancel(idleHandle);
      }
      unsubscribe?.();
    };
  }, [pathname]);

  if (!shouldRenderWallpaper(pathname)) {
    return null;
  }

  return animated ? <DynamicWallpaper /> : <StaticWallpaper />;
}
