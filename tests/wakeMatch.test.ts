import { describe, expect, it } from 'vitest'
import { matchWakeWord } from '../src/renderer/src/voice/wakeMatch'

describe('matchWakeWord', () => {
  it('matches the plain name with a greeting', () => {
    expect(matchWakeWord('Hey Robotico.', 'Robotico')).toEqual({ matched: true, rest: '' })
  })
  it('returns the command after the name', () => {
    expect(matchWakeWord('Hey Robotico, how are you today?', 'Robotico')).toEqual({
      matched: true,
      rest: 'how are you today'
    })
  })
  it('handles common misspellings from speech recognition', () => {
    for (const heard of ['Hey Roboteco', 'Hey robot ico', 'Hey Robo Tico', 'Okay Robotica what time is it']) {
      expect(matchWakeWord(heard, 'Robotico').matched).toBe(true)
    }
  })
  it('does not trigger on unrelated speech', () => {
    for (const heard of ['I bought a robot today', 'Hey Rob, are you coming?', 'The robotics club meets at noon']) {
      expect(matchWakeWord(heard, 'Robotico').matched).toBe(false)
    }
  })
  it('only matches near the start, after fillers', () => {
    expect(matchWakeWord('I told my friend about Robotico', 'Robotico').matched).toBe(false)
  })
  it('needs an exact match for short names', () => {
    expect(matchWakeWord('Hey Suzu', 'Suzu').matched).toBe(true)
    expect(matchWakeWord('Hey Susan', 'Suzu').matched).toBe(false)
  })
})
