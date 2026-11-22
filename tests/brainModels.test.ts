import { describe, expect, it } from 'vitest'
import {
  BRAIN_LARGE,
  BRAIN_MEDIUM,
  BRAIN_SMALL,
  brainCandidates,
  isNetworkError,
  isThinkingModel,
  maxTokensFor,
  stripThinking
} from '../src/shared/brainModels'
import { withCopiedText } from '../src/shared/clipboard'

describe('brainCandidates', () => {
  it('uses the 4B brain on a graphics card, stepping down if it will not fit', () => {
    expect(brainCandidates('auto', true)).toEqual([BRAIN_LARGE, BRAIN_MEDIUM])
  })
  it('uses the 1.7B brain on the processor', () => {
    expect(brainCandidates('', false)).toEqual([BRAIN_MEDIUM, BRAIN_SMALL])
  })
  it('treats the old saved default as auto', () => {
    expect(brainCandidates(BRAIN_SMALL, true)[0]).toBe(BRAIN_LARGE)
  })
  it('keeps a model the user typed', () => {
    expect(brainCandidates('someone/My-Model-ONNX', true)).toEqual(['someone/My-Model-ONNX'])
  })
})

describe('thinking', () => {
  it('knows Qwen3 thinks by default', () => {
    expect(isThinkingModel(BRAIN_LARGE)).toBe(true)
    expect(isThinkingModel(BRAIN_SMALL)).toBe(false)
  })
  it('strips think blocks', () => {
    expect(stripThinking('<think>\n\n</think>\n\n[happy] Hi!')).toBe('[happy] Hi!')
    expect(stripThinking('[smug] Easy. <think>hmm')).toBe('[smug] Easy.')
  })
})

describe('maxTokensFor', () => {
  it('keeps chat short and gives room for detail and copied text', () => {
    expect(maxTokensFor('hey')).toBe(100)
    expect(maxTokensFor('explain black holes')).toBeGreaterThan(100)
    expect(maxTokensFor(withCopiedText('translate this', 'hola'))).toBe(400)
  })
})

it('spots network errors', () => {
  expect(isNetworkError('Failed to fetch')).toBe(true)
  expect(isNetworkError('WebGPU out of memory')).toBe(false)
})
