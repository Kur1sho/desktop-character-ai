// Works out where the character stands, in window coordinates.
// The overlay window covers the whole display, so the character can sit
// right on the edge of the taskbar whichever side of the screen it's on.

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export type TaskbarEdge = 'bottom' | 'top' | 'left' | 'right' | 'none'

export interface Layout {
  /** Which edge the taskbar is on. */
  edge: TaskbarEdge
  /** The point the character's feet rest on, relative to the window's top left. */
  anchor: { x: number; y: number }
  /** The work area (screen minus taskbar), relative to the window. */
  workArea: Rect
}

/** Works out which edge of the display the taskbar sits on. */
export function findTaskbarEdge(bounds: Rect, workArea: Rect): TaskbarEdge {
  const top = workArea.y - bounds.y
  const left = workArea.x - bounds.x
  const bottom = bounds.y + bounds.height - (workArea.y + workArea.height)
  const right = bounds.x + bounds.width - (workArea.x + workArea.width)
  const biggest = Math.max(top, left, bottom, right)
  if (biggest <= 0) return 'none'
  if (biggest === bottom) return 'bottom'
  if (biggest === top) return 'top'
  if (biggest === left) return 'left'
  return 'right'
}

/**
 * Computes the layout for a display.
 * @param xFraction where along the taskbar the character stands, 0 = left, 1 = right
 */
export function computeLayout(bounds: Rect, workArea: Rect, xFraction = 0.85): Layout {
  const edge = findTaskbarEdge(bounds, workArea)
  const local: Rect = {
    x: workArea.x - bounds.x,
    y: workArea.y - bounds.y,
    width: workArea.width,
    height: workArea.height
  }
  const f = clamp(xFraction, 0, 1)
  // The character always stands on the bottom of the work area. With a side or
  // top taskbar that's the bottom of the screen, which still looks natural.
  const anchor = {
    x: Math.round(local.x + local.width * f),
    y: local.y + local.height
  }
  return { edge, anchor, workArea: local }
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}
