import { describe, expect, it } from 'vitest'
import { hasDedicatedGpu, isDownloadError, planBrains, planKey, type Hardware } from '../src/shared/brainPick'

const GB = 1024 ** 3
const keys = (hw: Hardware, failed: string[] = []) => planBrains(hw, failed).map(planKey)
const rtx = (vram: number): Hardware => ({ gpu: 'cuda', vramTotal: vram * GB, vramUnified: 0, ramTotal: 32 * GB })

describe('planBrains', () => {
  it('gives a 16 GB card the 14B brain, stepping down to 8B, 4B and the processor', () => {
    expect(keys(rtx(16))).toEqual([
      'gpu:qwen3-14b',
      'gpu:qwen3-8b',
      'gpu:qwen3-4b',
      'gpu:qwen3-1.7b',
      'cpu:qwen3-4b',
      'cpu:qwen3-1.7b'
    ])
  })
  it('gives an 8 GB card the 8B brain', () => {
    expect(keys(rtx(8))[0]).toBe('gpu:qwen3-8b')
  })
  it('gives a 6 GB card the 4B brain', () => {
    expect(keys(rtx(6))[0]).toBe('gpu:qwen3-4b')
  })
  it('runs the 4B brain on the processor for laptops with shared graphics', () => {
    const laptop: Hardware = { gpu: 'vulkan', vramTotal: 8 * GB, vramUnified: 8 * GB, ramTotal: 16 * GB }
    expect(hasDedicatedGpu(laptop)).toBe(false)
    expect(keys(laptop)).toEqual(['cpu:qwen3-4b', 'cpu:qwen3-1.7b'])
  })
  it('uses 1.7B on PCs with little memory', () => {
    expect(keys({ gpu: false, vramTotal: 0, vramUnified: 0, ramTotal: 6 * GB })).toEqual(['cpu:qwen3-1.7b'])
  })
  it('skips brains that failed on this PC', () => {
    expect(keys(rtx(16), ['gpu:qwen3-14b'])[0]).toBe('gpu:qwen3-8b')
  })
  it('still tries the smallest brain if everything failed', () => {
    const all = keys(rtx(16))
    expect(keys(rtx(16), all)).toEqual(['cpu:qwen3-1.7b'])
  })
})

it('tells download problems from brains that do not fit', () => {
  expect(isDownloadError('getaddrinfo ENOTFOUND huggingface.co')).toBe(true)
  expect(isDownloadError('Failed to load model')).toBe(false)
})
