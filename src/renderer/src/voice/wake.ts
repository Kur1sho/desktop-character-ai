// Always-on "Hey <name>" listening. Everything happens on this PC: short
// phrases are cut from the mic stream, transcribed locally, and checked for
// the character's name. Nothing is recorded or kept.
import { rms } from './vad'
import { Segmenter } from './segmenter'
import { transcribe, type SttSize } from './stt'
import { matchWakeWord } from './wakeMatch'

export interface WakeOptions {
  name: () => string
  sttSize: () => SttSize
  /** True while the app is busy (listening for a command, thinking, talking). */
  isBusy: () => boolean
  onWake: (rest: string) => void
  onError?: (err: Error) => void
}

const SAMPLE_RATE = 16000
const FRAME = 1024

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
  let transcribing = false
  stopFn = () => {
    stopped = true
  }

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
    })
  } catch (err) {
    stopFn = null
    opts.onError?.(err instanceof Error ? err : new Error(String(err)))
    return
  }
  if (stopped) {
    stream.getTracks().forEach((t) => t.stop())
    return
  }

  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
  const source = ctx.createMediaStreamSource(stream)
  const proc = ctx.createScriptProcessor(FRAME, 1, 1)
  const frameMs = (FRAME / SAMPLE_RATE) * 1000
  let seg = new Segmenter()

  stopFn = () => {
    stopped = true
    proc.disconnect()
    source.disconnect()
    stream.getTracks().forEach((t) => t.stop())
    void ctx.close()
  }

  proc.onaudioprocess = (e) => {
    if (stopped) return
    if (opts.isBusy() || transcribing) {
      seg = new Segmenter() // start fresh after being busy
      return
    }
    const data = new Float32Array(e.inputBuffer.getChannelData(0))
    const phrase = seg.push(data, rms(data), frameMs)
    if (!phrase) return
    transcribing = true
    transcribe(phrase, opts.sttSize())
      .then((text) => {
        if (stopped || opts.isBusy()) return
        const m = matchWakeWord(text, opts.name())
        if (m.matched) opts.onWake(m.rest)
      })
      .catch((err) => opts.onError?.(err instanceof Error ? err : new Error(String(err))))
      .finally(() => {
        transcribing = false
      })
  }
  source.connect(proc)
  proc.connect(ctx.destination)
}
