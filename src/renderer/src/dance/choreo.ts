// The choreographer: works out the mood of the song and picks dance moves to
// match, changing every 8 beats so it always moves with the music.
//
// Mood comes from things that don't depend on the volume: tempo, how many drum
// hits there are, and how bright the sound is (lots of treble = energetic).
// Every move is a function of "beats since the move started", so it lands on
// the beat. Pure maths, so it can be tested and previewed without audio.

export type Mood = 'chill' | 'groove' | 'hype'
export type Arms = 'pump' | 'up' | 'out' | 'low'

/** Where the character is and how it's turned, relative to its spot, in pixels and radians. */
export interface Pose {
  x: number
  y: number
  /** Forward/back flip. */
  rotX: number
  /** Spin. */
  rotY: number
  /** Cartwheel / lean. */
  rotZ: number
  arms: Arms
}

export interface MoveSpec {
  name: string
  mood: Mood
  /** b = beats since the move started (with fractions); size = character height in px. */
  pose(b: number, size: number, intensity: number): Pose
}

const TAU = Math.PI * 2
const still: Pose = { x: 0, y: 0, rotX: 0, rotY: 0, rotZ: 0, arms: 'pump' }
/** 1 on the beat, falling to 0 just before the next. */
const hit = (b: number) => Math.pow(1 - (b - Math.floor(b)), 2)
/** A hop that leaves the ground on the beat and lands on the next. */
const hop = (b: number) => Math.sin(Math.PI * (b - Math.floor(b)))
const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))

export const MOVES: MoveSpec[] = [
  // --- Slow, moody songs ---
  {
    name: 'sway',
    mood: 'chill',
    pose: (b, s) => ({ ...still, x: Math.sin((b * Math.PI) / 2) * s * 0.06, rotZ: Math.sin((b * Math.PI) / 2) * 0.1, arms: 'low' })
  },
  {
    name: 'float',
    mood: 'chill',
    pose: (b, s) => ({
      ...still,
      y: s * (0.08 + 0.04 * Math.sin((b * Math.PI) / 2)),
      rotY: Math.sin((b * Math.PI) / 4) * 0.5,
      arms: 'out'
    })
  },
  {
    name: 'lean',
    mood: 'chill',
    pose: (b) => {
      const side = Math.floor(b / 2) % 2 === 0 ? 1 : -1
      return { ...still, rotZ: side * 0.18 * ease((b % 2) / 0.8), arms: 'low' }
    }
  },
  {
    name: 'slow spin',
    mood: 'chill',
    pose: (b, s) => ({ ...still, y: s * 0.04 * Math.sin((b * Math.PI) / 8), rotY: (TAU * b) / 8, arms: 'out' })
  },
  // --- Mid-tempo grooves ---
  {
    name: 'bounce',
    mood: 'groove',
    pose: (b, s, i) => ({ ...still, y: s * 0.05 * hit(b) * (0.6 + 0.4 * i), rotZ: Math.sin(b * Math.PI) * 0.07 })
  },
  {
    name: 'side step',
    mood: 'groove',
    pose: (b, s) => {
      const side = Math.floor(b) % 2 === 0 ? 1 : -1
      return { ...still, x: side * s * 0.12 * ease((b % 1) / 0.4), y: s * 0.04 * hop(b), rotZ: side * 0.08 }
    }
  },
  {
    name: 'shimmy',
    mood: 'groove',
    pose: (b, s) => ({ ...still, y: s * 0.02 * hit(b * 2), rotY: Math.sin(b * TAU) * 0.35, arms: 'out' })
  },
  {
    name: 'spin',
    mood: 'groove',
    pose: (b, s) => ({ ...still, y: s * 0.04 * hit(b), rotY: TAU * ease((b - 6) / 2) })
  },
  {
    name: 'moonwalk',
    mood: 'groove',
    pose: (b, s) => {
      const t = b % 4
      const slide = t < 3 ? t / 3 : 1 - (t - 3)
      return { ...still, x: -s * 0.35 * slide, y: s * 0.02 * hit(b), rotY: -0.5, arms: 'low' }
    }
  },
  // --- High-energy bangers ---
  {
    name: 'jumps',
    mood: 'hype',
    pose: (b, s, i) => ({ ...still, y: s * (0.15 + 0.15 * i) * hop(b), rotZ: Math.sin(b * Math.PI) * 0.1, arms: 'up' })
  },
  {
    name: 'backflip',
    mood: 'hype',
    pose: (b, s) => {
      // Two backflips per phrase, then bounce.
      const t = b % 4
      if (t < 2) return { ...still, y: s * 0.55 * Math.sin((Math.PI * t) / 2), rotX: -TAU * ease(t / 2), arms: 'up' }
      return { ...still, y: s * 0.05 * hit(b), arms: 'pump' }
    }
  },
  {
    name: 'side flip',
    mood: 'hype',
    pose: (b, s) => {
      const t = b % 4
      const dir = Math.floor(b / 4) % 2 === 0 ? 1 : -1
      if (t < 2) {
        return { ...still, x: dir * s * 0.3 * ease(t / 2), y: s * 0.5 * Math.sin((Math.PI * t) / 2), rotZ: -dir * TAU * ease(t / 2), arms: 'out' }
      }
      return { ...still, x: dir * s * 0.3 * (1 - ease((t - 2) / 2)), y: s * 0.05 * hit(b), arms: 'pump' }
    }
  },
  {
    name: 'headspin',
    mood: 'hype',
    pose: (b, s) => {
      // Flip upside down, spin on the head, flip back.
      const into = ease(b / 1)
      const out = ease((b - 7) / 1)
      const upside = Math.PI * (into - out)
      return { ...still, y: s * 0.1 * Math.sin(Math.PI * into) + s * 0.1 * Math.sin(Math.PI * out), rotZ: upside, rotY: b * Math.PI * 1.5, arms: 'out' }
    }
  },
  {
    name: 'windmill',
    mood: 'hype',
    pose: (b, s) => ({ ...still, y: s * 0.1, rotZ: (TAU * b) / 2, rotY: Math.sin(b * Math.PI) * 0.4, arms: 'out' })
  },
  {
    name: 'fly',
    mood: 'hype',
    pose: (b, s) => {
      // Loop up and around the desk, leaning into the turns.
      const a = (TAU * b) / 8
      return {
        ...still,
        x: -s * 1.2 * Math.sin(a) - s * 0.2 * Math.sin(2 * a),
        y: s * (0.5 + 0.35 * Math.sin(2 * a)) * ease(b / 1) * (1 - ease((b - 7) / 1)),
        rotZ: -Math.cos(a) * 0.4,
        rotY: Math.sin(a) * 0.6,
        arms: 'out'
      }
    }
  }
]

