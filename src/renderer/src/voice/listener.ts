// Records one spoken request from the microphone at 16 kHz (what Whisper
// expects), stopping automatically when the user goes quiet.
import { rms, Vad, type VadResult } from './vad'
import { acquireMic, releaseMic } from './mic'

export interface ListenResult {
  audio: Float32Array | null
  reason: 'done' | 'no-speech' | 'cancelled'
}

export interface Listening {
  result: Promise<ListenResult>
  cancel(): void
}

const SAMPLE_RATE = 16000
const FRAME = 1024 // samples per frame, about 64 ms

/**
 * @param preRoll audio already heard (from the wake word) to put in front of
 *   the recording, so a sentence that started with the name isn't cut.
 */
export function listen(
  onLevel?: (level: number, state: VadResult, threshold: number) => void,
  preRoll?: Float32Array | null
): Listening {
  let cancel = () => {}
  const result = new Promise<ListenResult>((resolve, reject) => {
    let finished = false
    const chunks: Float32Array[] = preRoll ? [preRoll] : []
    const vad = new Vad()
    let haveMic = false
    let ctx: AudioContext | null = null

    const finish = (reason: ListenResult['reason']) => {
      if (finished) return
      finished = true
      void ctx?.close()
      if (haveMic) releaseMic()
      if (reason !== 'done') return resolve({ audio: null, reason })
      const total = chunks.reduce((n, c) => n + c.length, 0)
      const audio = new Float32Array(total)
      let offset = 0
      for (const c of chunks) {
        audio.set(c, offset)
        offset += c.length
      }
      resolve({ audio, reason })
    }
    cancel = () => finish('cancelled')

    acquireMic()
      .then((s) => {
        haveMic = true
        if (finished) {
          releaseMic()
          return
        }
        ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
        const source = ctx.createMediaStreamSource(s)
        // ScriptProcessor is old but simple and fine for short recordings.
        const proc = ctx.createScriptProcessor(FRAME, 1, 1)
        const frameMs = (FRAME / SAMPLE_RATE) * 1000
        proc.onaudioprocess = (e) => {
          if (finished) return
          const data = new Float32Array(e.inputBuffer.getChannelData(0))
          chunks.push(data)
          const level = rms(data)
          const state = vad.push(level, frameMs)
          onLevel?.(level, state, vad.threshold)
          if (state === 'done' || state === 'no-speech') finish(state)
        }
        source.connect(proc)
        proc.connect(ctx.destination)
      })
      .catch((err) => {
        finished = true
        reject(new Error(`Microphone unavailable: ${err instanceof Error ? err.message : String(err)}`))
      })
  })
  return { result, cancel: () => cancel() }
}
