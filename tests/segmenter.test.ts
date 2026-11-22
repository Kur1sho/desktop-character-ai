import { describe, expect, it } from 'vitest'
import { Segmenter } from '../src/renderer/src/voice/segmenter'

const frame = (v: number) => new Float32Array(800).fill(v) // 50 ms at 16 kHz
function feed(seg: Segmenter, levels: number[]): Float32Array[] {
  const out: Float32Array[] = []
  for (const l of levels) {
    const r = seg.push(frame(l), l, 50)
    if (r) out.push(r)
  }
  return out
}
const quiet = (ms: number) => Array(ms / 50).fill(0.003)
const loud = (ms: number) => Array(ms / 50).fill(0.1)

describe('Segmenter', () => {
  it('cuts out one phrase, with pre-roll', () => {
    const phrases = feed(new Segmenter(), [...quiet(1000), ...loud(1000), ...quiet(1000)])
    expect(phrases).toHaveLength(1)
    // 1000 ms speech + 700 ms trailing silence + up to 400 ms pre-roll
    const ms = (phrases[0].length / 16000) * 1000
    expect(ms).toBeGreaterThanOrEqual(1700)
    expect(ms).toBeLessThanOrEqual(2150)
  })
  it('splits two phrases separated by a pause', () => {
    const phrases = feed(new Segmenter(), [...quiet(500), ...loud(600), ...quiet(1000), ...loud(600), ...quiet(1000)])
    expect(phrases).toHaveLength(2)
  })
  it('ignores short clicks and silence', () => {
    expect(feed(new Segmenter(), [...quiet(500), 0.2, 0.2, ...quiet(3000)])).toHaveLength(0)
  })
  it('caps very long phrases', () => {
    const phrases = feed(new Segmenter({ maxPhraseMs: 2000 }), [...quiet(300), ...loud(5000)])
    expect(phrases.length).toBeGreaterThanOrEqual(1)
  })
  it('gives a snapshot of a phrase while it is still going', () => {
    const seg = new Segmenter()
    expect(seg.snapshot()).toBeNull()
    feed(seg, [...quiet(500), ...loud(800)])
    expect(seg.active).toBe(true)
    const snap = seg.snapshot()
    expect(snap).not.toBeNull()
    expect((snap!.length / 16000) * 1000).toBeCloseTo(seg.currentMs, -1)
    expect(seg.currentMs).toBeGreaterThanOrEqual(800)
  })
})
