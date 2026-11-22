// The built-in AI brain: a small language model that runs on the user's PC
// (GPU via WebGPU when available, otherwise CPU). Downloaded once, then offline.
import { pipeline, type TextGenerationPipeline } from '@huggingface/transformers'

type InMsg =
  | { type: 'load'; model: string }
  | { type: 'generate'; id: number; model: string; messages: { role: string; content: string }[] }
type OutMsg =
  | { type: 'progress'; percent: number }
  | { type: 'ready'; device: string }
  | { type: 'result'; id: number; text: string }
  | { type: 'error'; id?: number; message: string }

const post = (m: OutMsg) => (self as unknown as Worker).postMessage(m)

let loading: Promise<TextGenerationPipeline> | null = null
let loadedModel = ''

async function hasWebGpu(): Promise<boolean> {
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
    return Boolean(gpu && (await gpu.requestAdapter()))
  } catch {
    return false
  }
}

function load(model: string): Promise<TextGenerationPipeline> {
  if (loading && loadedModel === model) return loading
  loadedModel = model
  loading = (async () => {
    const gpu = await hasWebGpu()
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
    // Generate one token so the GPU is set up before the first real chat.
    await gen([{ role: 'user', content: 'hi' }] as never, { max_new_tokens: 1 })
    post({ type: 'ready', device: gpu ? 'gpu' : 'cpu' })
    return gen
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
      await load(msg.model)
      post({ type: 'ready', device: '' })
      return
    }
    const gen = await load(msg.model)
    const out = (await gen(msg.messages as never, {
      max_new_tokens: 80,
      do_sample: true,
      temperature: 0.8,
      top_p: 0.9,
      repetition_penalty: 1.1
    })) as unknown as { generated_text: { role: string; content: string }[] | string }[]
    const g = out[0]?.generated_text
    const text = Array.isArray(g) ? (g.at(-1)?.content ?? '') : String(g ?? '')
    post({ type: 'result', id: msg.id, text })
  } catch (err) {
    post({
      type: 'error',
      id: msg.type === 'generate' ? msg.id : undefined,
      message: err instanceof Error ? err.message : String(err)
    })
  }
}
