// Small, pure helpers for idle motion so they can be unit tested.

/** Breathing: a slow sine wave, returns -1..1. */
export function breath(time: number, period = 3.6): number {
  return Math.sin((time * Math.PI * 2) / period)
}

/**
 * Blink schedule. Returns 0 (open) to 1 (closed) for a given time.
 * Blinks last 0.15s and happen every few seconds at pseudo-random intervals.
 */
export function blinkAmount(time: number, seed = 1): number {
  // Deterministic "random" gaps between 2.5s and 5.5s.
  let t = 0
  let i = 0
  while (t < time) {
    const gap = 2.5 + 3 * fract(Math.sin((i + 1) * 12.9898 * seed) * 43758.5453)
    if (time < t + gap) {
      const into = time - t
      const dur = 0.15
      if (into > gap - dur) {
        const p = (into - (gap - dur)) / dur // 0..1
        return Math.sin(p * Math.PI)
      }
      return 0
    }
    t += gap
    i++
  }
  return 0
}

/** Ease-out with a small overshoot, for the pop-up from the taskbar. 0..1 -> 0..1 */
export function easeOutBack(p: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  const x = Math.min(1, Math.max(0, p))
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}

function fract(x: number): number {
  return x - Math.floor(x)
}
