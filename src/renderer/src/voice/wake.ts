// Always-on "Hey <name>" listening. Everything happens on this PC: short
// phrases are cut from the mic stream, transcribed locally, and checked for
// the character's name. Nothing is recorded or kept.
//
// To feel instant it doesn't wait for the user to stop talking: while a phrase
// is still going it is checked every few hundred milliseconds with the tiny
// model, so the character reacts right after the name is said.
import { rms } from './vad'
import { Segmenter } from './segmenter'
import { transcribe } from './stt'
import { matchWakeWord } from './wakeMatch'
import { acquireMic, releaseMic } from './mic'
import { createSpeechDetector, SPEECH_FRAME } from './speechDetector'

export interface WakeOptions {
  name: () => string
  /** True while the app is busy (listening for a command, thinking, talking). */
  isBusy: () => boolean
  /**
   * Called when the name is heard. `rest` is what followed it in the same
   * phrase. `audio` is everything heard so far when the user may still be
   * talking (so command listening can carry straight on), or null when the
   * phrase had already ended.
   */
  onWake: (rest: string, audio: Float32Array | null) => void
  onError?: (err: Error) => void
}

const SAMPLE_RATE = 16000
const FRAME = SPEECH_FRAME // 32 ms
/** Start checking a phrase this early... */
const FIRST_CHECK_MS = 700
/** ...and again this often while it continues. */
const CHECK_EVERY_MS = 350
/** The name is in the first couple of seconds, so stop early checks after this. */
const LAST_CHECK_MS = 3000

let stopFn: (() => void) | null = null

export function isWakeRunning(): boolean {
  return stopFn !== null
}

export function stopWake(): void {
  stopFn?.()
  stopFn = null
}

export async function startWake(opts: WakeOptions): Promise<void> {
  if (stopFn) return
  let stopped = false
  stopFn = () => {
    stopped = true
  }

  let stream: MediaStream
  try {
    stream = await acquireMic()
  } catch (err) {
    stopFn = null
    opts.onError?.(err instanceof Error ? err : new Error(String(err)))
    return
  }
  if (stopped) {
    releaseMic()
    return
  }

  const detector = await createSpeechDetector()
  if (stopped) {
    releaseMic()
    return
  }
  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
  const source = ctx.createMediaStreamSource(stream)
  const proc = ctx.createScriptProcessor(FRAME, 1, 1)
  const frameMs = (FRAME / SAMPLE_RATE) * 1000
  const newSegmenter = () => new Segmenter({ endSilenceMs: 400, minSpeechMs: 200 })
  let seg = newSegmenter()
  let busy = false // a transcription is running
  let nextCheckAt = FIRST_CHECK_MS
  let fired = false // already woke up for the current phrase
  let pendingFinal: Float32Array | null = null // a phrase that ended mid-check

  stopFn = () => {
    stopped = true
    proc.disconnect()
    source.disconnect()
    void ctx.close()
    releaseMic()
  }

  const fail = (err: unknown) => opts.onError?.(err instanceof Error ? err : new Error(String(err)))

  const check = (audio: Float32Array, final: boolean) => {
    busy = true
    transcribe(audio, 'tiny', undefined, 'wake')
      .then((text) => {
        if (stopped || fired || opts.isBusy()) return
        const m = matchWakeWord(text, opts.name())
        if (!m.matched) return
        fired = true
        // Hand over everything heard up to now, not just what was checked.
        opts.onWake(m.rest, final ? null : (seg.snapshot() ?? null))
      })
      .catch(fail)
      .finally(() => {
        busy = false
        const next = pendingFinal
        pendingFinal = null
        if (next && !stopped && !opts.isBusy()) check(next, true)
      })
  }

  proc.onaudioprocess = (e) => {
    if (stopped) return
    if (opts.isBusy()) {
      seg = newSegmenter() // start fresh after being busy
      detector?.reset()
      nextCheckAt = FIRST_CHECK_MS
      fired = false
      pendingFinal = null
      return
    }
    const data = new Float32Array(e.inputBuffer.getChannelData(0))
    if (!detector) return handle(data)
    detector.process(data).then(
      (speech) => handle(data, speech),
      () => handle(data)
    )
  }

  const handle = (data: Float32Array, speech?: number) => {
    if (stopped || opts.isBusy()) return
    const phrase = seg.push(data, rms(data), frameMs, speech)
    if (phrase) {
      const already = fired
      nextCheckAt = FIRST_CHECK_MS
      fired = false
      if (already) return
      if (busy) pendingFinal = phrase
      else check(phrase, true)
      return
    }
    if (!seg.active || fired || busy) return
    const ms = seg.currentMs
    if (ms >= nextCheckAt && ms <= LAST_CHECK_MS) {
      nextCheckAt = ms + CHECK_EVERY_MS
      const audio = seg.snapshot()
      if (audio) check(audio, false)
    }
  }
  source.connect(proc)
  proc.connect(ctx.destination)
}
