// Talks to the speech-recognition workers. There are two, so each keeps its
// model loaded: a tiny, fast one for the wake word and the chosen size for
// commands.

export const STT_MODELS = {
  tiny: 'onnx-community/whisper-tiny.en',
  base: 'onnx-community/whisper-base.en',
  small: 'onnx-community/whisper-small.en'
} as const

export type SttSize = keyof typeof STT_MODELS
export type SttRole = 'command' | 'wake'

interface WorkerState {
  worker: Worker
  pending: Map<number, { resolve: (t: string) => void; reject: (e: Error) => void }>
  progress: ((percent: number) => void) | null
  /** Waiting for a 'load' to finish. */
  loads: { resolve: () => void; reject: (e: Error) => void }[]
}

const workers = new Map<SttRole, WorkerState>()
let nextId = 1

function getWorker(role: SttRole): WorkerState {
  const existing = workers.get(role)
  if (existing) return existing
  const state: WorkerState = {
    worker: new Worker(new URL('./sttWorker.ts', import.meta.url), { type: 'module' }),
    pending: new Map(),
    progress: null,
    loads: []
  }
  state.worker.onmessage = (e) => {
    const m = e.data
    if (m.type === 'progress') state.progress?.(m.percent)
    else if (m.type === 'result') state.pending.get(m.id)?.resolve(m.text)
    else if (m.type === 'ready') state.loads.splice(0).forEach((l) => l.resolve())
    else if (m.type === 'error' && m.id) state.pending.get(m.id)?.reject(new Error(friendly(m.message)))
    else if (m.type === 'error') state.loads.splice(0).forEach((l) => l.reject(new Error(friendly(m.message))))
    if (m.id) state.pending.delete(m.id)
  }
  workers.set(role, state)
  return state
}

/** Loads a model ahead of time so the first transcription is fast. Resolves once it's ready. */
export function preloadStt(
  size: SttSize,
  role: SttRole = 'command',
  onProgress?: (percent: number) => void
): Promise<void> {
  const state = getWorker(role)
  if (onProgress) state.progress = onProgress
  return new Promise((resolve, reject) => {
    state.loads.push({ resolve, reject })
    state.worker.postMessage({ type: 'load', model: STT_MODELS[size] })
  })
}

export function transcribe(
  audio: Float32Array,
  size: SttSize,
  onProgress?: (percent: number) => void,
  role: SttRole = 'command'
): Promise<string> {
  const state = getWorker(role)
  state.progress = onProgress ?? null
  const id = nextId++
  return new Promise((resolve, reject) => {
    state.pending.set(id, { resolve, reject })
    state.worker.postMessage({ type: 'transcribe', id, audio, model: STT_MODELS[size] }, [audio.buffer])
  })
}

function friendly(message: string): string {
  if (/fetch|network|ENOTFOUND|ERR_/i.test(message)) {
    return "I couldn't download my speech model. Check your internet (it's only needed the first time)."
  }
  return message
}
