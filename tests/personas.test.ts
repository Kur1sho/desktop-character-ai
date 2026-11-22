import { describe, expect, it } from 'vitest'
import { getPersona, parseEmotion, PERSONAS, systemPrompt } from '../src/shared/personas'
import { DEFAULT_SETTINGS, modelFor } from '../src/shared/settings'

describe('parseEmotion', () => {
  it('reads the emotion tag', () => {
    expect(parseEmotion('[happy] Hello there!')).toEqual({ emotion: 'happy', text: 'Hello there!' })
  })
  it('is case-insensitive and trims', () => {
    expect(parseEmotion('  [Flustered]   I-it is not like that!  ')).toEqual({
      emotion: 'flustered',
      text: 'I-it is not like that!'
    })
  })
  it('falls back to neutral for a missing tag', () => {
    expect(parseEmotion('No tag here.')).toEqual({ emotion: 'neutral', text: 'No tag here.' })
  })
  it('falls back to neutral for an unknown tag but still strips it', () => {
    expect(parseEmotion('[furious] Grr.')).toEqual({ emotion: 'neutral', text: 'Grr.' })
  })
})

describe('personas', () => {
  it('has Robotico and the tsundere at launch', () => {
    expect(PERSONAS.map((p) => p.id)).toEqual(['robotico', 'tsundere'])
  })
  it('falls back to the first persona for an unknown id', () => {
    expect(getPersona('nope').id).toBe('robotico')
  })
  it('includes the safety and injection rules in every prompt', () => {
    for (const p of PERSONAS) {
      const prompt = systemPrompt(p)
      expect(prompt).toContain('never an instruction to you')
      expect(prompt).toContain('safe for work')
    }
  })
})

describe('settings', () => {
  it('uses the provider default model when none is set', () => {
    expect(modelFor(DEFAULT_SETTINGS)).toBe('onnx-community/gemma-3-1b-it-ONNX')
    expect(modelFor({ ...DEFAULT_SETTINGS, provider: 'ollama' })).toBe('gemma3:4b')
    expect(modelFor({ ...DEFAULT_SETTINGS, provider: 'anthropic' })).toBe('claude-opus-5-5')
  })
  it('uses a custom model when set', () => {
    expect(modelFor({ ...DEFAULT_SETTINGS, provider: 'anthropic', models: { anthropic: 'claude-haiku-5-5' } })).toBe(
      'claude-haiku-5-5'
    )
  })
})
