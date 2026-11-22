// A small voice-activity detector: decides when the user has started and
// finished talking, from the loudness (RMS) of short audio frames.

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
  /** Time at the start used to measure background noise. */
  calibrationMs?: number
}

export class Vad {
  private readonly o: Required<VadOptions>
  private elapsed = 0
  private noiseSum = 0
  private noiseFrames = 0
  private threshold = 0.015
  private loudFor = 0
  private quietFor = 0
  private started = false

  constructor(opts: VadOptions = {}) {
    this.o = {
      endSilenceMs: 1100,
      noSpeechTimeoutMs: 7000,
      maxMs: 20000,
      minSpeechMs: 150,
      calibrationMs: 300,
      ...opts
    }
  }

  /** Feed one frame. Returns the state after it. */
  push(rms: number, frameMs: number): VadResult {
    this.elapsed += frameMs
    if (this.elapsed <= this.o.calibrationMs) {
      this.noiseSum += rms
      this.noiseFrames++
      this.threshold = Math.max(0.012, (this.noiseSum / this.noiseFrames) * 3)
      return 'waiting'
    }
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
