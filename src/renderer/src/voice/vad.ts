// A small voice-activity detector: decides when the user has started and
// finished talking, from the loudness (RMS) of short audio frames.
//
// The background-noise level is the quietest loudness seen so far (slowly
// creeping up so it can adapt), so it still works when the user starts
// talking the instant they press the hotkey.

export type VadResult = 'waiting' | 'speaking' | 'done' | 'no-speech'

export interface VadOptions {
  /** Silence after speech that ends the recording. */
  endSilenceMs?: number
  /** Give up if nobody speaks for this long. */
  noSpeechTimeoutMs?: number
  /** Hard cap on recording length. */
  maxMs?: number
  /** Speech must last this long to count (filters clicks). */
  minSpeechMs?: number
}

/** Speech must be this many times louder than the background. */
const RATIO = 3
/** Lowest and highest speech thresholds, so quiet mics and noisy rooms both work. */
const MIN_THRESHOLD = 0.005
const MAX_THRESHOLD = 0.03

export class Vad {
  private readonly o: Required<VadOptions>
  private elapsed = 0
  private noise = Infinity
  private loudFor = 0
  private quietFor = 0
  private started = false

  constructor(opts: VadOptions = {}) {
    this.o = { endSilenceMs: 1200, noSpeechTimeoutMs: 8000, maxMs: 20000, minSpeechMs: 150, ...opts }
  }

  /** Current speech threshold, for debugging and level meters. */
  get threshold(): number {
    const base = Number.isFinite(this.noise) ? this.noise * RATIO : MIN_THRESHOLD
    return Math.min(MAX_THRESHOLD, Math.max(MIN_THRESHOLD, base))
  }

  /** Feed one frame. Returns the state after it. */
  push(rms: number, frameMs: number): VadResult {
    this.elapsed += frameMs
    // Track the noise floor: drop instantly to quieter frames, creep up slowly.
    this.noise = rms < this.noise ? rms : this.noise * (1 + 0.0005 * frameMs)

    if (this.elapsed >= this.o.maxMs) return this.started ? 'done' : 'no-speech'

    const loud = rms > this.threshold
    if (loud) {
      this.loudFor += frameMs
      this.quietFor = 0
      if (!this.started && this.loudFor >= this.o.minSpeechMs) this.started = true
    } else {
      this.quietFor += frameMs
      if (!this.started) this.loudFor = 0
    }

    if (!this.started) {
      return this.elapsed >= this.o.noSpeechTimeoutMs ? 'no-speech' : 'waiting'
    }
    return this.quietFor >= this.o.endSilenceMs ? 'done' : 'speaking'
  }
}

/** Root-mean-square loudness of a block of samples. */
export function rms(samples: Float32Array): number {
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  return Math.sqrt(sum / Math.max(1, samples.length))
}
