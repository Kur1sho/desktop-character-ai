import { describe, expect, it } from 'vitest'
import { approachAngle, Choreographer, feltTempo, MoodTracker, MOVES } from '../src/renderer/src/dance/choreo'

describe('dance moves', () => {
  it('every move gives sensible numbers across a whole phrase', () => {
    for (const m of MOVES) {
      for (let b = 0; b < 8; b += 0.05) {
        const p = m.pose(b, 260, 0.8)
        for (const v of [p.x, p.y, p.rotX, p.rotY, p.rotZ]) expect(Number.isFinite(v)).toBe(true)
        expect(p.y).toBeGreaterThanOrEqual(-1) // never sinks into the taskbar
      }
    }
  })
  it('has moves for every mood', () => {
    for (const mood of ['chill', 'groove', 'hype'] as const) {
      expect(MOVES.filter((m) => m.mood === mood).length).toBeGreaterThanOrEqual(4)
    }
  })
  it('a backflip goes all the way round and lands', () => {
    const flip = MOVES.find((m) => m.name === 'backflip')!
    expect(flip.pose(0, 260, 1).rotX).toBeCloseTo(0)
    expect(Math.abs(flip.pose(1.999, 260, 1).rotX)).toBeGreaterThan(6.2)
    expect(flip.pose(1, 260, 1).y).toBeGreaterThan(100) // airborne mid-flip
    expect(flip.pose(2, 260, 1).y).toBeLessThan(20) // landed
  })
  it('flying comes back down at the end of the phrase', () => {
    const fly = MOVES.find((m) => m.name === 'fly')!
    expect(fly.pose(4, 260, 1).y).toBeGreaterThan(50)
    expect(Math.abs(fly.pose(7.999, 260, 1).y)).toBeLessThan(5)
  })
})

describe('MoodTracker', () => {
  function run(bpm: number, hitsPerSec: number, centroid: number) {
    const m = new MoodTracker()
    let mood = m.mood
    const gap = 1000 / hitsPerSec
    let next = 0
    for (let t = 0; t < 40000; t += 16) {
      const onset = t >= next
      if (onset) next += gap
      mood = m.push(t, onset, bpm, centroid)
    }
    return mood
  }
  it('calls a fast, busy, bright song hype', () => expect(run(150, 4, 3500)).toBe('hype'))
  it('calls a slow, sparse, dark song chill', () => expect(run(72, 0.5, 700)).toBe('chill'))
  it('calls a mid-tempo song a groove', () => expect(run(110, 2, 1900)).toBe('groove'))
  it('still calls a banger hype when the tempo was heard at half speed', () => expect(run(75, 4, 3500)).toBe('hype'))
  it('feltTempo doubles half-speed readings only when the drums say so', () => {
    expect(feltTempo(75, 4)).toBe(150)
    expect(feltTempo(72, 1.2)).toBe(72)
    expect(feltTempo(128, 4)).toBe(128)
  })
})

describe('Choreographer', () => {
  it('changes move every 8 beats and stays in the mood', () => {
    let seed = 3
    const c = new Choreographer(() => ((seed = (seed * 16807) % 2147483647) / 2147483647))
    const seen: string[] = []
    for (let beat = 0; beat < 64; beat += 0.1) {
      c.pose(beat, 'hype', 260, 1)
      if (seen.at(-1) !== c.current) seen.push(c.current)
    }
    const hype = new Set(MOVES.filter((m) => m.mood === 'hype').map((m) => m.name))
    expect(seen.length).toBeGreaterThanOrEqual(7)
    for (const name of seen.slice(1)) expect(hype.has(name)).toBe(true)
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1])
  })
})

describe('approachAngle', () => {
  it('takes the short way round', () => {
    // From a finished flip (2π) toward 0 should not unwind backwards.
    expect(approachAngle(Math.PI * 2, 0, 0.5)).toBeCloseTo(Math.PI * 2)
    expect(approachAngle(0, 1, 0.5)).toBeCloseTo(0.5)
  })
})
