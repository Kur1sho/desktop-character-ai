// Little things Robotico and Suzu do together when "Bring a friend" is on: some
// sweet (holding hands, a head pat, leaning on each other) and some robot-ish
// (a reboot, syncing antennas, chatting in beeps). Only when they're side by side.
import type { Emotion } from './personas'

export type Duo = 'holdHands' | 'heart' | 'headPat' | 'lean' | 'boop' | 'reboot' | 'sync' | 'beeps' | 'charge'

export type DuoPose = 'hold' | 'heart' | 'pat' | 'lean' | 'boop' | 'antenna' | 'beep' | 'glitch'

/** Who does it, by persona: Robotico, Suzu, or both. */
export type DuoWho = 'robotico' | 'tsundere' | 'both'

export interface DuoBeat {
  /** Seconds from the start. */
  at: number
  who: DuoWho
  /** Start a pose (null ends it). */
  pose?: DuoPose | null
  feel?: Emotion
  emote?: string
}

export interface DuoPlan {
  seconds: number
  /** How close they stand, as a share of the usual gap. */
  close: number
  /** Cute ones are picked more often than the robot ones. */
  weight: number
  beats: DuoBeat[]
}

export const DUOS: Record<Duo, DuoPlan> = {
  holdHands: {
    seconds: 6,
    close: 0.9,
    weight: 3,
    beats: [
      { at: 0, who: 'both', pose: 'hold' },
      { at: 0.4, who: 'tsundere', feel: 'dreamy' },
      { at: 0.6, who: 'robotico', feel: 'happy' },
      { at: 1.2, who: 'tsundere', emote: '💕' }
    ]
  },
  heart: {
    seconds: 4.5,
    close: 0.75,
    weight: 2,
    beats: [
      { at: 0, who: 'both', pose: 'heart' },
      { at: 0.7, who: 'both', feel: 'love' },
      { at: 0.9, who: 'robotico', emote: '❤️' },
      { at: 1.1, who: 'tsundere', emote: '❤️' }
    ]
  },
  headPat: {
    seconds: 4.5,
    close: 0.8,
    weight: 3,
    beats: [
      { at: 0, who: 'robotico', pose: 'pat', feel: 'smug' },
      { at: 0.4, who: 'tsundere', feel: 'flustered' },
      { at: 2, who: 'tsundere', feel: 'dreamy', emote: '💗' }
    ]
  },
  lean: {
    seconds: 7,
    close: 0.78,
    weight: 2,
    beats: [
      { at: 0, who: 'tsundere', pose: 'lean', feel: 'dreamy' },
      { at: 1.2, who: 'robotico', pose: 'lean', feel: 'happy' },
      { at: 2, who: 'tsundere', emote: '💞' }
    ]
  },
  boop: {
    seconds: 3.5,
    close: 0.8,
    weight: 2,
    beats: [
      { at: 0, who: 'tsundere', pose: 'boop' },
      { at: 0.35, who: 'robotico', feel: 'surprised' },
      { at: 0.6, who: 'tsundere', pose: null, feel: 'laughing' },
      { at: 1.4, who: 'robotico', feel: 'love', emote: '💘' },
      { at: 2.2, who: 'tsundere', feel: 'dreamy' }
    ]
  },
  reboot: {
    seconds: 6.5,
    close: 0.9,
    weight: 1.5,
    beats: [
      { at: 0, who: 'robotico', pose: 'glitch', emote: '⚠️' },
      { at: 0.6, who: 'tsundere', feel: 'scared' },
      { at: 2.2, who: 'tsundere', pose: 'boop' },
      { at: 2.7, who: 'tsundere', pose: null },
      { at: 2.7, who: 'robotico', pose: null, feel: 'sleepy', emote: '🔄' },
      { at: 3.6, who: 'robotico', feel: 'excited' },
      { at: 4.2, who: 'tsundere', feel: 'dreamy', emote: '💕' }
    ]
  },
  sync: {
    seconds: 4.5,
    close: 0.85,
    weight: 1.5,
    beats: [
      { at: 0, who: 'both', pose: 'antenna' },
      { at: 0.4, who: 'robotico', emote: '📶' },
      { at: 1.3, who: 'tsundere', emote: '⚡' },
      { at: 1.5, who: 'both', feel: 'excited' },
      { at: 3, who: 'tsundere', feel: 'dreamy' }
    ]
  },
  beeps: {
    seconds: 4.5,
    close: 1,
    weight: 1.5,
    beats: [
      { at: 0, who: 'robotico', pose: 'beep', emote: '🤖' },
      { at: 1.4, who: 'robotico', pose: null },
      { at: 1.5, who: 'tsundere', pose: 'beep', emote: '💬' },
      { at: 2.9, who: 'tsundere', pose: null },
      { at: 3, who: 'both', feel: 'laughing' }
    ]
  },
  charge: {
    seconds: 5,
    close: 0.9,
    weight: 1.5,
    beats: [
      { at: 0, who: 'both', pose: 'hold' },
      { at: 0.5, who: 'tsundere', emote: '🪫' },
      { at: 1.6, who: 'robotico', emote: '⚡' },
      { at: 2.6, who: 'tsundere', feel: 'excited', emote: '🔋' },
      { at: 3.4, who: 'tsundere', feel: 'dreamy' }
    ]
  }
}

/** Picks one, weighted, and not the same as last time. */
export function pickDuo(last: Duo | null, rng: () => number = Math.random): Duo {
  const options = (Object.keys(DUOS) as Duo[]).filter((d) => d !== last)
  const total = options.reduce((a, d) => a + DUOS[d].weight, 0)
  let r = rng() * total
  for (const d of options) if ((r -= DUOS[d].weight) < 0) return d
  return options[options.length - 1]
}

/** The beats that happen between two moments (from exclusive, to inclusive; the first frame includes 0). */
export function beatsBetween(plan: DuoPlan, from: number, to: number): DuoBeat[] {
  return plan.beats.filter((b) => (from < 0 ? b.at >= 0 : b.at > from) && b.at <= to)
}

/** Whether this persona does the beat. */
export function doesBeat(b: DuoBeat, personaId: string): boolean {
  return b.who === 'both' || b.who === personaId
}

/** The face it settles back to: Suzu goes all dreamy-eyed when Robotico's around. */
export function restingFor(personaId: string, resting: Emotion, withFriend: boolean): Emotion {
  return withFriend && personaId === 'tsundere' ? 'dreamy' : resting
}
