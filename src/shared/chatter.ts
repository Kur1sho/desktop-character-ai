// When the character speaks up on its own: welcome backs, break nudges, games
// starting and ending, late nights, and (on "normal") the odd random thought.
// Rare by default, and "off" turns all of it off.
import type { LifeMoment } from './lifeLines'

export type ChatterLevel = 'off' | 'rare' | 'normal'

export interface Presence {
  /** Seconds since the mouse or keyboard was last used (from Windows; no keys are seen). */
  idleSec: number
  /** The Steam game running, '' if one is running but its name isn't known, null if none. */
  game: string | null
}

export type ChatterEvent = { moment: LifeMoment; fill?: Record<string, string> } | { banter: true }

/** Away from the PC for this long counts as gone: the character falls asleep. */
export const AWAY_SEC = 5 * 60
const MIN = 60_000

const GAP: Record<ChatterLevel, number> = { off: Infinity, rare: 40 * MIN, normal: 10 * MIN }
const BANTER_EVERY: Record<ChatterLevel, [number, number]> = { off: [Infinity, Infinity], rare: [35 * MIN, 60 * MIN], normal: [10 * MIN, 20 * MIN] }

export class Chatter {
  private started = -1
  private awaySince: number | null = null
  private sessionStart = 0
  private lastNudge = 0
  private lastGeneral = 0
  private lastLateNight = -Infinity
  private nextMusing = 0
  private nextBanter = 0
  private game: string | null = null
  private gameSince = 0
  private pending: { at: number; event: ChatterEvent }[] = []

  constructor(
    public level: ChatterLevel = 'rare',
    private rng: () => number = Math.random
  ) {}

  /** Away from the PC (the character is asleep). */
  get away(): boolean {
    return this.awaySince !== null
  }

  /**
   * Called every few seconds. `busy` means the character is talking, listening or
   * being played with, so anything it wants to say waits a little.
   */
  tick(now: number, p: Presence, hour: number, opts: { busy: boolean; friend: boolean }): ChatterEvent | null {
    if (this.started < 0) {
      this.started = this.sessionStart = this.lastGeneral = this.lastNudge = now
      this.nextMusing = now + this.between(20 * MIN, 40 * MIN)
      this.nextBanter = now + this.between(...BANTER_EVERY[this.level]) / 3
      this.game = p.game
    }
    // Coming and going.
    if (this.awaySince === null && p.idleSec >= AWAY_SEC) this.awaySince = now - p.idleSec * 1000
    else if (this.awaySince !== null && p.idleSec < 5) {
      const gone = now - this.awaySince
      this.awaySince = null
      this.sessionStart = now
      if (gone >= 20 * MIN) this.queue(now, { moment: 'wakeUp' })
    }
    // Games starting and stopping.
    if (p.game !== this.game) {
      if (p.game !== null && this.game === null) {
        this.gameSince = now
        this.queue(now, p.game ? { moment: 'gameStartNamed', fill: { game: p.game } } : { moment: 'gameStart' })
      } else if (p.game === null && now - this.gameSince >= 10 * MIN) {
        this.queue(now, { moment: 'gameEnd' })
      }
      this.game = p.game
    }
    if (this.level === 'off') {
      this.pending = []
      return null
    }
    this.pending = this.pending.filter((x) => now - x.at < 2 * MIN)
    if (opts.busy || this.away) return null
    const first = this.pending.shift()
    if (first) return first.event
    if (this.game !== null) return null

    const general = (e: ChatterEvent): ChatterEvent => {
      this.lastGeneral = now
      return e
    }
    if (now - this.lastGeneral < GAP[this.level]) return null
    if (hour >= 1 && hour < 5 && now - this.lastLateNight > 6 * 60 * MIN && now - this.started > 5 * MIN) {
      this.lastLateNight = now
      return general({ moment: 'lateNight' })
    }
    if (now - this.sessionStart >= 100 * MIN && now - this.lastNudge >= 60 * MIN) {
      this.lastNudge = now
      return general({ moment: 'breakNudge' })
    }
    if (opts.friend && now >= this.nextBanter) {
      this.nextBanter = now + this.between(...BANTER_EVERY[this.level])
      return general({ banter: true })
    }
    if (this.level === 'normal' && now >= this.nextMusing) {
      this.nextMusing = now + this.between(20 * MIN, 40 * MIN)
      return general({ moment: 'musing' })
    }
    return null
  }

  private queue(now: number, event: ChatterEvent): void {
    this.pending.push({ at: now, event })
  }

  private between(a: number, b: number): number {
    return a + (b - a) * this.rng()
  }
}

/** Steam's running game, from `reg query HKCU\\Software\\Valve\\Steam /v RunningAppID` (0 for none). */
export function parseRunningAppId(out: string): number {
  const m = /RunningAppID\s+REG_DWORD\s+0x([0-9a-f]+)/i.exec(out)
  return m ? parseInt(m[1], 16) : 0
}
