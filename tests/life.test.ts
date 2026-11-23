import { describe, expect, it } from 'vitest'
import { PatDetector, PokeCounter } from '../src/shared/pet'
import { atRest, fallStep, holdStep, newBody, type World } from '../src/shared/physics'
import { followWindow, parseWindows, surfaceAt, type WinRect } from '../src/shared/perch'
import { COLORS, EMPTY_PROGRESS, HATS, isUnlocked, newlyUnlocked, resolveLook, unlockHint } from '../src/shared/cosmetics'
import { AWAY_SEC, Chatter, parseRunningAppId, type ChatterEvent } from '../src/shared/chatter'
import { pickRoutine } from '../src/shared/routines'
import { greetingFor, lifeLine } from '../src/shared/lifeLines'
import { BANTER, pickBanter } from '../src/shared/banter'
import { characterScale } from '../src/shared/settings'

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

describe('head pats', () => {
  it('spots rubbing back and forth', () => {
    const p = new PatDetector()
    const xs = [100, 120, 100, 120, 100, 120]
    const out = xs.map((x, i) => p.move(x, i * 150))
    expect(out).toContain('start')
    expect(out.filter((x) => x === 'start')).toHaveLength(1)
    expect(p.patting(xs.length * 150)).toBe(true)
  })

  it('ignores just passing over the head', () => {
    const p = new PatDetector()
    const out = [100, 110, 120, 130, 140, 150].map((x, i) => p.move(x, i * 50))
    expect(out.every((x) => x === null)).toBe(true)
  })

  it('ignores tiny jitters', () => {
    const p = new PatDetector()
    const out = [100, 102, 100, 102, 100, 102, 100].map((x, i) => p.move(x, i * 50))
    expect(out.every((x) => x === null)).toBe(true)
  })

  it('needs the strokes close together', () => {
    const p = new PatDetector()
    const out = [100, 130, 100, 130, 100].map((x, i) => p.move(x, i * 2000))
    expect(out.every((x) => x === null)).toBe(true)
  })

  it('carries on as "more" while patting', () => {
    const p = new PatDetector()
    const out = [100, 130, 100, 130, 100, 130, 100, 130].map((x, i) => p.move(x, i * 200))
    expect(out).toContain('start')
    expect(out).toContain('more')
  })
})

describe('pokes', () => {
  it('counts clicks in a row', () => {
    const c = new PokeCounter()
    expect(c.click(0)).toBe(1)
    expect(c.click(300)).toBe(2)
    expect(c.click(600)).toBe(3)
    expect(c.count(700)).toBe(3)
    expect(c.click(5000)).toBe(1)
  })
})

const flat = (floor = 20): World => ({ left: 50, right: 1870, top: 1000, ground: () => floor })

describe('drag physics', () => {
  it('falls, bounces, and comes to rest on the ground', () => {
    const b = newBody(500, 800)
    const w = flat()
    const hits = []
    for (let i = 0; i < 400; i++) {
      const hit = fallStep(b, 1 / 60, w)
      if (hit) hits.push(hit)
    }
    expect(hits[0].bounced).toBe(true)
    expect(hits[0].speed).toBeGreaterThan(1500)
    expect(b.y).toBe(20)
    expect(atRest(b, w)).toBe(true)
  })

  it('bounces off the sides when thrown', () => {
    const b = newBody(1800, 300)
    b.vx = 3000
    const w = flat()
    let maxX = 0
    for (let i = 0; i < 200; i++) {
      fallStep(b, 1 / 60, w)
      maxX = Math.max(maxX, b.x)
    }
    expect(maxX).toBeLessThanOrEqual(1870)
    expect(b.x).toBeLessThan(1870)
  })

  it('swings when carried sideways, and hangs still again after', () => {
    const b = newBody(500, 300)
    for (let i = 0; i < 20; i++) holdStep(b, 500 + i * 30, 300, 1 / 60, 130)
    expect(Math.abs(b.angle)).toBeGreaterThan(0.05)
    expect(b.vx).toBeGreaterThan(500)
    for (let i = 0; i < 600; i++) holdStep(b, 1070, 300, 1 / 60, 130)
    expect(Math.abs(b.angle)).toBeLessThan(0.02)
  })

  it('slides off the edge of a window and falls', () => {
    const b = newBody(260, 500)
    const w: World = { ...flat(), ground: (x, from) => (x < 300 && from >= 499 ? 500 : 20) }
    b.vx = 600
    for (let i = 0; i < 300; i++) fallStep(b, 1 / 60, w)
    expect(b.y).toBe(20)
  })
})

const wins: WinRect[] = [
  { id: 1, x: 100, y: 300, width: 500, height: 400 },
  { id: 2, x: 400, y: 200, width: 600, height: 500 }
]

