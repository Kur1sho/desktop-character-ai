// The friend walking past the main character goes in front of it or behind it,
// rather than through it.

/** Walking from x to `to` would pass through the main character standing at mainX. */
export function crossesMain(x: number, to: number, mainX: number, px: number): boolean {
  if (Math.abs(to - x) < 4) return false
  const clear = px * 0.45
  return mainX + clear > Math.min(x, to) && mainX - clear < Math.max(x, to)
}

/**
 * How a depth (-1 behind, 0 level, 1 in front) looks on screen: further back is
 * smaller and a little higher up, nearer is bigger and lower, like a floor in perspective.
 */
export function laneLook(depth: number, px: number): { z: number; scale: number; lift: number } {
  return { z: depth * px * 0.65, scale: 1 + depth * 0.12, lift: -depth * px * 0.07 }
}
