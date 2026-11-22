// Talks to the speech-recognition worker.

export const STT_MODELS = {
  tiny: 'onnx-community/whisper-tiny.en',
  base: 'onnx-community/whisper-base.en',
  small: 'onnx-community/whisper-small.en'
} as const

export type SttSize = keyof typeof STT_MODELS

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (t: string) => void; reject: (e: Error) => void }>()
let progressCb: ((percent: number) => void) | null = null

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./sttWorker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e) => {
    const m = e.data
    if (m.type === 'progress') progressCb?.(m.percent)
    else if (m.type === 'result') pending.get(m.id)?.resolve(m.text)
    else if (m.type === 'error') pending.get(m.id)?.reject(new Error(friendly(m.message)))
    if (m.id) pending.delete(m.id)
  }
  return worker
}

export function transcribe(audio: Float32Array, size: SttSize, onProgress?: (percent: number) => void): Promise<string> {
  progressCb = onProgress ?? null
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ type: 'transcribe', id, audio, model: STT_MODELS[size] }, [audio.buffer])
  })
}

function friendly(message: string): string {
  if (/fetch|network|ENOTFOUND|ERR_/i.test(message)) {
    return "I couldn't download my speech model. Check your internet (it's only needed the first time)."
  }
  return message
}