describe('sitting on windows', () => {
  it('lands on the top of the window underneath', () => {
    expect(surfaceAt(250, 0, wins, 1040, 150)).toEqual({ y: 300, id: 1 })
    expect(surfaceAt(800, 0, wins, 1040, 150)).toEqual({ y: 200, id: 2 })
  })

  it('skips a top edge hidden behind a window in front', () => {
    const front: WinRect[] = [
      { id: 3, x: 0, y: 250, width: 500, height: 400 },
      { id: 1, x: 100, y: 300, width: 500, height: 400 }
    ]
    expect(surfaceAt(300, 0, front, 1040, 150)).toEqual({ y: 250, id: 3 })
    expect(surfaceAt(550, 0, front, 1040, 150)).toEqual({ y: 300, id: 1 })
  })

  it('falls past windows above it and too-high windows', () => {
    expect(surfaceAt(800, 250, wins, 1040, 150)).toEqual({ y: 1040, id: null })
    expect(surfaceAt(250, 0, [{ id: 9, x: 0, y: 40, width: 900, height: 900 }], 1040, 150)).toEqual({ y: 1040, id: null })
  })

  it('follows a window that moves, and lets go when it goes', () => {
    const moved = [{ ...wins[0], x: 150, y: 350 }, wins[1]]
    expect(followWindow(1, 250, wins[0], moved, 1040, 150)).toEqual({ x: 300, y: 350 })
    expect(followWindow(1, 250, wins[0], [wins[1]], 1040, 150)).toBeNull()
  })

  it('reads the helper output', () => {
    expect(parseWindows('123,10,20,800,600;456,0,0,1920,1040')).toEqual([
      { id: 123, x: 10, y: 20, width: 800, height: 600 },
      { id: 456, x: 0, y: 0, width: 1920, height: 1040 }
    ])
    expect(parseWindows('')).toEqual([])
  })
})

describe('hats and colours', () => {
  it('starts with a few free and the rest locked', () => {
    expect(HATS.filter((h) => isUnlocked(h, EMPTY_PROGRESS)).map((h) => h.id)).toEqual(['none', 'party', 'bow'])
    expect(COLORS.filter((c) => isUnlocked(c, EMPTY_PROGRESS)).map((c) => c.id)).toEqual(['teal', 'pink'])
  })

  it('wears its own look unless you pick an unlocked one', () => {
    expect(resolveLook('tsundere', 'auto', 'auto', EMPTY_PROGRESS).hat).toBe('bow')
    expect(resolveLook('robotico', 'tophat', 'auto', EMPTY_PROGRESS).hat).toBe('none')
    expect(resolveLook('robotico', 'tophat', 'gold', { ...EMPTY_PROGRESS, wins: 5 })).toMatchObject({ hat: 'tophat', trim: 0xe8b130 })
  })

  it('says what just unlocked', () => {
    expect(newlyUnlocked({ ...EMPTY_PROGRESS, wins: 2 }, { ...EMPTY_PROGRESS, wins: 3 })).toEqual(['the top hat'])
    expect(newlyUnlocked(EMPTY_PROGRESS, EMPTY_PROGRESS)).toEqual([])
    expect(unlockHint({ stat: 'wins', count: 3 })).toBe('Win 3 games against me')
  })
})

