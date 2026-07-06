"use client";

import type * as React from "react";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import WAVES from "vanta/dist/vanta.waves.min";
import type {
  VantaEffect,
  VantaWavesOptions,
} from "vanta/dist/vanta.waves.min";

const VANTA_WAVES_OPTIONS = {
  backgroundAlpha: 1,
  backgroundColor: 0x005588,
  color: 0x005588,
  gyroControls: false,
  minHeight: 200,
  minWidth: 200,
  mouseControls: true,
  scale: 1,
  scaleMobile: 1,
  shininess: 30,
  touchControls: true,
  waveHeight: 15,
  waveSpeed: 1,
  zoom: 1,
} satisfies Omit<VantaWavesOptions, "el" | "THREE">;

function getMotionPreference(): MediaQueryList | null {
  if (typeof window.matchMedia !== "function") {
    return null;
  }

  return window.matchMedia("(prefers-reduced-motion: reduce)");
}

function getOptions(reducedMotion: boolean): Omit<VantaWavesOptions, "el" | "THREE"> {
  if (!reducedMotion) {
    return VANTA_WAVES_OPTIONS;
  }

  return {
    ...VANTA_WAVES_OPTIONS,
    mouseControls: false,
    touchControls: false,
    waveSpeed: 0,
  };
}

function markVantaCanvas(container: HTMLElement): void {
  window.requestAnimationFrame(() => {
    container.querySelectorAll("canvas").forEach((canvas) => {
      canvas.setAttribute("aria-hidden", "true");
      canvas.tabIndex = -1;
      canvas.style.pointerEvents = "none";
    });
  });
}

export function DynamicWallpaper(): React.ReactNode {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const motionQuery = getMotionPreference();
    const vantaContainer = container;
    let effect: VantaEffect | null = null;

    function initialize(reducedMotion = motionQuery?.matches ?? false): void {
      effect?.destroy();
      effect = WAVES({
        el: vantaContainer,
        THREE,
        ...getOptions(reducedMotion),
      });
      markVantaCanvas(vantaContainer);
    }

    const handleMotionChange = (event: MediaQueryListEvent): void => {
      initialize(event.matches);
    };

    initialize();
    motionQuery?.addEventListener("change", handleMotionChange);

    return () => {
      motionQuery?.removeEventListener("change", handleMotionChange);
      effect?.destroy();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      tabIndex={-1}
      className="dynamic-wallpaper"
    >
      <div className="dynamic-wallpaper__scrim" />
    </div>
  );
}
