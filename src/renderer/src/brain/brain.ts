// Talks to the built-in brain worker.
import { isGpuError } from '@shared/brainModels'

let worker: Worker | null = null
let nextId = 1
const loads: { resolve: () => void; reject: (e: Error) => void }[] = []
interface Pending {
  resolve: (t: string) => void
  reject: (e: Error) => void
  /** The request, so it can be asked again on a fresh worker. */
  request: { type: 'generate'; id: number; model: string; maxTokens?: number; messages: { role: string; content: string }[] }
  tries: number
}
const pending = new Map<number, Pending>()
let progressCb: ((percent: number) => void) | null = null

// Brains that didn't fit on this PC (e.g. too big for integrated graphics), so
// they aren't downloaded and tried again on every start.
const FAILED_KEY = 'brain.failed.v1'
function failedBrains(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(FAILED_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}
function rememberFailed(key: string): void {
  try {
    localStorage.setItem(FAILED_KEY, JSON.stringify([...new Set([...failedBrains(), key])]))
  } catch {
    /* storage unavailable: we'll just try again next time */
  }
}

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./brainWorker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e) => {
    const m = e.data
    if (m.type === 'progress') progressCb?.(m.percent)
    else if (m.type === 'failed') rememberFailed(m.key)
    else if (m.type === 'restart') {
      // The graphics chip crashed mid-reply. A new worker steps down to the next
      // brain (it skips the one that just failed) and answers the same message.
      const p = pending.get(m.id)
      restartWorker()
      if (p && p.tries < 3) {
        p.tries++
        getWorker().postMessage({ ...p.request, failed: failedBrains() })
      } else p?.reject(new Error(friendly(m.message)))
      return
    } else if (m.type === 'result') pending.get(m.id)?.resolve(m.text)
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

function restartWorker(): void {
  worker?.terminate()
  worker = null
}

/** Starts downloading and loading the model in the background. Resolves once it's ready. */
export function warmUp(model: string, onProgress?: (percent: number) => void): Promise<void> {
  if (onProgress) progressCb = onProgress
  return new Promise((resolve, reject) => {
    loads.push({ resolve, reject })
    getWorker().postMessage({ type: 'load', model, failed: failedBrains() })
  })
}

export function think(
  model: string,
  messages: { role: string; content: string }[],
  onProgress?: (percent: number) => void,
  maxTokens?: number
): Promise<string> {
  progressCb = onProgress ?? null
  const id = nextId++
  return new Promise((resolve, reject) => {
    const request = { type: 'generate' as const, id, model, maxTokens, messages }
    pending.set(id, { resolve, reject, request, tries: 0 })
    getWorker().postMessage({ ...request, failed: failedBrains() })
  })
}

function friendly(message: string): string {
  if (/fetch|network|ENOTFOUND|ERR_/i.test(message)) {
    return "I couldn't download my brain. Check your internet (it's only needed the first time)."
  }
  if (isGpuError(message)) {
    return 'My brain crashed your graphics chip. Restart me and I will use a lighter one.'
  }
  return message
}
