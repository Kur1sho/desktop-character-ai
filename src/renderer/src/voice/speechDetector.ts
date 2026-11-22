// Tells human speech apart from other sounds (typing, clicks, fans, music)
// using Silero VAD, a tiny (2 MB) neural network that ships with the app and
// runs on this PC in about a millisecond per frame. Loudness alone can't do
// this: a keyboard is as loud as a voice.
//
// Silero VAD is MIT licensed: https://github.com/snakers4/silero-vad
import * as ort from 'onnxruntime-web/wasm'
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'
import modelUrl from './models/silero_vad_v5.onnx?url'

/** Samples per frame the model expects at 16 kHz (32 ms). */
export const SPEECH_FRAME = 512
const CONTEXT = 64

let session: Promise<ort.InferenceSession | null> | null = null

function getSession(): Promise<ort.InferenceSession | null> {
  if (!session) {
    ort.env.wasm.wasmPaths = { wasm: wasmUrl }
    ort.env.wasm.numThreads = 1
    session = ort.InferenceSession.create(modelUrl, { executionProviders: ['wasm'] }).catch((err) => {
      console.warn('Speech detector unavailable, falling back to loudness:', err)
      return null
    })
  }
  return session
}

export interface SpeechDetector {
  /** Probability (0 to 1) that a 512-sample frame contains speech. Calls run in order. */
  process(frame: Float32Array): Promise<number>
  reset(): void
}

/** Returns null if the model can't run, so callers fall back to loudness. */
export async function createSpeechDetector(): Promise<SpeechDetector | null> {
  const s = await getSession()
  if (!s) return null
  const sr = new ort.Tensor('int64', BigInt64Array.from([16000n]))
  let state: ort.Tensor = new ort.Tensor('float32', new Float32Array(2 * 128), [2, 1, 128])
  let context = new Float32Array(CONTEXT)
  let queue: Promise<unknown> = Promise.resolve()

  const run = async (frame: Float32Array): Promise<number> => {
    const input = new Float32Array(CONTEXT + SPEECH_FRAME)
    input.set(context, 0)
    input.set(frame.subarray(0, SPEECH_FRAME), CONTEXT)
    context = input.slice(input.length - CONTEXT)
    const out = await s.run({ input: new ort.Tensor('float32', input, [1, input.length]), state, sr })
    state = out.stateN
    return (out.output.data as Float32Array)[0]
  }

  return {
    process(frame) {
      const p = queue.then(() => run(frame))
      queue = p.catch(() => undefined)
      return p
    },
    reset() {
      state = new ort.Tensor('float32', new Float32Array(2 * 128), [2, 1, 128])
      context = new Float32Array(CONTEXT)
    }
  }
}
