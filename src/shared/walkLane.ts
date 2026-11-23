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

/** Somewhere to stand: the taskbar (id null) or the top of a window. Scene coordinates, y up. */
export interface Ledge {
  id: number | null
  /** Where the feet go. */
  y: number
  /** How far along it there's room to stand. */
  left: number
  right: number
}

/**
 * Where the friend stands beside the main character on a ledge: on whichever side
 * has room, or right next to it (in front or behind) if the ledge is too short.
 */
export function besideOn(
  ledge: Ledge,
  mainX: number,
  gap: number,
  stands: (x: number) => boolean = () => true,
  /** The side it's on now (-1 left, 1 right), kept if there's room so it doesn't swap sides. */
  side = 1
): number {
  const ok = (x: number) => x >= ledge.left && x <= ledge.right && stands(x)
  const s = side < 0 ? -1 : 1
  if (ok(mainX + s * gap)) return mainX + s * gap
  if (ok(mainX - s * gap)) return mainX - s * gap
  // Not enough room for both side by side: squeeze in as close as it can.
  const half = gap * 0.5
  if (ok(mainX + s * half)) return mainX + s * half
  if (ok(mainX - s * half)) return mainX - s * half
  return Math.min(ledge.right, Math.max(ledge.left, mainX))
}

/** How far the friend can jump sideways in one go, as a share of the character's height. */
export const JUMP_REACH = 1.1

/**
 * A hop from one ledge to another: where it is part way (p from 0 to 1). It rises
 * a little above the higher of the two, then comes down onto the new one.
 */
export function hopAt(from: { x: number; y: number }, to: { x: number; y: number }, p: number, px: number): { x: number; y: number } {
  const rise = Math.max(0, to.y - from.y)
  const h = px * 0.22 + rise * 0.35
  return { x: from.x + (to.x - from.x) * p, y: from.y + (to.y - from.y) * p + 4 * h * p * (1 - p) }
}

/** How long a hop takes, in seconds: longer for bigger ones. */
export function hopSeconds(from: { x: number; y: number }, to: { x: number; y: number }, px: number): number {
  const d = Math.hypot(to.x - from.x, to.y - from.y) / px
  return Math.min(0.9, 0.42 + d * 0.22)
}
