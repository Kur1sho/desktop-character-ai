// Little things the character does by itself when nothing's going on.

export type Routine = 'lookAround' | 'yawn' | 'stretch' | 'wander' | 'peek' | 'drum'

export interface RoutineContext {
  /** On the taskbar (not sitting on a window), so it can walk about. */
  onFloor: boolean
  /** The user is busy at the PC right now (mouse or keyboard in the last few seconds). */
  userActive: boolean
  /** How long the user has been busy without a pause, in seconds. */
  activeForSec: number
  hour: number
  /** The mouse moved in the last couple of seconds (so looking around would look odd). */
  mouseMoving: boolean
}

/** Picks what to do next, weighted so it feels natural (yawns more late at night, drums while you work). */
export function pickRoutine(c: RoutineContext, rng: () => number = Math.random): Routine | null {
  const late = c.hour >= 22 || c.hour < 6
  const weights: [Routine, number][] = [
    ['lookAround', c.mouseMoving ? 0 : 30],
    ['yawn', late ? 30 : 12],
    ['stretch', 14],
    ['wander', c.onFloor ? 10 : 0],
    ['peek', c.onFloor ? 7 : 0],
    // Tapping along while you work. It only knows you're busy, never what you type.
    ['drum', c.userActive && c.activeForSec >= 30 ? 28 : 0]
  ]
  const total = weights.reduce((a, [, w]) => a + w, 0)
  if (total <= 0) return null
  let r = rng() * total
  for (const [name, w] of weights) {
    if ((r -= w) < 0) return name
  }
  return null
}

/** Seconds until the next routine: every half a minute to a minute and a half. */
export function nextRoutineIn(rng: () => number = Math.random): number {
  return 30 + rng() * 60
}

/** How long each one lasts, in seconds. */
export const ROUTINE_SECONDS: Record<Routine, number> = {
  lookAround: 3.5,
  yawn: 2.2,
  stretch: 2.6,
  wander: 4,
  peek: 12,
  drum: 5
}
