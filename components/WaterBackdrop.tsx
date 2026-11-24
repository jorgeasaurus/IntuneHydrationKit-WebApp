"use client";

import { useEffect, useRef } from "react";
import { layoutGrid, renderWaterFrame } from "@/lib/backdrop/waterDither";

const FRAME_INTERVAL_MS = 50;

// Decorative page backdrop: an animated dither field in water colors.
// app/water-backdrop.css paints the base color before the canvas draws.
export function WaterBackdrop(): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { alpha: false });
    if (!container || !canvas || !context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let image: ImageData | null = null;
    let pixels = new Uint32Array(0);
    let cols = 0;
    let rows = 0;
    let clockSeconds = 0;
    let lastDrawMs = 0;
    let frameId = 0;

    const draw = () => {
      if (!image) return;
      renderWaterFrame(pixels, cols, rows, clockSeconds);
      context.putImageData(image, 0, 0);
    };

    const layout = () => {
      const grid = layoutGrid(container.clientWidth, container.clientHeight, window.devicePixelRatio);
      if (grid.cols === 0 || grid.rows === 0) return;
      canvas.style.width = `${grid.cols * grid.cellCssPx}px`;
      canvas.style.height = `${grid.rows * grid.cellCssPx}px`;
      if (grid.cols === cols && grid.rows === rows) return;
      cols = grid.cols;
      rows = grid.rows;
      canvas.width = cols;
      canvas.height = rows;
      image = context.createImageData(cols, rows);
      pixels = new Uint32Array(image.data.buffer);
      draw();
      canvas.dataset.ready = "true";
    };

    const tick = (nowMs: number) => {
      frameId = requestAnimationFrame(tick);
      const elapsedMs = nowMs - lastDrawMs;
      if (elapsedMs < FRAME_INTERVAL_MS) return;
      lastDrawMs = nowMs;
      // The limit prevents a jump after a stop.
      clockSeconds += Math.min(elapsedMs, 100) / 1000;
      draw();
    };

    const syncLoop = () => {
      cancelAnimationFrame(frameId);
      if (document.hidden || reducedMotion.matches) return;
      lastDrawMs = performance.now();
      frameId = requestAnimationFrame(tick);
    };

    const resizeObserver = new ResizeObserver(layout); // The first callback draws the first frame.
    resizeObserver.observe(container);
    document.addEventListener("visibilitychange", syncLoop);
    reducedMotion.addEventListener("change", syncLoop);
    syncLoop();

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", syncLoop);
      reducedMotion.removeEventListener("change", syncLoop);
    };
  }, []);

  return (
    <div ref={containerRef} aria-hidden="true" className="water-backdrop">
      <canvas ref={canvasRef} className="water-backdrop__canvas" />
    </div>
  );
}
