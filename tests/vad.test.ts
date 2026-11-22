import { describe, expect, it } from 'vitest'
import { rms, Vad } from '../src/renderer/src/voice/vad'

function run(vad: Vad, frames: number[], frameMs = 50): string {
  let last = ''
  for (const f of frames) {
    last = vad.push(f, frameMs)
    if (last === 'done' || last === 'no-speech') break
  }
  return last
}

const quiet = (ms: number) => Array(ms / 50).fill(0.003)
const loud = (ms: number) => Array(ms / 50).fill(0.1)

describe('Vad', () => {
  it('finishes after speech followed by silence', () => {
    expect(run(new Vad(), [...quiet(300), ...loud(1000), ...quiet(1200)])).toBe('done')
  })
  it('keeps listening during short pauses', () => {
    expect(run(new Vad(), [...quiet(300), ...loud(500), ...quiet(600), ...loud(500)])).toBe('speaking')
  })
  it('gives up when nobody talks', () => {
    expect(run(new Vad(), quiet(8000))).toBe('no-speech')
  })
  it('ignores a single click', () => {
    expect(run(new Vad(), [...quiet(300), 0.2, ...quiet(2000)])).toBe('waiting')
  })
  it('adapts to a noisy room', () => {
    const noisy = (ms: number) => Array(ms / 50).fill(0.03)
    // Background at 0.03 should not count as speech.
    expect(run(new Vad(), noisy(3000))).toBe('waiting')
  })
  it('stops at the hard cap', () => {
    expect(run(new Vad({ maxMs: 2000 }), [...quiet(300), ...loud(3000)])).toBe('done')
  })
})

describe('rms', () => {
  it('measures loudness', () => {
    expect(rms(new Float32Array([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5)
    expect(rms(new Float32Array(0))).toBe(0)
  })
})
