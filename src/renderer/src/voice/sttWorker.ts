// Runs Whisper speech recognition locally in a background thread.
// The model is downloaded once from Hugging Face and cached; audio never leaves the PC.
import { pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'

type InMsg = { type: 'transcribe'; id: number; audio: Float32Array; model: string }
type OutMsg =
  | { type: 'progress'; percent: number }
  | { type: 'result'; id: number; text: string }
  | { type: 'error'; id: number; message: string }

let loaded: { model: string; asr: AutomaticSpeechRecognitionPipeline } | null = null

const post = (m: OutMsg) => (self as unknown as Worker).postMessage(m)

async function getAsr(model: string): Promise<AutomaticSpeechRecognitionPipeline> {
  if (loaded?.model === model) return loaded.asr
  const files = new Map<string, number>()
  const asr = (await pipeline('automatic-speech-recognition', model, {
    dtype: 'q8',
    progress_callback: (p: { status: string; file?: string; progress?: number }) => {
      if (p.status === 'progress' && p.file) {
        files.set(p.file, p.progress ?? 0)
        const avg = [...files.values()].reduce((a, b) => a + b, 0) / files.size
        post({ type: 'progress', percent: Math.round(avg) })
      }
    }
  })) as AutomaticSpeechRecognitionPipeline
  loaded = { model, asr }
  return asr
}

self.onmessage = async (e: MessageEvent<InMsg>) => {
  const msg = e.data
  if (msg.type !== 'transcribe') return
  try {
    const asr = await getAsr(msg.model)
    // The .en models are English-only, so no language or task options.
    const out = await asr(msg.audio)
    const text = (Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text).trim()
    post({ type: 'result', id: msg.id, text })
  } catch (err) {
    post({ type: 'error', id: msg.id, message: err instanceof Error ? err.message : String(err) })
  }
}
