import { describe, expect, it } from 'vitest'
import { blinkAmount, breath, easeOutBack } from '../src/renderer/src/idle'

describe('idle motion', () => {
  it('breath stays within -1..1', () => {
    for (let t = 0; t < 10; t += 0.1) {
      expect(Math.abs(breath(t))).toBeLessThanOrEqual(1)
    }
  })
  it('blinks briefly, and eyes are open most of the time', () => {
    let closed = 0
    const samples = 2000
    for (let i = 0; i < samples; i++) {
      const b = blinkAmount(i * 0.01)
      expect(b).toBeGreaterThanOrEqual(0)
      expect(b).toBeLessThanOrEqual(1)
      if (b > 0.5) closed++
    }
    expect(closed).toBeGreaterThan(0)
    expect(closed / samples).toBeLessThan(0.1)
  })
  it('pop-up easing starts at 0 and ends at 1', () => {
    expect(easeOutBack(0)).toBeCloseTo(0)
    expect(easeOutBack(1)).toBeCloseTo(1)
    expect(easeOutBack(0.6)).toBeGreaterThan(1) // overshoot
  })
})

import { readingMs } from '../src/renderer/src/chat'

describe('readingMs', () => {
  it('gives short replies a few seconds and caps long ones', () => {
    expect(readingMs('Hi')).toBe(2820)
    expect(readingMs('word '.repeat(200))).toBe(15000)
  })
})
