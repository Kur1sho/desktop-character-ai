import { describe, expect, it } from 'vitest'
import { quickMath } from '../src/shared/quickMath'

describe('quickMath', () => {
  it('answers simple sums however they are asked', () => {
    expect(quickMath("Hey Robotico, what's 9+10")?.answer).toBe('19')
    expect(quickMath('what is 12 times 3?')?.answer).toBe('36')
    expect(quickMath('100 divided by 8')?.answer).toBe('12.5')
    expect(quickMath('whats 7 x 6')?.answer).toBe('42')
    expect(quickMath('what is (2 + 3) * 4')?.answer).toBe('20')
    expect(quickMath('10 minus 15')?.answer).toBe('-5')
    expect(quickMath('1,000 plus 1')?.answer).toBe('1001')
  })
  it('leaves normal chat alone', () => {
    expect(quickMath('how are you today?')).toBeNull()
    expect(quickMath('set a 5 minute timer')).toBeNull()
    expect(quickMath('play blink 182')).toBeNull()
    expect(quickMath('what year is it, 2026?')).toBeNull()
  })
  it("doesn't divide by zero into nonsense", () => {
    expect(quickMath('5 / 0')).toBeNull()
  })
})
