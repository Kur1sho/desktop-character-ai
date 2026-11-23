// Sitting on windows: which window top edge the character lands on when dropped.
// Window coordinates: x to the right, y down, relative to the companion's overlay.

export interface WinRect {
  /** Stays the same while the window is open, so the character can follow it when it moves. */
  id: number
  x: number
  y: number
  width: number
  height: number
}

export interface Surface {
  /** Where the feet go (window coordinates, y down). */
  y: number
  /** The window sat on, or null for the taskbar. */
  id: number | null
}

/**
 * The surface under x that something falling from fromY lands on: the top edge of a
 * window (if it isn't covered by another window there), or else the floor.
 * @param wins windows in front-to-back order, front first
 * @param minTop window tops above this are too high to sit on (no room for the head)
 */
export function surfaceAt(x: number, fromY: number, wins: WinRect[], floorY: number, minTop: number): Surface {
  let best: Surface = { y: floorY, id: null }
  wins.forEach((w, i) => {
    const top = w.y
    if (top < minTop || top >= floorY - 4 || top < fromY - 0.5 || top >= best.y) return
    if (x < w.x + 6 || x > w.x + w.width - 6) return
    // Covered by a window in front of it, right where the feet would go.
    const covered = wins.slice(0, i).some((o) => x >= o.x && x <= o.x + o.width && top + 1 >= o.y && top + 1 <= o.y + o.height)
    if (!covered) best = { y: top, id: w.id }
  })
  return best
}

/**
 * Sitting on a window that may have moved: where the feet go now, or null if the
 * window is gone, too high, covered or no longer under the character (so it falls).
 */
export function followWindow(
  id: number,
  x: number,
  last: WinRect,
  wins: WinRect[],
  floorY: number,
  minTop: number
): { x: number; y: number } | null {
  const now = wins.find((w) => w.id === id)
  if (!now) return null
  const nx = x + (now.x - last.x)
  const s = surfaceAt(nx, now.y, wins, floorY, minTop)
  return s.id === id ? { x: nx, y: now.y } : null
}

/** Reads the window list from the helper: "handle,x,y,width,height;..." */
export function parseWindows(line: string): WinRect[] {
  const out: WinRect[] = []
  for (const part of line.split(';')) {
    const n = part.split(',').map(Number)
    if (n.length === 5 && n.every(Number.isFinite)) out.push({ id: n[0], x: n[1], y: n[2], width: n[3], height: n[4] })
  }
  return out
}
