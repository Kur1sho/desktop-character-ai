import { describe, expect, it } from 'vitest'
import { screenChoice, screenRequest } from '../src/shared/screen'

describe('screenRequest', () => {
  it.each([
    "what's this error?",
    'What does this message mean',
    'look at my screen',
    "Hey Robotico, what's on my screen?",
    'can you see this',
    'look at this',
    'how do I beat this boss',
    'help me with this',
    'what am I looking at',
    'read the screen for me',
    'what does that say',
    'whats the first video on youtube on the right screen',
    'read my second monitor',
    'what game is open on my other screen'
  ])('looks for "%s"', (t) => expect(screenRequest(t)).toBe(true))

  it.each([
    'take a screenshot',
    'dim the screen',
    'lock my screen',
    'make discord full screen',
    'how are you',
    'open spotify and play orpheus',
    "what's the weather",
    'what is this song'
  ])('does not look for "%s"', (t) => expect(screenRequest(t)).toBe(false))
})

describe('screenChoice', () => {
  it('knows which screen is meant', () => {
    expect(screenChoice('whats on the right screen')).toBe('right')
    expect(screenChoice('read my second monitor')).toBe('other')
    expect(screenChoice('look at my main display')).toBe('primary')
    expect(screenChoice("what's on my screen")).toBeNull()
  })
})
