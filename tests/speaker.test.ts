import { describe, expect, it } from 'vitest'
import { getPersona } from '../src/shared/personas'
import { pickVoice } from '../src/renderer/src/voice/speaker'

const windowsVoices = [
  { name: 'Microsoft David - English (United States)', lang: 'en-US' },
  { name: 'Microsoft Zira - English (United States)', lang: 'en-US' },
  { name: 'Microsoft Hazel - English (United Kingdom)', lang: 'en-GB' },
  { name: 'Microsoft Haruka - Japanese', lang: 'ja-JP' }
]

describe('pickVoice', () => {
  it('gives Robotico a male voice', () => {
    expect(pickVoice(windowsVoices, getPersona('robotico').voice)?.name).toContain('David')
  })
  it('gives the tsundere a female voice', () => {
    expect(pickVoice(windowsVoices, getPersona('tsundere').voice)?.name).toContain('Zira')
  })
  it('falls back by gender when no preferred voice exists', () => {
    const voices = [
      { name: 'Some Male Voice', lang: 'en-US' },
      { name: 'Some Female Voice', lang: 'en-US' }
    ]
    expect(pickVoice(voices, getPersona('tsundere').voice)?.name).toBe('Some Female Voice')
    expect(pickVoice(voices, getPersona('robotico').voice)?.name).toBe('Some Male Voice')
  })
  it('returns null with no voices', () => {
    expect(pickVoice([], getPersona('robotico').voice)).toBeNull()
  })
})
