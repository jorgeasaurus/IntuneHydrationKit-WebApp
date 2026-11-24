// Ocean tones from deep to highlight. Tones 0 and 1 match app/water-backdrop.css.
export const WATER_TONES = ["#041826", "#09314b", "#0f5379", "#156d92", "#8fe3f2"] as const;

const CELL_CSS_PX = 6;
const MAX_CELLS = 40_000;
const LATTICE_SIZE = 256;
const LATTICE_MASK = LATTICE_SIZE - 1;
const BAYER_4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const CONTRAST = 1.6;
const BIAS = 0.2;
const SWELL_MAX = 0.72;
const CAUSTIC_GAIN = 0.2;
const DITHER_BAND = 0.42;
const GLINT_COUNT = 3;
const GLINT_PERIOD_S = 2.4;

// ImageData bytes are R, G, B, A. All supported browsers run on little-endian
// hardware, so one 32-bit pixel is 0xAABBGGRR.
const TONE_PIXELS = WATER_TONES.map((hex) => {
  const rgb = Number.parseInt(hex.slice(1), 16);
  return (0xff000000 | ((rgb & 0xff) << 16) | (rgb & 0xff00) | (rgb >>> 16)) >>> 0;
});
const TOP_STEP = TONE_PIXELS.length - 1;

// Fixed seed: the pattern is the same on each load.
const LATTICE = (() => {
  const lattice = new Float32Array(LATTICE_SIZE * LATTICE_SIZE);
  let state = 0x9e3779b9;
  for (let i = 0; i < lattice.length; i++) {
    state = (state + 0x6d2b79f5) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    lattice[i] = ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  }
  return lattice;
})();

// Value noise in the range 0 to 1. The lattice repeats each 256 units.
function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const tx = x - xi;
  const ty = y - yi;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const x0 = xi & LATTICE_MASK;
  const x1 = (xi + 1) & LATTICE_MASK;
  const y0 = (yi & LATTICE_MASK) << 8;
  const y1 = ((yi + 1) & LATTICE_MASK) << 8;
  const a = LATTICE[y0 | x0];
  const b = LATTICE[y0 | x1];
  const c = LATTICE[y1 | x0];
  const d = LATTICE[y1 | x1];
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

export interface GridLayout {
  cols: number;
  rows: number;
  cellCssPx: number;
}

// One cell is a whole number of device pixels. Large viewports get larger cells.
export function layoutGrid(width: number, height: number, devicePixelRatio: number): GridLayout {
  const cell = Math.max(CELL_CSS_PX, Math.sqrt((width * height) / MAX_CELLS));
  const cellCssPx = Math.ceil(cell * devicePixelRatio) / devicePixelRatio;
  return { cols: Math.ceil(width / cellCssPx), rows: Math.ceil(height / cellCssPx), cellCssPx };
}

// Writes one frame. `pixels` has cols * rows entries. `time` is in seconds.
export function renderWaterFrame(pixels: Uint32Array, cols: number, rows: number, time: number): void {
  for (let cy = 0; cy < rows; cy++) {
    const v = cy * 0.04;
    const bayerRow = (cy & 3) << 2;
    const rowStart = cy * cols;
    for (let cx = 0; cx < cols; cx++) {
      const u = cx * 0.021;
      // Slow current: move the sample point.
      const warpX = valueNoise(u * 0.5 + time * 0.021, v * 0.5 - time * 0.013);
      const warpY = valueNoise(u * 0.5 - time * 0.017 + 31.4, v * 0.5 + time * 0.019 + 47.2);
      const pu = u + (warpX - 0.5) * 1.8;
      const pv = v + (warpY - 0.5) * 1.8;
      // Swell: two layers that move in different directions.
      const swell =
        0.65 * valueNoise(pu + time * 0.045, pv + time * 0.02) +
        0.35 * valueNoise(pu * 2.1 - time * 0.06 + 7.7, pv * 2.1 + time * 0.035 + 3.3);
      // Caustic lines: bright where the noise crosses 0.5.
      const ridge = 1 - Math.abs(2 * valueNoise(pu * 1.6 + 19.1 - time * 0.03, pv * 1.6 + 5.9 + time * 0.05) - 1);
      // The swell alone stays below the highlight tone. Only caustic lines reach it.
      const body = Math.min((swell - 0.5) * CONTRAST + BIAS, SWELL_MAX);
      let level = body + ridge * ridge * ridge * CAUSTIC_GAIN;
      level = level < 0 ? 0 : level > 0.999 ? 0.999 : level;

      const scaled = level * TOP_STEP;
      const step = Math.floor(scaled);
      // Dither only near the boundary between two tones.
      const fraction = (scaled - step - (0.5 - DITHER_BAND)) / (2 * DITHER_BAND);
      const threshold = (BAYER_4[bayerRow | (cx & 3)] + 0.5) / 16;
      pixels[rowStart + cx] = TONE_PIXELS[fraction > threshold ? step + 1 : step];
    }
  }

  // Glints: short dashed runs of the highlight tone that move at a fixed interval.
  const bucket = Math.floor(time / GLINT_PERIOD_S);
  for (let i = 0; i < GLINT_COUNT; i++) {
    const seed = (bucket * 131 + i * 977) & 0xffff;
    const x = Math.floor(LATTICE[seed] * cols);
    const y = Math.floor(LATTICE[(seed + 1) & 0xffff] * rows);
    const length = 4 + Math.floor(LATTICE[(seed + 2) & 0xffff] * 8);
    for (let k = 0; k < length && x + k < cols; k++) {
      if (k % 4 !== 3) pixels[y * cols + x + k] = TONE_PIXELS[TOP_STEP];
    }
  }
}
