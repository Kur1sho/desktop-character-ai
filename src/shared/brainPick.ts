// Picks the biggest built-in brain a PC can run, for the llama.cpp engine.
// All are Qwen3 (Apache-2.0: free for commercial use). Pure code, so it can be tested.

export interface GgufBrain {
  id: string
  label: string
  /** Where node-llama-cpp downloads it from (Qwen's own GGUF files on Hugging Face). */
  uri: string
  /** Download size, roughly. */
  sizeGB: number
  /** Memory it needs to run with a normal chat context (weights + working memory). */
  needGB: number
}

export const GGUF_BRAINS: GgufBrain[] = [
  { id: 'qwen3-14b', label: 'Qwen3 14B', uri: 'hf:Qwen/Qwen3-14B-GGUF:Q4_K_M', sizeGB: 9, needGB: 11 },
  { id: 'qwen3-8b', label: 'Qwen3 8B', uri: 'hf:Qwen/Qwen3-8B-GGUF:Q4_K_M', sizeGB: 5, needGB: 7 },
  { id: 'qwen3-4b', label: 'Qwen3 4B', uri: 'hf:Qwen/Qwen3-4B-GGUF:Q4_K_M', sizeGB: 2.5, needGB: 4 },
  { id: 'qwen3-1.7b', label: 'Qwen3 1.7B', uri: 'hf:Qwen/Qwen3-1.7B-GGUF:Q8_0', sizeGB: 1.8, needGB: 3 }
]

/** Brains worth running on the processor alone. Bigger ones would reply too slowly. */
const CPU_BRAINS = new Set(['qwen3-4b', 'qwen3-1.7b'])

export interface Hardware {
  /** The GPU engine llama.cpp found ("cuda", "vulkan", "metal"), or false for none. */
  gpu: string | false
  vramTotal: number
  /** Video memory shared with the processor (integrated graphics). */
  vramUnified: number
  ramTotal: number
}

export interface BrainPlan {
  brain: GgufBrain
  gpu: boolean
}

export const planKey = (p: BrainPlan) => `${p.gpu ? 'gpu' : 'cpu'}:${p.brain.id}`

const GB = 1024 ** 3
/** Left free for Windows, games and the app itself. */
const RAM_HEADROOM = 3 * GB

/**
 * A graphics card with its own memory. Integrated graphics share the PC's
 * memory, and running a brain on them can crash the graphics driver, so those
 * PCs use the processor instead.
 */
export function hasDedicatedGpu(hw: Hardware): boolean {
  return Boolean(hw.gpu) && hw.vramTotal >= 3 * GB && hw.vramUnified < hw.vramTotal / 2
}

/**
 * The brains to try, best first. A later one is used only if an earlier one
 * won't load or crashes. Plans that already failed on this PC are skipped.
 */
export function planBrains(hw: Hardware, failed: string[] = []): BrainPlan[] {
  const plans: BrainPlan[] = []
  if (hasDedicatedGpu(hw)) {
    for (const brain of GGUF_BRAINS) if (brain.needGB * GB <= hw.vramTotal) plans.push({ brain, gpu: true })
  }
  for (const brain of GGUF_BRAINS) {
    if (CPU_BRAINS.has(brain.id) && brain.needGB * GB + RAM_HEADROOM <= hw.ramTotal) plans.push({ brain, gpu: false })
  }
  const smallest = { brain: GGUF_BRAINS[GGUF_BRAINS.length - 1], gpu: false }
  if (!plans.length) plans.push(smallest)
  const left = plans.filter((p) => !failed.includes(planKey(p)))
  // If everything failed before, try the safest one again rather than nothing.
  return left.length ? left : [smallest]
}

/** Times a brain may die while loading (app closed, PC crashed) before it's skipped. */
export const UNFINISHED_BEFORE_SKIP = 2

/** Network errors mean "try again later", not "this brain doesn't work on this PC". */
export function isDownloadError(message: string): boolean {
  return /fetch|network|ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket|timed? ?out|status code|HTTP/i.test(
    message
  )
}
