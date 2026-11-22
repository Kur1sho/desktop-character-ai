// Runs Whisper speech recognition locally in a background thread, on the GPU
// (WebGPU) when available and the CPU otherwise. The model is downloaded once
// and cached; audio never leaves the PC.
import { pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'

type InMsg = { type: 'load'; model: string } | { type: 'transcribe'; id: number; audio: Float32Array; model: string }
type OutMsg =
  | { type: 'progress'; percent: number }
  | { type: 'result'; id: number; text: string }
  | { type: 'error'; id?: number; message: string }

const post = (m: OutMsg) => (self as unknown as Worker).postMessage(m)

let loading: Promise<AutomaticSpeechRecognitionPipeline> | null = null
let loadedModel = ''

async function hasWebGpu(): Promise<boolean> {
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
    return Boolean(gpu && (await gpu.requestAdapter()))
  } catch {
    return false
  }
}

async function create(model: string): Promise<AutomaticSpeechRecognitionPipeline> {
  const files = new Map<string, number>()
  const progress_callback = (p: { status: string; file?: string; progress?: number }) => {
    if (p.status === 'progress' && p.file) {
      files.set(p.file, p.progress ?? 0)
      const avg = [...files.values()].reduce((a, b) => a + b, 0) / files.size
      post({ type: 'progress', percent: Math.round(avg) })
    }
  }
  if (await hasWebGpu()) {
    try {
      return (await pipeline('automatic-speech-recognition', model, {
        device: 'webgpu',
        dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
        progress_callback
      })) as AutomaticSpeechRecognitionPipeline
    } catch (err) {
      console.warn('WebGPU speech recognition unavailable, using CPU:', err)
    }
  }
  return (await pipeline('automatic-speech-recognition', model, {
    dtype: 'q8',
    progress_callback
  })) as AutomaticSpeechRecognitionPipeline
}

function getAsr(model: string): Promise<AutomaticSpeechRecognitionPipeline> {
  if (loading && loadedModel === model) return loading
  loadedModel = model
  loading = create(model)
  loading.catch(() => (loading = null))
  return loading
}

self.onmessage = async (e: MessageEvent<InMsg>) => {
  const msg = e.data
  try {
    const asr = await getAsr(msg.model)
    if (msg.type === 'load') {
      // Warm up with a short silent clip so the first real request is fast.
      await asr(new Float32Array(8000))
      return
    }
    // The .en models are English-only, so no language or task options.
    const out = await asr(msg.audio)
    const text = (Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text).trim()
    post({ type: 'result', id: msg.id, text })
  } catch (err) {
    post({
      type: 'error',
      id: msg.type === 'transcribe' ? msg.id : undefined,
      message: err instanceof Error ? err.message : String(err)
    })
  }
}
