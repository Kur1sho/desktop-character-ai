import { describe, expect, it } from 'vitest'
import { EMOTIONS, parseEmotion } from '../src/shared/personas'
import { ACTIVITY_POPUPS, drawFace, POPUPS, type Activity } from '../src/renderer/src/robotFace'

/** A pretend canvas that records what was drawn and checks the numbers are real. */
function fakeCanvas() {
  const calls: string[] = []
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(target, key: string) {
      if (key in target) return target[key]
      return (...args: unknown[]) => {
        for (const a of args) if (typeof a === 'number' && !Number.isFinite(a)) throw new Error(`${key} got ${a}`)
        calls.push(key)
      }
    },
    set(target, key: string, value) {
      target[key] = value
      return true
    }
  })
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls }
}

describe('robot face', () => {
  const activities: Activity[] = ['idle', 'listening', 'thinking', 'dancing', 'sleeping']
  it('draws every emotion and activity, blinking and talking, without bad numbers', () => {
    for (const emotion of EMOTIONS)
      for (const activity of activities)
        for (const [blink, mouth] of [[0, 0], [1, 0], [0, 0.8]]) {
          const { ctx, calls } = fakeCanvas()
          drawFace(ctx, { emotion, activity, blink, mouth, time: 3.7, lookX: 0.5, lookY: -0.3, since: 1 })
          expect(calls.length).toBeGreaterThan(5)
        }
  })
  it('gives different emotions different drawings', () => {
    const drawn = new Set<string>()
    for (const emotion of EMOTIONS) {
      const { ctx, calls } = fakeCanvas()
      drawFace(ctx, { emotion, activity: 'idle', blink: 0, mouth: 0, time: 0, lookX: 0, lookY: 0, since: 0 })
      drawn.add(calls.join(','))
    }
    expect(drawn.size).toBe(EMOTIONS.length)
  })
  it('only pops up emoji for real emotions and activities', () => {
    for (const k of Object.keys(POPUPS)) expect(EMOTIONS).toContain(k)
    expect(Object.keys(ACTIVITY_POPUPS).every((k) => activities.includes(k as Activity))).toBe(true)
  })
})

describe('new emotions', () => {
  it('lets the AI use them, and maps close words onto them', () => {
    expect(parseEmotion('[love] Aww, thanks!').emotion).toBe('love')
    expect(parseEmotion('[Laughing] Haha!').emotion).toBe('laughing')
    expect(parseEmotion('[terrified] Eek.').emotion).toBe('scared')
    expect(parseEmotion('[puzzled] Hm?').emotion).toBe('confused')
    expect(parseEmotion('[thrilled] Yes!').emotion).toBe('excited')
  })
})
