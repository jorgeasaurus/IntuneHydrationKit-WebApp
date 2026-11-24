// Glyphs from thin to dense. A frame stores one index into GLYPHS for each cell.
export const RAMP = " .·:-~=+*%#";
// PowerShell punctuation and one bubble. The densest cells show them at intervals.
export const SIGILS = "$|{}<>;°";
export const GLYPHS = RAMP + SIGILS;
export const RIPPLE_SECONDS = 2.2;

const TOP_STEP = RAMP.length - 1;
const CELL_CSS_PX = 14;
const NARROW_CELL_CSS_PX = 12;
const NARROW_WIDTH_PX = 640;
const MAX_CELLS = 20_000;
const INK_ALPHA = 0.9;
const FADE_FLOOR = 0.45;
const POINTER_RADIUS_PX = 160;
const POINTER_GAIN = 0.45;
const RIPPLE_SPEED_PX = 520;
const RIPPLE_GAIN = 0.6;

export interface FieldLayout {
  cols: number;
  rows: number;
  /** Cell size in device pixels. Always a whole number. */
  cellPx: number;
  cellCssPx: number;
  /** Distance in CSS pixels across which the field fades near a quiet zone. */
  quietPadPx: number;
  /** Distance from the top at which the field reaches its floor strength. */
  fadePx: number;
}

export interface QuietRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Ripple {
  x: number;
  y: number;
  /** Seconds, on the same clock as FieldFrame.time. */
  start: number;
}

export interface FieldFrame {
  layout: FieldLayout;
  /** Seconds. */
  time: number;
  pointerX: number;
  pointerY: number;
  quiet: readonly QuietRect[];
  ripples: readonly Ripple[];
}

// Large viewports get larger cells, so the cost of one frame has a limit.
export function layoutField(width: number, height: number, devicePixelRatio: number): FieldLayout {
  const narrow = width < NARROW_WIDTH_PX;
  const cell = Math.max(narrow ? NARROW_CELL_CSS_PX : CELL_CSS_PX, Math.sqrt((width * height) / MAX_CELLS));
  const cellPx = Math.ceil(cell * devicePixelRatio);
  const cellCssPx = cellPx / devicePixelRatio;
  return {
    cols: Math.ceil(width / cellCssPx),
    rows: Math.ceil(height / cellCssPx),
    cellPx,
    cellCssPx,
    quietPadPx: narrow ? 6 : 18,
    fadePx: narrow ? 624 : 504,
  };
}

// Dense glyphs are also more opaque, so density and brightness agree.
export function glyphAlpha(index: number): number {
  return (0.18 + (0.82 * Math.min(index, TOP_STEP)) / TOP_STEP) * INK_ALPHA;
}

// Water level at one cell. `x` and `y` are cell coordinates.
// The level is a contour map of a moving water surface: thin bright ridges over a calm floor.
export function waterLevel(x: number, y: number, time: number): number {
  // Slow current: bend the sample point. Rows bend more than columns, so the ridges lie flat like swells.
  const a = x * 0.055 + 1.6 * Math.sin(y * 0.08 + time * 0.23);
  const b = y * 0.15 + 1.1 * Math.cos(x * 0.032 - time * 0.17);
  // Swell that moves down the page, a cross wave, and a long slow roll.
  const surface = Math.sin(b - time * 0.55) + 0.8 * Math.sin(a) + Math.sin((a * 0.6 + b) * 0.75 + time * 0.13);
  const ridge = 1 - Math.abs(Math.sin(surface * 2.8));
  return 0.06 + Math.pow(ridge, 2.6) * 1.05 + (surface + 2.8) * 0.04;
}

// A ring that moves out from a point and fades. Distances are in CSS pixels.
function rippleLevel(dx: number, dy: number, age: number): number {
  if (age < 0 || age >= RIPPLE_SECONDS) return 0;
  const band = Math.hypot(dx, dy) - age * RIPPLE_SPEED_PX;
  if (band <= -90 || band >= 40) return 0;
  const edge = band < 0 ? 1 + band / 90 : 1 - band / 40;
  return RIPPLE_GAIN * (1 - age / RIPPLE_SECONDS) * Math.cos(band * 0.07) * edge;
}

// Writes one frame. `cells` has cols * rows entries. Index 0 is an empty cell.
export function renderGlyphFrame(cells: Uint8Array, frame: FieldFrame): void {
  const { layout, time, pointerX, pointerY, quiet, ripples } = frame;
  const { cols, rows, cellCssPx, quietPadPx, fadePx } = layout;
  const rowQuiet: QuietRect[] = [];
  const sigilTick = Math.floor(time * 0.5);

  for (let y = 0, i = 0; y < rows; y++) {
    const py = (y + 0.5) * cellCssPx;
    // Full strength at the top of the viewport, a calm floor below.
    const fall = FADE_FLOOR + (1 - FADE_FLOOR) * Math.pow(Math.max(0, 1 - py / fadePx), 0.8);
    rowQuiet.length = 0;
    for (const rect of quiet) {
      if (py > rect.top - quietPadPx && py < rect.bottom + quietPadPx) rowQuiet.push(rect);
    }

    for (let x = 0; x < cols; x++, i++) {
      const px = (x + 0.5) * cellCssPx;
      let level = waterLevel(x, y, time) * fall;
      // The pointer and the ripples have full strength at all heights.
      for (const ripple of ripples) {
        level += rippleLevel(px - ripple.x, py - ripple.y, time - ripple.start);
      }
      const pointerDistance = Math.hypot(px - pointerX, py - pointerY);
      if (pointerDistance < POINTER_RADIUS_PX) {
        level += (1 - pointerDistance / POINTER_RADIUS_PX) * POINTER_GAIN;
      }
      // The field fades to nothing at the edge of a quiet zone.
      for (const rect of rowQuiet) {
        const distance = Math.max(rect.left - px, px - rect.right, rect.top - py, py - rect.bottom, 0);
        if (distance < quietPadPx) level *= distance / quietPadPx;
      }

      let glyph = level <= 0 ? 0 : Math.min(TOP_STEP, Math.floor(level * RAMP.length));
      if (glyph >= TOP_STEP - 1 && (x * 7 + y * 13 + sigilTick) % 11 === 0) {
        glyph = RAMP.length + ((x + y) % SIGILS.length);
      }
      cells[i] = glyph;
    }
  }
}
