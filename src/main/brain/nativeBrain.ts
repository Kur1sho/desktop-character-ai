// Runs the built-in brain with llama.cpp in a separate process, and picks the
// biggest brain this PC can run (14B, 8B or 4B on a graphics card, 4B on the
// processor). Anything that fails is remembered, so it's only tried once.
import { app, utilityProcess, type UtilityProcess } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, statfsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  GGUF_BRAINS,
  hasDedicatedGpu,
  isDownloadError,
  planBrains,
  planKey,
  UNFINISHED_BEFORE_SKIP,
  type BrainPlan,
  type Hardware
} from '../../shared/brainPick'
import { getPersona, systemPrompt } from '../../shared/personas'
import { logConversation } from '../conversationLog'
import { getSettings } from '../settingsStore'
import type { HostIn, HostOut, Turn } from './protocol'

/** The brain process died (usually a graphics driver crash). */
class HostCrashed extends Error {}

interface BrainState {
  /** Plans that failed on this PC ("gpu:qwen3-14b"). */
  failed: string[]
  /** A brain being loaded right now. Still set at the next start means it never finished. */
  trying: { key: string; count: number } | null
  /** The GPU engine itself crashed: use the processor only. */
  gpuEngineFailed: boolean
}

let host: UtilityProcess | null = null
let hw: Hardware | null = null
let loaded: BrainPlan | null = null
let warming: Promise<void> | null = null
/** Why llama.cpp can't run on this PC at all (then the old in-window brain is used). */
let unavailable: string | null = null
let nextId = 1
const messageListeners = new Set<(m: HostOut) => void>()
const exitListeners = new Set<(code: number) => void>()

// --- Remembering what works on this PC ---------------------------------------

const stateFile = () => join(app.getPath('userData'), 'brain', 'state.json')

function readState(): BrainState {
  try {
    const s = JSON.parse(readFileSync(stateFile(), 'utf8')) as Partial<BrainState>
    return {
      failed: Array.isArray(s.failed) ? s.failed.filter((x) => typeof x === 'string') : [],
      trying: s.trying && typeof s.trying.key === 'string' ? { key: s.trying.key, count: Number(s.trying.count) || 0 } : null,
      gpuEngineFailed: s.gpuEngineFailed === true
    }
  } catch {
    return { failed: [], trying: null, gpuEngineFailed: false }
  }
}

function writeState(change: (s: BrainState) => void): BrainState {
  const s = readState()
  change(s)
  try {
    mkdirSync(join(stateFile(), '..'), { recursive: true })
    writeFileSync(stateFile(), JSON.stringify(s, null, 2))
  } catch (err) {
    console.error('Could not save brain state:', err)
  }
  return s
}

function markFailed(key: string, why: string): void {
  logConversation(`Brain ${key} didn't work on this PC, stepping down: ${why}`)
  writeState((s) => {
    s.failed = [...new Set([...s.failed, key])]
    if (s.trying?.key === key) s.trying = null
  })
}

/** A brain that never finished loading twice (the app or PC died) goes on the skip list. */
function checkUnfinished(): void {
  const s = readState()
  if (s.trying && s.trying.count >= UNFINISHED_BEFORE_SKIP) markFailed(s.trying.key, 'never finished loading')
}

