import { describe, expect, it } from 'vitest'
import { WATER_TONES, layoutGrid, renderWaterFrame } from '@/lib/backdrop/waterDither'

// ImageData pixels as little-endian 32-bit values: 0xAABBGGRR.
const tonePixels = WATER_TONES.map((hex) => {
  const red = Number.parseInt(hex.slice(1, 3), 16)
  const green = Number.parseInt(hex.slice(3, 5), 16)
  const blue = Number.parseInt(hex.slice(5, 7), 16)
  return (0xff000000 | (blue << 16) | (green << 8) | red) >>> 0
})

function renderFrame(cols: number, rows: number, time: number): Uint32Array {
  const pixels = new Uint32Array(cols * rows)
  renderWaterFrame(pixels, cols, rows, time)
  return pixels
}

describe('layoutGrid', () => {
  it('limits the number of cells on a large viewport', () => {
    const grid = layoutGrid(1920, 1080, 1)

    expect(grid.cols * grid.rows).toBeLessThanOrEqual(40_000)
    expect(grid.cols * grid.cellCssPx).toBeGreaterThanOrEqual(1920)
    expect(grid.rows * grid.cellCssPx).toBeGreaterThanOrEqual(1080)
  })

  it('makes each cell a whole number of device pixels and covers the viewport', () => {
    const grid = layoutGrid(390, 844, 3)
    const devicePixels = grid.cellCssPx * 3

    expect(Math.abs(devicePixels - Math.round(devicePixels))).toBeLessThan(1e-9)
    expect(grid.cols * grid.cellCssPx).toBeGreaterThanOrEqual(390)
    expect(grid.rows * grid.cellCssPx).toBeGreaterThanOrEqual(844)
  })

  it('uses the base cell size on a small viewport', () => {
    expect(layoutGrid(375, 812, 1)).toEqual({ cols: 63, rows: 136, cellCssPx: 6 })
  })
})

describe('renderWaterFrame', () => {
  it('writes only palette colors to every cell', () => {
    const pixels = renderFrame(120, 80, 12.5)
    const palette = new Set(tonePixels)

    for (const pixel of pixels) {
      expect(palette.has(pixel)).toBe(true)
    }
  })

  it('uses more than two tones in one frame', () => {
    const tones = new Set(renderFrame(240, 150, 3))

    expect(tones.size).toBeGreaterThan(2)
  })

  it('draws the same frame for the same time', () => {
    expect(renderFrame(64, 48, 7)).toEqual(renderFrame(64, 48, 7))
  })

  it('draws a different frame at a different time', () => {
    expect(renderFrame(64, 48, 0)).not.toEqual(renderFrame(64, 48, 1))
  })
})
