// Talks to the built-in brain worker.

let worker: Worker | null = null
let nextId = 1
const loads: { resolve: () => void; reject: (e: Error) => void }[] = []
const pending = new Map<number, { resolve: (t: string) => void; reject: (e: Error) => void }>()
let progressCb: ((percent: number) => void) | null = null

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./brainWorker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e) => {
    const m = e.data
    if (m.type === 'progress') progressCb?.(m.percent)
    else if (m.type === 'result') pending.get(m.id)?.resolve(m.text)
    else if (m.type === 'ready') loads.splice(0).forEach((l) => l.resolve())
    else if (m.type === 'error') {
      if (m.id) pending.get(m.id)?.reject(new Error(friendly(m.message)))
      else {
        console.error('Built-in brain failed to load:', m.message)
        loads.splice(0).forEach((l) => l.reject(new Error(friendly(m.message))))
      }
    }
    if (m.id) pending.delete(m.id)
  }
  return worker
}

/** Starts downloading and loading the model in the background. Resolves once it's ready. */
export function warmUp(model: string, onProgress?: (percent: number) => void): Promise<void> {
  if (onProgress) progressCb = onProgress
  return new Promise((resolve, reject) => {
    loads.push({ resolve, reject })
    getWorker().postMessage({ type: 'load', model })
  })
}

export function think(
  model: string,
  messages: { role: string; content: string }[],
  onProgress?: (percent: number) => void
): Promise<string> {
  progressCb = onProgress ?? null
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ type: 'generate', id, model, messages })
  })
}

function friendly(message: string): string {
  if (/fetch|network|ENOTFOUND|ERR_/i.test(message)) {
    return "I couldn't download my brain. Check your internet (it's only needed the first time)."
  }
  return message
}
