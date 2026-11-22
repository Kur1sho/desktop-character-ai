// Records one spoken request from the microphone at 16 kHz (what Whisper
// expects), stopping automatically when the user goes quiet.
import { rms, Vad, type VadResult } from './vad'

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

export function listen(onLevel?: (level: number, state: VadResult) => void): Listening {
  let cancel = () => {}
  const result = new Promise<ListenResult>((resolve, reject) => {
    let finished = false
    const chunks: Float32Array[] = []
    const vad = new Vad()
    let stream: MediaStream | null = null
    let ctx: AudioContext | null = null

    const finish = (reason: ListenResult['reason']) => {
      if (finished) return
      finished = true
      stream?.getTracks().forEach((t) => t.stop())
      void ctx?.close()
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

    navigator.mediaDevices
      .getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
      .then((s) => {
        if (finished) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
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
          onLevel?.(level, state)
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
