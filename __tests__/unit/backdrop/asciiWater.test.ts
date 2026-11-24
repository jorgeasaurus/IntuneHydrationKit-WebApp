import { describe, expect, it } from 'vitest'
import {
  GLYPHS,
  RAMP,
  SIGILS,
  glyphAlpha,
  layoutField,
  renderGlyphFrame,
  type FieldFrame,
  type FieldLayout,
} from '@/lib/backdrop/asciiWater'

const OFFSCREEN = -1e4

function frame(layout: FieldLayout, overrides: Partial<FieldFrame> = {}): Uint8Array {
  const cells = new Uint8Array(layout.cols * layout.rows)
  renderGlyphFrame(cells, {
    layout,
    time: 3,
    pointerX: OFFSCREEN,
    pointerY: OFFSCREEN,
    quiet: [],
    ripples: [],
    ...overrides,
  })
  return cells
}

function sum(cells: Uint8Array, from = 0, to = cells.length): number {
  let total = 0
  for (let i = from; i < to; i++) total += Math.min(cells[i], RAMP.length - 1)
  return total
}

describe('layoutField', () => {
  it('uses 14 px cells on a 1080p screen', () => {
    expect(layoutField(1920, 1080, 1)).toMatchObject({ cols: 138, rows: 78, cellPx: 14, cellCssPx: 14 })
  })

  it('uses 12 px cells and a small quiet pad on a phone', () => {
    const layout = layoutField(375, 812, 1)
    expect(layout.cellCssPx).toBe(12)
    expect(layout.quietPadPx).toBe(6)
  })

  it('limits the number of cells on a large screen', () => {
    const layout = layoutField(3840, 2160, 1)
    expect(layout.cols * layout.rows).toBeLessThanOrEqual(20_000)
  })

  it('uses whole device pixels for each cell and covers the viewport', () => {
    const layout = layoutField(1366, 768, 1.5)
    expect(Number.isInteger(layout.cellPx)).toBe(true)
    expect(layout.cols * layout.cellCssPx).toBeGreaterThanOrEqual(1366)
    expect(layout.rows * layout.cellCssPx).toBeGreaterThanOrEqual(768)
  })
})

describe('glyphAlpha', () => {
  it('increases across the ramp and gives sigils the top alpha', () => {
    for (let i = 1; i < RAMP.length; i++) expect(glyphAlpha(i)).toBeGreaterThan(glyphAlpha(i - 1))
    for (let i = RAMP.length; i < GLYPHS.length; i++) expect(glyphAlpha(i)).toBe(glyphAlpha(RAMP.length - 1))
    expect(Math.max(...[...GLYPHS].map((_, i) => glyphAlpha(i)))).toBeLessThanOrEqual(1)
  })
})

describe('renderGlyphFrame', () => {
  const layout = layoutField(1920, 1080, 1)

  it('writes valid glyph indices with a range of densities', () => {
    const cells = frame(layout)
    expect(Math.max(...cells)).toBeLessThan(GLYPHS.length)
    expect(new Set(cells).size).toBeGreaterThanOrEqual(5)
  })

  it('is deterministic and moves with time', () => {
    expect(frame(layout)).toEqual(frame(layout))
    expect(frame(layout, { time: 0 })).not.toEqual(frame(layout, { time: 1 }))
  })

  it('leaves cells inside a quiet zone empty', () => {
    const cells = frame(layout, { quiet: [{ left: 400, top: 200, right: 1200, bottom: 600 }] })
    for (let y = 16; y < 42; y++) {
      for (let x = 30; x < 85; x++) expect(cells[y * layout.cols + x]).toBe(0)
    }
  })

  it('is stronger at the top of the viewport than at the bottom', () => {
    const cells = frame(layout)
    const band = 20 * layout.cols
    expect(sum(cells, 0, band)).toBeGreaterThan(sum(cells, cells.length - band))
  })

  it('brightens near the pointer', () => {
    const away = frame(layout)
    const near = frame(layout, { pointerX: 960, pointerY: 540 })
    expect(sum(near)).toBeGreaterThan(sum(away))
  })

  it('draws a ripple', () => {
    const still = frame(layout)
    const rippled = frame(layout, { ripples: [{ x: 960, y: 540, start: 2.5 }] })
    expect(rippled).not.toEqual(still)
  })

  it('shows PowerShell sigils on dense cells', () => {
    let found = false
    for (let t = 0; t < 10 && !found; t++) {
      found = frame(layout, { time: t }).some((glyph) => glyph >= RAMP.length)
    }
    expect(found).toBe(true)
    expect(SIGILS).toContain('$')
  })
})
