// Finds the beat in music from the loudness of the bass, frame by frame.
//
// 1. Onsets: the bass suddenly gets much louder than it has been lately (a kick drum).
// 2. Tempo: the gaps between onsets are collected, folded into a normal dance
//    range (70 to 180 BPM) and the most common one wins.
// 3. Beat clock: beats tick along at that tempo, nudged toward real onsets, so
//    the dancing stays on the beat even through quiet bars.
// Pure maths, no audio code, so it can be tested with made-up signals.

export interface BeatState {
  /** A beat happened on this frame. */
  beat: boolean
  /** A drum hit was heard on this frame (for how busy the music is). */
  onset: boolean
  /** How far through the current beat, 0 (on the beat) to 1 (just before the next). */
  phase: number
  /** Beats counted since music started, for alternating moves. */
  count: number
  /** Current tempo estimate, or null until there's enough music to tell. */
  bpm: number | null
  /** How loud the music is right now, 0 to 1 (relative to recent peaks). */
  intensity: number
  /** Milliseconds since anything was playing (0 while music plays). */
  silentForMs: number
}

const HISTORY_MS = 1500
const ONSET_WINDOW_MS = 8000
const MIN_GAP_MS = 250
const MIN_BPM = 70
const MAX_BPM = 180
const SILENCE_LEVEL = 1e-4

/** Brings any beat gap into the dance range by doubling or halving it. */
export function foldBpm(bpm: number): number {
  let b = bpm
  while (b < MIN_BPM) b *= 2
  while (b > MAX_BPM) b /= 2
  return b
}

/** How likely a tempo is in dance music: highest at 120, halving about every octave and a half. */
function prior(bpm: number): number {
  const octaves = Math.log2(bpm / 120)
  return Math.exp(-0.5 * (octaves / 0.6) ** 2)
}

/** The most common tempo in a list of onset times (ms), or null. */
export function estimateBpm(onsets: number[]): number | null {
  if (onsets.length < 4) return null
  const votes = new Float64Array(MAX_BPM + 2)
  for (let i = 0; i < onsets.length; i++) {
    for (let j = i + 1; j < onsets.length && j <= i + 4; j++) {
      const gap = onsets[j] - onsets[i]
      if (gap < MIN_GAP_MS || gap > 2000) continue
      const bpm = foldBpm(60000 / gap)
      // Closer neighbours count more, and tempos near 120 are likelier: without
      // that, a 150 BPM song whose every-other-kick gaps say "75" reads as slow.
      const weight = prior(bpm) / (j - i)
      // Spread each vote over nearby tempos, wider for fast ones, since the same
      // timing wobble moves a fast tempo further.
      const b = Math.round(bpm)
      const w = Math.max(2, Math.round(bpm * 0.03))
      for (let d = -w; d <= w; d++) {
        const k = b + d
        if (k >= MIN_BPM && k <= MAX_BPM) votes[k] += weight * (1 - Math.abs(d) / (w + 1))
      }
    }
  }
  let best = 0
  let bestVotes = 0
  for (let k = MIN_BPM; k <= MAX_BPM; k++) {
    if (votes[k] > bestVotes) {
      bestVotes = votes[k]
      best = k
    }
  }
  return bestVotes > 0 ? best : null
}

export class BeatTracker {
  private history: { t: number; e: number }[] = []
  private onsets: number[] = []
  private lastOnset = -Infinity
  private prevEnergy = 0
  private bpm: number | null = null
  private nextBeat = 0
  private count = 0
  private peak = 1e-6
  private level = 0
  private lastLoud = -Infinity
  private started = -1

  /** Feed the bass energy for one frame at time `t` (ms). */
  push(energy: number, t: number): BeatState {
    if (this.started < 0) this.started = t
    // Recent loudness, for the onset threshold.
    this.history.push({ t, e: energy })
    while (this.history.length && this.history[0].t < t - HISTORY_MS) this.history.shift()
    const n = this.history.length
    const mean = this.history.reduce((s, h) => s + h.e, 0) / n
    const sd = Math.sqrt(this.history.reduce((s, h) => s + (h.e - mean) ** 2, 0) / n)

    this.peak = Math.max(energy, this.peak * 0.9995)
    this.level += (energy / this.peak - this.level) * 0.2
    if (energy > SILENCE_LEVEL) this.lastLoud = t

    const rising = energy > this.prevEnergy
    this.prevEnergy = energy
    const onset =
      n > 10 && rising && energy > SILENCE_LEVEL && energy > mean + 1.3 * sd && t - this.lastOnset >= MIN_GAP_MS
    if (onset) {
      this.lastOnset = t
      this.onsets.push(t)
      while (this.onsets.length && this.onsets[0] < t - ONSET_WINDOW_MS) this.onsets.shift()
      const est = estimateBpm(this.onsets)
      if (est) this.bpm = this.bpm === null ? est : this.bpm + (est - this.bpm) * 0.25
    }

    let beat = false
    let phase = 0
    if (this.bpm !== null) {
      const period = 60000 / this.bpm
      if (this.nextBeat === 0) this.nextBeat = onset ? t : t + period
      // A real onset close to where a beat should be pulls the clock onto it.
      if (onset) {
        const early = this.nextBeat - t // onset came before the expected beat
        const late = t - (this.nextBeat - period) // onset came after the last expected beat
        if (early < late) this.nextBeat -= early * 0.5
        else this.nextBeat += late * 0.5
      }
      if (t >= this.nextBeat) {
        beat = true
        this.count++
        while (this.nextBeat <= t) this.nextBeat += period
      }
      phase = Math.min(1, Math.max(0, 1 - (this.nextBeat - t) / period))
    }

    const silentForMs = t - (Number.isFinite(this.lastLoud) ? this.lastLoud : this.started)
    return { beat, onset, phase, count: this.count, bpm: this.bpm, intensity: Math.min(1, this.level), silentForMs }
  }
}