const BEATS_PER_MOVE = 8

/**
 * Beat trackers often lock onto every other kick and report half the real
 * tempo (a 150 BPM banger heard as 75). If drum hits come clearly faster than
 * that, the song is really twice as fast.
 */
export function feltTempo(bpm: number, hitsPerSecond: number): number {
  return bpm < 100 && hitsPerSecond > (bpm / 60) * 1.6 ? bpm * 2 : bpm
}

/** Turns the music's features into a mood, slowly, so it doesn't flicker. */
export class MoodTracker {
  private onsets: number[] = []
  private brightness = 0
  private score = 0.5
  mood: Mood = 'groove'

  /** Feed one frame: time (ms), whether there was a drum hit, the tempo and the sound's brightness (Hz). */
  push(t: number, onset: boolean, bpm: number | null, centroidHz: number): Mood {
    if (onset) this.onsets.push(t)
    while (this.onsets.length && this.onsets[0] < t - 6000) this.onsets.shift()
    this.brightness += (centroidHz - this.brightness) * 0.02
    const rate = this.onsets.length / 6 // hits per second
    const norm = (v: number, lo: number, hi: number) => Math.min(1, Math.max(0, (v - lo) / (hi - lo)))
    const target = 0.4 * norm(feltTempo(bpm ?? 100, rate), 75, 150) + 0.35 * norm(rate, 0.6, 3.5) + 0.25 * norm(this.brightness, 900, 3200)
    this.score += (target - this.score) * 0.01
    // Hysteresis: needs to be clearly in a band to switch.
    if (this.mood !== 'hype' && this.score > 0.64) this.mood = 'hype'
    else if (this.mood !== 'chill' && this.score < 0.36) this.mood = 'chill'
    else if (this.mood === 'hype' && this.score < 0.56) this.mood = 'groove'
    else if (this.mood === 'chill' && this.score > 0.44) this.mood = 'groove'
    return this.mood
  }

  get energy(): number {
    return this.score
  }
}

/** Picks a move for each 8-beat phrase to suit the mood, never the same one twice in a row. */
export class Choreographer {
  private move: MoveSpec = MOVES.find((m) => m.name === 'bounce')!
  private startBeat = 0
  private rand: () => number

  constructor(rand: () => number = Math.random) {
    this.rand = rand
  }

  get current(): string {
    return this.move.name
  }

  /** The pose for this frame. `beat` is the beat count plus phase (e.g. 12.25). */
  pose(beat: number, mood: Mood, size: number, intensity: number): Pose {
    if (beat - this.startBeat >= BEATS_PER_MOVE || (this.move.mood !== mood && beat - this.startBeat >= 4)) {
      this.startBeat = Math.floor(beat)
      const options = MOVES.filter((m) => m.mood === mood && m.name !== this.move.name)
      this.move = options[Math.floor(this.rand() * options.length)] ?? this.move
    }
    return this.move.pose(beat - this.startBeat, size, intensity)
  }
}

/** Moves an angle toward a target the short way round, so flips don't unwind backwards. */
export function approachAngle(current: number, target: number, k: number): number {
  let d = (target - current) % TAU
  if (d > Math.PI) d -= TAU
  if (d < -Math.PI) d += TAU
  return current + d * k
}
