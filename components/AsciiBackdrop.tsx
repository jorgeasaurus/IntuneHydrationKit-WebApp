"use client";

import { useEffect, useRef } from "react";
import {
  GLYPHS,
  RIPPLE_SECONDS,
  glyphAlpha,
  layoutField,
  renderGlyphFrame,
  type FieldLayout,
  type QuietRect,
  type Ripple,
} from "@/lib/backdrop/asciiWater";

const FRAME_INTERVAL_MS = 33;
const MAX_DEVICE_PIXEL_RATIO = 2;
const MAX_RIPPLES = 8;
const QUIET_SELECTOR = "[data-quiet]";
const OFFSCREEN = -1e4;

// Decorative page backdrop: an animated field of monospace glyphs with a water motion.
// The field fades near elements that have the data-quiet attribute.
// app/ascii-backdrop.css paints the base color and sets the glyph color and font.
export function AsciiBackdrop(): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const atlas = document.createElement("canvas");
    const atlasContext = atlas.getContext("2d");
    if (!container || !canvas || !context || !atlasContext) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const listeners = new AbortController();
    let layout: FieldLayout | null = null;
    let cells = new Uint8Array(0);
    let quiet: QuietRect[] = [];
    let ripples: Ripple[] = [];
    let pointerX = OFFSCREEN;
    let pointerY = OFFSCREEN;
    let lastDrawMs = 0;
    let frameId = 0;
    let stale = true;

    // Draws each glyph one time. A frame only copies glyphs from this atlas.
    const bakeAtlas = () => {
      if (!layout) return;
      const size = layout.cellPx;
      const style = getComputedStyle(canvas);
      // Setting the size also clears the atlas.
      atlas.width = size * GLYPHS.length;
      atlas.height = size;
      atlasContext.font = `${Math.round(size * 0.78)}px ${style.fontFamily || "monospace"}`;
      atlasContext.textAlign = "center";
      atlasContext.textBaseline = "middle";
      atlasContext.fillStyle = style.color;
      for (let i = 0; i < GLYPHS.length; i++) {
        atlasContext.globalAlpha = glyphAlpha(i);
        atlasContext.fillText(GLYPHS[i], i * size + size / 2, size * 0.54);
      }
      stale = true;
    };

    // Quiet zones move when the page scrolls or its layout changes.
    const measureQuiet = () => {
      const next: QuietRect[] = [];
      for (const element of document.querySelectorAll(QUIET_SELECTOR)) {
        const { left, top, right, bottom } = element.getBoundingClientRect();
        if (right > left && bottom > 0 && top < window.innerHeight) next.push({ left, top, right, bottom });
      }
      const same =
        next.length === quiet.length &&
        next.every((rect, i) => {
          const old = quiet[i];
          return rect.left === old.left && rect.top === old.top && rect.right === old.right && rect.bottom === old.bottom;
        });
      if (same) return;
      quiet = next;
      stale = true;
    };

    const draw = (nowMs: number) => {
      if (!layout) return;
      const still = reducedMotion.matches;
      const time = still ? 0 : nowMs / 1000;
      ripples = still ? [] : ripples.filter((ripple) => time - ripple.start < RIPPLE_SECONDS);
      renderGlyphFrame(cells, {
        layout,
        time,
        pointerX: still ? OFFSCREEN : pointerX,
        pointerY: still ? OFFSCREEN : pointerY,
        quiet,
        ripples,
      });
      const { cols, rows, cellPx } = layout;
      context.clearRect(0, 0, canvas.width, canvas.height);
      for (let y = 0, i = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++, i++) {
          const glyph = cells[i];
          if (glyph !== 0) {
            context.drawImage(atlas, glyph * cellPx, 0, cellPx, cellPx, x * cellPx, y * cellPx, cellPx, cellPx);
          }
        }
      }
      stale = false;
      lastDrawMs = nowMs;
    };

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width === 0 || height === 0) return;
      const devicePixelRatio = Math.min(MAX_DEVICE_PIXEL_RATIO, window.devicePixelRatio || 1);
      layout = layoutField(width, height, devicePixelRatio);
      canvas.width = Math.round(width * devicePixelRatio);
      canvas.height = Math.round(height * devicePixelRatio);
      cells = new Uint8Array(layout.cols * layout.rows);
      bakeAtlas();
      measureQuiet();
      draw(performance.now());
      canvas.dataset.ready = "true";
    };

    // The browser does not call this function while the tab is hidden.
    const tick = (nowMs: number) => {
      frameId = requestAnimationFrame(tick);
      measureQuiet();
      const due = !reducedMotion.matches && nowMs - lastDrawMs >= FRAME_INTERVAL_MS;
      if (stale || due) draw(nowMs);
    };

    const options = { passive: true, signal: listeners.signal };
    window.addEventListener(
      "pointermove",
      (event) => {
        pointerX = event.clientX;
        pointerY = event.clientY;
      },
      options
    );
    window.addEventListener(
      "pointerdown",
      (event) => {
        if (reducedMotion.matches) return;
        ripples.push({ x: event.clientX, y: event.clientY, start: performance.now() / 1000 });
        if (ripples.length > MAX_RIPPLES) ripples.shift();
      },
      options
    );
    reducedMotion.addEventListener(
      "change",
      () => {
        stale = true;
      },
      { signal: listeners.signal }
    );

    const resizeObserver = new ResizeObserver(resize); // The first callback draws the first frame.
    resizeObserver.observe(container);
    // The web font replaces the fallback glyphs after it loads.
    document.fonts
      ?.load(`14px ${getComputedStyle(canvas).fontFamily || "monospace"}`, GLYPHS)
      .then(bakeAtlas, () => undefined);
    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      listeners.abort();
    };
  }, []);

  return (
    <div ref={containerRef} aria-hidden="true" className="ascii-backdrop">
      <canvas ref={canvasRef} className="ascii-backdrop__canvas font-mono" />
    </div>
  );
}
