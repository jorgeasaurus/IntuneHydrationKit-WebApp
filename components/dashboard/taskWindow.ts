/** Lists longer than this render through the windowed list. */
export const VIRTUALIZE_THRESHOLD = 50;

/** Rows rendered above and below the visible window. */
export const WINDOW_OVERSCAN = 6;

export interface RowWindow {
  start: number;
  end: number;
}

/**
 * Prefix sums of row heights. `offsets[i]` is the top of row `i`, and the
 * last entry is the full list height.
 */
export function buildRowOffsets(heights: readonly number[]): number[] {
  const offsets = new Array<number>(heights.length + 1);
  offsets[0] = 0;
  for (let i = 0; i < heights.length; i += 1) {
    offsets[i + 1] = offsets[i] + heights[i];
  }
  return offsets;
}

/** Index of the row that contains vertical position `y`. */
function findRowAt(offsets: readonly number[], y: number): number {
  const rowCount = offsets.length - 1;
  let low = 0;
  let high = rowCount - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (offsets[mid] <= y) low = mid;
    else high = mid - 1;
  }
  return Math.max(0, low);
}

/**
 * Half-open range of rows to render for a scroll position and viewport
 * height, with `overscan` extra rows on each side.
 */
export function getRowWindow(
  offsets: readonly number[],
  scrollTop: number,
  viewportHeight: number,
  overscan: number = WINDOW_OVERSCAN,
): RowWindow {
  const rowCount = offsets.length - 1;
  if (rowCount <= 0) return { start: 0, end: 0 };

  const top = Math.max(0, Math.min(scrollTop, offsets[rowCount] - viewportHeight));
  const first = findRowAt(offsets, top);
  const last = findRowAt(offsets, top + viewportHeight);

  return {
    start: Math.max(0, first - overscan),
    end: Math.min(rowCount, last + 1 + overscan),
  };
}
