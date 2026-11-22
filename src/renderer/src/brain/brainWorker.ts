// The built-in AI brain: a language model that runs on the user's PC (GPU via
// WebGPU when available, otherwise CPU). Downloaded once, then offline.
// "auto" picks the smartest model the PC can run, and steps down if it won't load.
import { pipeline, type TextGenerationPipeline } from '@huggingface/transformers'
import {
  brainCandidates,
  choiceKey,
  isNetworkError,
  isThinkingModel,
  stripThinking,
  type BrainChoice
} from '@shared/brainModels'

type InMsg =
  | { type: 'load'; model: string; failed?: string[] }
  | {
      type: 'generate'
      id: number
      model: string
      failed?: string[]
      maxTokens?: number
      messages: { role: string; content: string }[]
    }
type OutMsg =
  | { type: 'progress'; percent: number }
  | { type: 'ready'; device: string; model: string }
  /** This model and device didn't work on this PC, so don't try it next time. */
  | { type: 'failed'; key: string }
  | { type: 'result'; id: number; text: string }
  | { type: 'error'; id?: number; message: string }

const post = (m: OutMsg) => (self as unknown as Worker).postMessage(m)

interface Loaded {
  gen: TextGenerationPipeline
  model: string
}
let loading: Promise<Loaded> | null = null
let requestedModel = ''

async function hasWebGpu(): Promise<boolean> {
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
    return Boolean(gpu && (await gpu.requestAdapter()))
  } catch {
    return false
  }
}

/**
 * GPU memory errors can surface outside the promise we're awaiting (inside the
 * WebGPU runtime). Catch those too while a model loads, so we can step down.
 */
function withStrayErrors<T>(work: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onRejection = (e: PromiseRejectionEvent) => {
      e.preventDefault()
      reject(e.reason instanceof Error ? e.reason : new Error(String(e.reason)))
    }
    const onError = (e: ErrorEvent) => {
      e.preventDefault()
      reject(e.error instanceof Error ? e.error : new Error(e.message))
    }
    self.addEventListener('unhandledrejection', onRejection)
    self.addEventListener('error', onError)
    work.then(resolve, reject).finally(() => {
      self.removeEventListener('unhandledrejection', onRejection)
      self.removeEventListener('error', onError)
    })
  })
}

async function loadOne({ model, device }: BrainChoice): Promise<TextGenerationPipeline> {
  const gpu = device === 'gpu'
  const files = new Map<string, number>()
  const gen = (await pipeline('text-generation', model, {
    device: gpu ? 'webgpu' : 'wasm',
    dtype: gpu ? 'q4f16' : 'q4',
    progress_callback: (p: { status: string; file?: string; progress?: number }) => {
      if (p.status === 'progress' && p.file) {
        files.set(p.file, p.progress ?? 0)
        const avg = [...files.values()].reduce((a, b) => a + b, 0) / files.size
        post({ type: 'progress', percent: Math.round(avg) })
      }
    }
  })) as TextGenerationPipeline
  try {
    // Generate one token so the GPU is set up (and proven to fit) before the first real chat.
    await gen([{ role: 'user', content: 'hi' }] as never, { max_new_tokens: 1, ...templateOpts(model) } as never)
  } catch (err) {
    await gen.dispose().catch(() => undefined)
    throw err
  }
  return gen
}

function templateOpts(model: string): Record<string, unknown> {
  return isThinkingModel(model) ? { tokenizer_encode_kwargs: { enable_thinking: false } } : {}
}

function load(model: string, failed: string[] = []): Promise<Loaded> {
  if (loading && requestedModel === model) return loading
  requestedModel = model
  loading = (async () => {
    const gpu = await hasWebGpu()
    const candidates = brainCandidates(model, gpu, failed)
    let lastErr: unknown = null
    for (const choice of candidates) {
      try {
        const gen = await withStrayErrors(loadOne(choice))
        post({ type: 'ready', device: choice.device, model: choice.model })
        return { gen, model: choice.model }
      } catch (err) {
        lastErr = err
        const message = err instanceof Error ? err.message : String(err)
        // No internet: a smaller model won't download either, and this one may work later.
        if (isNetworkError(message)) break
        console.warn(`Brain ${choiceKey(choice)} didn't load, stepping down:`, message)
        post({ type: 'failed', key: choiceKey(choice) })
      }
    }
    throw lastErr ?? new Error('No brain could be loaded.')
  })()
  loading.catch(() => {
    loading = null
  })
  return loading
}

self.onmessage = async (e: MessageEvent<InMsg>) => {
  const msg = e.data
  try {
    if (msg.type === 'load') {
      const { model } = await load(msg.model, msg.failed)
      post({ type: 'ready', device: '', model })
      return
    }
    const { gen, model } = await load(msg.model, msg.failed)
    const out = (await gen(msg.messages as never, {
      max_new_tokens: msg.maxTokens ?? 100,
      do_sample: true,
      // Qwen's recommended settings for chat without thinking.
      temperature: 0.7,
      top_p: 0.8,
      top_k: 20,
      repetition_penalty: 1.05,
      ...templateOpts(model)
    } as never)) as unknown as { generated_text: { role: string; content: string }[] | string }[]
    const g = out[0]?.generated_text
    const text = Array.isArray(g) ? (g.at(-1)?.content ?? '') : String(g ?? '')
    post({ type: 'result', id: msg.id, text: stripThinking(text) })
  } catch (err) {
    post({
      type: 'error',
      id: msg.type === 'generate' ? msg.id : undefined,
      message: err instanceof Error ? err.message : String(err)
    })
  }
}
