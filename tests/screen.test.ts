import { describe, expect, it } from 'vitest'
import { screenRequest } from '../src/shared/screen'

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
    'what does that say'
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