describe('speaking up by itself', () => {
  const MIN = 60_000
  const run = (c: Chatter, from: number, to: number, idle: (t: number) => number, game: (t: number) => string | null = () => null, hour = 14) => {
    const out: { t: number; e: ChatterEvent }[] = []
    for (let t = from; t <= to; t += 2000) {
      const e = c.tick(t, { idleSec: idle(t), game: game(t) }, hour, { busy: false, friend: false })
      if (e) out.push({ t, e })
    }
    return out
  }

  it('says nothing at all when off', () => {
    const c = new Chatter('off', seeded(1))
    expect(run(c, 0, 300 * MIN, () => 0, (t) => (t > 50 * MIN ? 'Portal 2' : null), 2)).toEqual([])
  })

  it('nudges you to take a break after a long stretch, rarely', () => {
    const c = new Chatter('rare', seeded(1))
    const out = run(c, 0, 200 * MIN, () => 0)
    const nudges = out.filter((x) => 'moment' in x.e && x.e.moment === 'breakNudge')
    expect(nudges.length).toBeGreaterThanOrEqual(1)
    expect(nudges[0].t).toBeGreaterThanOrEqual(100 * MIN)
    expect(out.length).toBeLessThanOrEqual(3)
  })

  it('welcomes you back after a while away, and falls asleep meanwhile', () => {
    const c = new Chatter('rare', seeded(2))
    const idle = (t: number) => (t > 10 * MIN && t < 40 * MIN ? (t - 10 * MIN) / 1000 : 0)
    let sawAway = false
    for (let t = 0; t <= 45 * MIN; t += 2000) {
      const e = c.tick(t, { idleSec: idle(t), game: null }, 14, { busy: false, friend: false })
      if (c.away) sawAway = true
      if (e && 'moment' in e && e.moment === 'wakeUp') {
        expect(t).toBeGreaterThanOrEqual(40 * MIN)
        expect(sawAway).toBe(true)
        return
      }
    }
    throw new Error('no welcome back')
  })

  it('wishes you luck when a game starts, and asks how it went', () => {
    const c = new Chatter('rare', seeded(3))
    const out = run(c, 0, 60 * MIN, () => 0, (t) => (t > 5 * MIN && t < 50 * MIN ? 'Portal 2' : null))
    const moments = out.map((x) => ('moment' in x.e ? x.e.moment : 'banter'))
    expect(moments).toContain('gameStartNamed')
    expect(moments).toContain('gameEnd')
    expect(out.find((x) => 'moment' in x.e && x.e.moment === 'gameStartNamed')?.e).toMatchObject({ fill: { game: 'Portal 2' } })
  })

  it('waits until it is not busy', () => {
    const c = new Chatter('rare', seeded(3))
    c.tick(0, { idleSec: 0, game: null }, 14, { busy: false, friend: false })
    expect(c.tick(2000, { idleSec: 0, game: 'X' }, 14, { busy: true, friend: false })).toBeNull()
    expect(c.tick(4000, { idleSec: 0, game: 'X' }, 14, { busy: false, friend: false })).toMatchObject({ moment: 'gameStartNamed' })
  })

  it('banters with the friend now and then', () => {
    const c = new Chatter('normal', seeded(4))
    const out: ChatterEvent[] = []
    for (let t = 0; t <= 120 * MIN; t += 2000) {
      const e = c.tick(t, { idleSec: 0, game: null }, 14, { busy: false, friend: true })
      if (e) out.push(e)
    }
    expect(out.some((e) => 'banter' in e)).toBe(true)
  })

  it('reads Steam\'s running game', () => {
    expect(parseRunningAppId('\r\nHKEY_CURRENT_USER\\Software\\Valve\\Steam\r\n    RunningAppID    REG_DWORD    0x26c\r\n')).toBe(620)
    expect(parseRunningAppId('    RunningAppID    REG_DWORD    0x0')).toBe(0)
    expect(parseRunningAppId('')).toBe(0)
  })

  it('counts five minutes without touching the PC as away', () => {
    expect(AWAY_SEC).toBe(300)
  })
})

describe('idle routines', () => {
  it('drums only while you are busy at the PC', () => {
    const rng = seeded(5)
    const base = { onFloor: true, userActive: false, activeForSec: 0, hour: 14, mouseMoving: false }
    const idle = Array.from({ length: 200 }, () => pickRoutine(base, rng))
    expect(idle).not.toContain('drum')
    const busy = Array.from({ length: 200 }, () => pickRoutine({ ...base, userActive: true, activeForSec: 60 }, rng))
    expect(busy).toContain('drum')
  })

  it('stays put on a window', () => {
    const rng = seeded(6)
    const picks = Array.from({ length: 200 }, () =>
      pickRoutine({ onFloor: false, userActive: false, activeForSec: 0, hour: 14, mouseMoving: true }, rng)
    )
    expect(picks).not.toContain('wander')
    expect(picks).not.toContain('peek')
    expect(picks).not.toContain('lookAround')
  })
})

describe('lines', () => {
  it('fills in the blanks and suits the character', () => {
    expect(lifeLine('robotico', 'gameStartNamed', { game: 'Portal 2' }, () => 0).text).toContain('Portal 2')
    expect(lifeLine('tsundere', 'pat').emotion).toBe('flustered')
    expect(lifeLine('robotico', 'pat').emotion).toBe('love')
    expect(greetingFor(8)).toBe('morning')
    expect(greetingFor(14)).toBe('afternoon')
    expect(greetingFor(19)).toBe('evening')
    expect(greetingFor(2)).toBe('night')
  })

  it('has banter for both characters, never the same twice in a row', () => {
    for (const b of BANTER) {
      expect(new Set(b.map((l) => l.who)).size).toBe(2)
    }
    const rng = seeded(7)
    let last = -1
    for (let i = 0; i < 50; i++) {
      const next = pickBanter(last, rng)
      expect(next).not.toBe(last)
      expect(next).toBeLessThan(BANTER.length)
      last = next
    }
  })
})

describe('size', () => {
  it('clamps the slider and shrinks in mini mode', () => {
    expect(characterScale({ size: 1, miniMode: false })).toBe(1)
    expect(characterScale({ size: 3, miniMode: false })).toBe(1.6)
    expect(characterScale({ size: 1.4, miniMode: true })).toBe(0.5)
  })
})