/** Big model files go in Local AppData on Windows (not Roaming, which may sync). */
function modelsDir(): string {
  const local = process.env['LOCALAPPDATA']
  const dir = local ? join(local, 'Desktop Companion', 'models') : join(app.getPath('userData'), 'models')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

// --- The brain process ---------------------------------------------------------

function startHost(): UtilityProcess {
  const proc = utilityProcess.fork(join(__dirname, 'llamaHost.js'), [], { serviceName: 'Companion brain' })
  proc.on('message', (m: HostOut) => messageListeners.forEach((l) => l(m)))
  proc.on('exit', (code) => {
    if (host === proc) {
      host = null
      hw = null
      loaded = null
    }
    exitListeners.forEach((l) => l(code))
  })
  host = proc
  return proc
}

function ask(msg: HostIn, isDone: (m: HostOut) => boolean, onProgress?: (pct: number) => void, onDownloaded?: () => void) {
  return new Promise<HostOut>((resolve, reject) => {
    const proc = host ?? startHost()
    const cleanup = () => {
      messageListeners.delete(onMessage)
      exitListeners.delete(onExit)
    }
    const onMessage = (m: HostOut) => {
      if (m.type === 'progress') onProgress?.(m.percent)
      else if (m.type === 'downloaded') onDownloaded?.()
      else if (m.type === 'error' && m.stage === msg.type && (msg.type !== 'chat' || m.id === msg.id)) {
        cleanup()
        reject(new Error(m.message))
      } else if (isDone(m)) {
        cleanup()
        resolve(m)
      }
    }
    const onExit = (code: number) => {
      cleanup()
      reject(new HostCrashed(`The brain process stopped (code ${code}).`))
    }
    messageListeners.add(onMessage)
    exitListeners.add(onExit)
    proc.postMessage(msg)
  })
}

async function ensureEngine(): Promise<Hardware> {
  if (hw && host) return hw
  if (unavailable) throw new Error(unavailable)
  const useGpu = !readState().gpuEngineFailed
  try {
    const m = await ask({ type: 'init', gpu: useGpu }, (x) => x.type === 'hardware')
    hw = (m as Extract<HostOut, { type: 'hardware' }>).hw
    return hw
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (err instanceof HostCrashed && useGpu) {
      // The graphics engine crashed on start. The processor still works.
      logConversation(`Brain: the graphics engine crashed on start, using the processor. ${message}`)
      writeState((s) => (s.gpuEngineFailed = true))
      return ensureEngine()
    }
    unavailable = message
    console.error('llama.cpp brain unavailable:', message)
    logConversation(`Brain: llama.cpp can't run on this PC (${message}). Using the in-window brain.`)
    throw err
  }
}

/** A brain the user typed in Settings ("hf:..." or a .gguf file), instead of picking automatically. */
function customPlan(h: Hardware): BrainPlan | null {
  const typed = getSettings().models['builtin']?.trim() ?? ''
  if (!/^hf:|\.gguf$/i.test(typed)) return null
  return {
    brain: { id: typed, label: typed, uri: typed, sizeGB: 0, needGB: 0 },
    gpu: hasDedicatedGpu(h)
  }
}

/** Free disk space where models go, or Infinity if it can't be read. */
function freeDisk(dir: string): number {
  try {
    const st = statfsSync(dir)
    return st.bavail * st.bsize
  } catch {
    return Infinity
  }
}

/** Already downloaded? (node-llama-cpp names files after the repo and quant, e.g. "...Qwen3-8B-Q4_K_M.gguf".) */
function isDownloaded(dir: string, plan: BrainPlan): boolean {
  const quant = plan.brain.uri.split(':').at(-1)?.toLowerCase() ?? ''
  const name = plan.brain.label.replace(/\s+/g, '-').toLowerCase()
  try {
    return readdirSync(dir).some((f) => f.toLowerCase().includes(name) && f.toLowerCase().includes(quant) && f.endsWith('.gguf'))
  } catch {
    return false
  }
}

const currentSystem = () => systemPrompt(getPersona(getSettings().personaId))

async function doWarmUp(onProgress?: (pct: number) => void): Promise<void> {
  const h = await ensureEngine()
  checkUnfinished()
  const custom = customPlan(h)
  const plans = custom ? [custom] : planBrains(h, readState().failed)
  let lastErr: unknown = null
  const dir = modelsDir()
  for (const plan of plans) {
    const key = planKey(plan)
    // Leave a few GB free; a smaller brain is better than a full disk.
    if (!custom && !isDownloaded(dir, plan) && plan.brain.sizeGB * 1024 ** 3 + 3 * 1024 ** 3 > freeDisk(dir)) {
      logConversation(`Brain: not enough disk space for ${plan.brain.label}, trying a smaller one`)
      lastErr = new Error('Not enough disk space for my brain. Free up a few GB and restart me.')
      continue
    }
    try {
      await ensureEngine()
      await ask(
        { type: 'load', uri: plan.brain.uri, gpu: plan.gpu, directory: dir },
        (m) => m.type === 'loaded',
        onProgress,
        // Only count it as an attempt once it's downloaded: closing the app mid-download isn't a crash.
        () => writeState((s) => (s.trying = { key, count: s.trying?.key === key ? s.trying.count + 1 : 1 }))
      )
      writeState((s) => (s.trying = null))
      loaded = plan
      logConversation(`Brain: ${plan.brain.label} on the ${plan.gpu ? `graphics card (${h.gpu})` : 'processor'}`)
      // Read the character's instructions now, so the first reply is quick.
      void ask({ type: 'preload', system: currentSystem() }, (m) => m.type === 'preloaded').catch(() => undefined)
      return
    } catch (err) {
      lastErr = err
      const message = err instanceof Error ? err.message : String(err)
      // It ended (with an error we saw), so it's no longer an unfinished attempt.
      writeState((s) => (s.trying = null))
      if (!(err instanceof HostCrashed) && isDownloadError(message)) {
        throw new Error("I couldn't download my brain. Check your internet (it's only needed the first time).")
      }
      if (!custom) markFailed(key, message)
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('No brain could be loaded.')
}

/** Downloads (first time only) and loads the best brain for this PC. */
export function warmUpNativeBrain(onProgress?: (pct: number) => void): Promise<void> {
  if (loaded && host) return Promise.resolve()
  if (!warming) {
    const job: Promise<void> = doWarmUp(onProgress).finally(() => {
      if (warming === job) warming = null
    })
    warming = job
  }
  return warming
}

/** False when llama.cpp can't run here at all; the app then uses the in-window brain. */
export async function nativeBrainAvailable(): Promise<boolean> {
  try {
    await ensureEngine()
    return true
  } catch {
    return false
  }
}

/** Answers a message. If the graphics card crashes, steps down to the next brain and asks again. */
export async function nativeChat(system: string, history: Turn[], maxTokens: number): Promise<string> {
  let lastErr: unknown = null
  for (let attempt = 0; attempt < 3; attempt++) {
    await warmUpNativeBrain()
    const plan = loaded
    const id = nextId++
    try {
      const m = await ask({ type: 'chat', id, system, history, maxTokens }, (x) => x.type === 'result' && x.id === id)
      return (m as Extract<HostOut, { type: 'result' }>).text
    } catch (err) {
      lastErr = err
      if (!(err instanceof HostCrashed) || !plan) throw err
      markFailed(planKey(plan), err.message)
    }
  }
  throw lastErr
}

/** Which brain is running, for Settings and the log. */
export function nativeBrainLabel(): string | null {
  return loaded ? `${loaded.brain.label} (${loaded.gpu ? 'graphics card' : 'processor'})` : null
}

export function stopNativeBrain(): void {
  host?.kill()
  host = null
}

export const KNOWN_BRAINS = GGUF_BRAINS
