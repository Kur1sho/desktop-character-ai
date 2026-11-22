import { describe, expect, it } from 'vitest'
import {
  BRAIN_LARGE,
  BRAIN_MEDIUM,
  BRAIN_SMALL,
  brainCandidates,
  choiceKey,
  type BrainChoice,
  isGpuError,
  isNetworkError,
  isWeakGpu,
  isThinkingModel,
  maxTokensFor,
  stripThinking
} from '../src/shared/brainModels'
import { withCopiedText } from '../src/shared/clipboard'

const gpu = (model: string) => ({ model, device: 'gpu' })
const cpu = (model: string) => ({ model, device: 'cpu' })

describe('brainCandidates', () => {
  it('tries the 4B brain on a graphics card, then steps down to the processor', () => {
    expect(brainCandidates('auto', true)).toEqual([gpu(BRAIN_LARGE), gpu(BRAIN_MEDIUM), cpu(BRAIN_MEDIUM), cpu(BRAIN_SMALL)])
  })
  it('uses the 1.7B brain on the processor when there is no graphics card', () => {
    expect(brainCandidates('', false)).toEqual([cpu(BRAIN_MEDIUM), cpu(BRAIN_SMALL)])
  })
  it('skips brains that already failed on this PC (integrated graphics)', () => {
    const failed = [choiceKey(gpu(BRAIN_LARGE) as BrainChoice), choiceKey(gpu(BRAIN_MEDIUM) as BrainChoice)]
    expect(brainCandidates('auto', true, failed)[0]).toEqual(cpu(BRAIN_MEDIUM))
  })
  it('still tries the safest brain if everything failed before', () => {
    const all = brainCandidates('auto', true).map(choiceKey)
    expect(brainCandidates('auto', true, all)).toEqual([cpu(BRAIN_SMALL)])
  })
  it('treats the old saved default as auto', () => {
    expect(brainCandidates(BRAIN_SMALL, true)[0]).toEqual(gpu(BRAIN_LARGE))
  })
  it('keeps a model the user typed, falling back to the processor', () => {
    expect(brainCandidates('someone/My-Model-ONNX', true)).toEqual([gpu('someone/My-Model-ONNX'), cpu('someone/My-Model-ONNX')])
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

it('spots the graphics chip crashing mid-reply', () => {
  expect(
    isGpuError(
      "failed to call OrtRun(). ERROR_CODE: 1 ... Failed to execute 'mapAsync' on 'GPUBuffer': A valid external Instance reference no longer exists."
    )
  ).toBe(true)
  expect(isGpuError('Unexpected token in JSON')).toBe(false)
})

describe('isWeakGpu', () => {
  it('uses the processor on shared Intel laptop graphics', () => {
    expect(isWeakGpu({ vendor: 'intel', architecture: 'gen-12lp' })).toBe(true)
    expect(isWeakGpu({ vendor: 'intel', architecture: 'xe2-lpg' })).toBe(true)
  })
  it('keeps the GPU for dedicated cards', () => {
    expect(isWeakGpu({ vendor: 'nvidia', architecture: 'ada' })).toBe(false)
    expect(isWeakGpu({ vendor: 'amd', architecture: 'rdna-3' })).toBe(false)
    expect(isWeakGpu({ vendor: 'intel', architecture: 'xe-hpg' })).toBe(false)
  })
  it('never uses a software fallback', () => {
    expect(isWeakGpu({ vendor: 'google', isFallbackAdapter: true })).toBe(true)
  })
})
