import { describe, expect, it } from 'vitest'
import { BeatTracker, estimateBpm, foldBpm } from '../src/renderer/src/dance/beat'

/** Bass energy for a simple kick drum at `bpm`, sampled every `step` ms. */
function kicks(bpm: number, ms: number, step = 16, start = 0): { t: number; e: number }[] {
  const period = 60000 / bpm
  const out: { t: number; e: number }[] = []
  for (let t = start; t < start + ms; t += step) {
    const since = (t - start) % period
    const e = 0.02 + (since < 60 ? 1 - since / 60 : 0) // short punch, then quiet
    out.push({ t, e })
  }
  return out
}

describe('foldBpm / estimateBpm', () => {
  it('folds tempos into the dance range', () => {
    expect(foldBpm(60)).toBe(120)
    expect(foldBpm(240)).toBe(120)
    expect(foldBpm(128)).toBe(128)
  })
  it('finds the tempo from onset times', () => {
    const onsets = Array.from({ length: 12 }, (_, i) => i * 500) // 120 BPM
    expect(estimateBpm(onsets)).toBeGreaterThanOrEqual(119)
    expect(estimateBpm(onsets)).toBeLessThanOrEqual(121)
    expect(estimateBpm([0, 500])).toBeNull()
  })
})

describe('BeatTracker', () => {
  it('locks onto a steady 120 BPM kick and ticks on the beat', () => {
    const tracker = new BeatTracker()
    const beats: number[] = []
    let last = null as ReturnType<BeatTracker['push']> | null
    for (const { t, e } of kicks(120, 10000)) {
      last = tracker.push(e, t)
      if (last.beat && t > 5000) beats.push(t)
    }
    expect(last!.bpm).toBeGreaterThan(115)
    expect(last!.bpm).toBeLessThan(125)
    // Beats land close to the kicks (every 500 ms).
    for (const b of beats) {
      const off = b % 500
      expect(Math.min(off, 500 - off)).toBeLessThan(80)
    }
    expect(beats.length).toBeGreaterThanOrEqual(8)
  })
  it('finds a faster tempo too', () => {
    const tracker = new BeatTracker()
    let last = null as ReturnType<BeatTracker['push']> | null
    for (const { t, e } of kicks(150, 10000)) last = tracker.push(e, t)
    expect(last!.bpm).toBeGreaterThan(144)
    expect(last!.bpm).toBeLessThan(156)
  })
  it('copes with other sounds between the kicks', () => {
    const tracker = new BeatTracker()
    let seed = 1
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    let last = null as ReturnType<BeatTracker['push']> | null
    for (const { t, e } of kicks(128, 12000)) last = tracker.push(e * 0.8 + rand() * 0.15, t)
    expect(last!.bpm).toBeGreaterThan(122)
    expect(last!.bpm).toBeLessThan(134)
  })
  it('notices when the music stops', () => {
    const tracker = new BeatTracker()
    for (const { t, e } of kicks(120, 4000)) tracker.push(e, t)
    let state = tracker.push(0, 4000)
    for (let t = 4016; t < 8000; t += 16) state = tracker.push(0, t)
    expect(state.silentForMs).toBeGreaterThan(3500)
  })
})
