// Splits a continuous microphone stream into short spoken phrases, for the
// always-on wake word. Keeps a little audio from before each phrase so the
// first syllable isn't cut off.

import { SPEECH_OFF, SPEECH_ON } from './speechThresholds'

const RATIO = 3
const MIN_THRESHOLD = 0.006
const MAX_THRESHOLD = 0.03

export interface SegmenterOptions {
  endSilenceMs?: number
  minSpeechMs?: number
  maxPhraseMs?: number
  preRollMs?: number
}

export class Segmenter {
  private readonly o: Required<SegmenterOptions>
  private noise = Infinity
  private isActive = false
  private loudFor = 0
  private quietFor = 0
  private phraseMs = 0
  private preRoll: Float32Array[] = []
  private preRollMs = 0
  private phrase: Float32Array[] = []

  constructor(opts: SegmenterOptions = {}) {
    this.o = { endSilenceMs: 700, minSpeechMs: 250, maxPhraseMs: 6000, preRollMs: 400, ...opts }
  }

  get threshold(): number {
    const base = Number.isFinite(this.noise) ? this.noise * RATIO : MIN_THRESHOLD
    return Math.min(MAX_THRESHOLD, Math.max(MIN_THRESHOLD, base))
  }

  /** True while a phrase is being collected. */
  get active(): boolean {
    return this.isActive
  }

  /** Length of the phrase so far, in ms (including pre-roll). */
  get currentMs(): number {
    return this.isActive ? this.phraseMs : 0
  }

  /** A copy of the phrase collected so far, for early checks while still talking. */
  snapshot(): Float32Array | null {
    return this.isActive ? concat(this.phrase) : null
  }

  /** Feed one frame. Returns a finished phrase, or null. */
  push(samples: Float32Array, rms: number, frameMs: number, speech?: number): Float32Array | null {
    this.noise = rms < this.noise ? rms : this.noise * (1 + 0.0002 * frameMs)
    // With the speech detector, only a voice counts, not typing or other noise.
    const loud =
      speech === undefined ? rms > this.threshold : speech > (this.isActive ? SPEECH_OFF : SPEECH_ON)

    if (!this.isActive) {
      this.preRoll.push(samples)
      this.preRollMs += frameMs
      while (this.preRollMs > this.o.preRollMs && this.preRoll.length > 1) {
        this.preRoll.shift()
        this.preRollMs -= frameMs
      }
      this.loudFor = loud ? this.loudFor + frameMs : 0
      if (this.loudFor >= this.o.minSpeechMs) {
        this.isActive = true
        this.phrase = [...this.preRoll]
        this.phraseMs = this.preRollMs
        this.quietFor = 0
        this.preRoll = []
        this.preRollMs = 0
      }
      return null
    }

    this.phrase.push(samples)
    this.phraseMs += frameMs
    this.quietFor = loud ? 0 : this.quietFor + frameMs
    if (this.quietFor >= this.o.endSilenceMs || this.phraseMs >= this.o.maxPhraseMs) {
      const out = concat(this.phrase)
      this.isActive = false
      this.phrase = []
      this.loudFor = 0
      return out
    }
    return null
  }
}

function concat(chunks: Float32Array[]): Float32Array {
  const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0))
  let o = 0
  for (const c of chunks) {
    out.set(c, o)
    o += c.length
  }
  return out
}
