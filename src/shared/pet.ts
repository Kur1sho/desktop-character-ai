// Head pats and pokes: works out from the mouse what the user is doing to the character.

/**
 * Spots a head pat: the mouse rubbing back and forth over the head, without clicking.
 * Feed it every mouse move over the head; it says when a pat starts and while it goes on.
 */
export class PatDetector {
  private lastX: number | null = null
  private dir = 0
  private travel = 0
  /** Times of the recent changes of direction. */
  private turns: number[] = []
  private pattingUntil = 0

  constructor(
    /** How far the mouse must move each way to count as a stroke, in pixels. */
    private minStroke = 10,
    /** Changes of direction needed, within `windowMs`, to count as a pat. */
    private turnsNeeded = 3,
    private windowMs = 1500
  ) {}

  /** Returns 'start' when a pat begins, 'more' while it carries on, otherwise null. */
  move(x: number, now: number): 'start' | 'more' | null {
    if (this.lastX === null) {
      this.lastX = x
      return null
    }
    const dx = x - this.lastX
    this.lastX = x
    if (dx === 0) return null
    const d = Math.sign(dx)
    if (d === this.dir || this.dir === 0) {
      this.dir = d
      this.travel += Math.abs(dx)
      return null
    }
    // Turned round: it only counts if the stroke before was long enough.
    const counted = this.travel >= this.minStroke
    this.dir = d
    this.travel = Math.abs(dx)
    if (!counted) return null
    this.turns = this.turns.filter((t) => now - t < this.windowMs)
    this.turns.push(now)
    if (this.turns.length < this.turnsNeeded) return null
    const already = now < this.pattingUntil
    this.pattingUntil = now + this.windowMs
    return already ? 'more' : 'start'
  }

  /** The mouse left the head (or a button was pressed). */
  reset(): void {
    this.lastX = null
    this.dir = 0
    this.travel = 0
    this.turns = []
  }

  patting(now: number): boolean {
    return now < this.pattingUntil
  }
}

/** Counts clicks on the character, so a flurry of them reads as poking. */
export class PokeCounter {
  private clicks: number[] = []
  constructor(private windowMs = 2000) {}

  /** Records a click and returns how many there have been in a row (1 for a lone click). */
  click(now: number): number {
    this.clicks = this.clicks.filter((t) => now - t < this.windowMs)
    this.clicks.push(now)
    return this.clicks.length
  }

  /** Clicks in a row so far, without adding one. */
  count(now: number): number {
    return this.clicks.filter((t) => now - t < this.windowMs).length
  }
}
