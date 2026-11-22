// The built-in AI brain: a language model that runs on the user's PC (GPU via
// WebGPU when available, otherwise CPU). Downloaded once, then offline.
// "auto" picks the smartest model the PC can run, and steps down if it won't load.
import { pipeline, type TextGenerationPipeline } from '@huggingface/transformers'
import { brainCandidates, isNetworkError, isThinkingModel, stripThinking } from '@shared/brainModels'

type InMsg =
  | { type: 'load'; model: string }
  | { type: 'generate'; id: number; model: string; maxTokens?: number; messages: { role: string; content: string }[] }
type OutMsg =
  | { type: 'progress'; percent: number }
  | { type: 'ready'; device: string; model: string }
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

async function loadOne(model: string, gpu: boolean): Promise<TextGenerationPipeline> {
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

function load(model: string): Promise<Loaded> {
  if (loading && requestedModel === model) return loading
  requestedModel = model
  loading = (async () => {
    const gpu = await hasWebGpu()
    const candidates = brainCandidates(model, gpu)
    let lastErr: unknown = null
    for (const m of candidates) {
      try {
        const gen = await loadOne(m, gpu)
        post({ type: 'ready', device: gpu ? 'gpu' : 'cpu', model: m })
        return { gen, model: m }
      } catch (err) {
        lastErr = err
        const message = err instanceof Error ? err.message : String(err)
        console.warn(`Brain ${m} didn't load, trying a smaller one:`, message)
        // No internet: a smaller model won't download either.
        if (isNetworkError(message)) break
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
      const { model } = await load(msg.model)
      post({ type: 'ready', device: '', model })
      return
    }
    const { gen, model } = await load(msg.model)
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
