// The built-in brain, run by llama.cpp in its own process. If a graphics driver
// crashes, only this process dies; the app notices, steps down and restarts it.
// Messages come from nativeBrain.ts in the main process.
import type { Llama, LlamaChatSession, LlamaContext, LlamaModel } from 'node-llama-cpp'
import { cpus, totalmem } from 'node:os'
import type { HostIn, HostOut } from './protocol'

type NodeLlama = typeof import('node-llama-cpp')

const port = process.parentPort
const post = (m: HostOut) => port.postMessage(m)

let lib: NodeLlama | null = null
let llama: Llama | null = null
let model: LlamaModel | null = null
let context: LlamaContext | null = null
let session: LlamaChatSession | null = null

async function init(useGpu: boolean): Promise<void> {
  // node-llama-cpp is an ES module; load it with import() from this CommonJS bundle.
  lib ??= (await import('node-llama-cpp')) as NodeLlama
  llama = await lib.getLlama({ gpu: useGpu ? 'auto' : false, build: 'never', progressLogs: false })
  const vram = llama.gpu ? await llama.getVramState() : { total: 0, unified: 0, unifiedSize: 0 }
  post({
    type: 'hardware',
    hw: { gpu: llama.gpu, vramTotal: vram.total, vramUnified: vram.unifiedSize, ramTotal: totalmem() }
  })
}

async function unload(): Promise<void> {
  session?.dispose()
  session = null
  await context?.dispose()
  context = null
  await model?.dispose()
  model = null
}

async function load(uri: string, gpu: boolean, directory: string): Promise<void> {
  if (!lib || !llama) throw new Error('Brain engine not started.')
  await unload()
  const modelPath = await lib.resolveModelFile(uri, {
    directory,
    cli: false,
    onProgress: ({ totalSize, downloadedSize }) => {
      if (totalSize > 0) post({ type: 'progress', percent: Math.min(99, Math.round((downloadedSize / totalSize) * 100)) })
    }
  })
  post({ type: 'downloaded' })
  model = await llama.loadModel({ modelPath, gpuLayers: gpu ? 'auto' : 0 })
  context = await model.createContext({
    contextSize: { min: 2048, max: 8192 },
    // Leave a couple of cores free so the character's animation stays smooth.
    threads: gpu ? undefined : Math.max(2, cpus().length - 2)
  })
  session = new lib.LlamaChatSession({
    contextSequence: context.getSequence(),
    // Qwen3 "thinks out loud" by default. That's slow and the user can't see it.
    chatWrapper: new lib.QwenChatWrapper({ thoughts: 'discourage' })
  })
  // One tiny reply proves the brain really runs here (this is where weak GPUs fail).
  await session.prompt('hi', { maxTokens: 1 })
  session.resetChatHistory()
}

function setHistory(system: string, history: { role: 'user' | 'assistant'; content: string }[]): void {
  session!.setChatHistory([
    { type: 'system', text: system },
    ...history.map((t) =>
      t.role === 'user' ? { type: 'user' as const, text: t.content } : { type: 'model' as const, response: [t.content] }
    )
  ])
}

/** Reads the character's instructions ahead of time, so the first reply is quick. */
async function preload(system: string): Promise<void> {
  if (!session) return
  setHistory(system, [])
  await session.preloadPrompt('')
}

async function chat(
  system: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  maxTokens: number
): Promise<string> {
  if (!session) throw new Error('Brain not loaded.')
  const last = history.at(-1)
  if (!last || last.role !== 'user') throw new Error('Nothing to answer.')
  // Same system prompt and history as last time means llama.cpp reuses what it already read.
  setHistory(system, history.slice(0, -1))
  return session.prompt(last.content, {
    maxTokens,
    // Qwen's recommended settings for chat without thinking.
    temperature: 0.7,
    topP: 0.8,
    topK: 20,
    repeatPenalty: { penalty: 1.05 }
  })
}

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err))

// One job at a time: the chat session can't do two things at once.
let queue: Promise<void> = Promise.resolve()
port.on('message', (e: { data: HostIn }) => {
  queue = queue.then(() => handle(e.data))
})

async function handle(msg: HostIn): Promise<void> {
  try {
    if (msg.type === 'init') {
      await init(msg.gpu)
    } else if (msg.type === 'load') {
      await load(msg.uri, msg.gpu, msg.directory)
      post({ type: 'loaded' })
    } else if (msg.type === 'preload') {
      await preload(msg.system)
      post({ type: 'preloaded' })
    } else if (msg.type === 'chat') {
      const text = await chat(msg.system, msg.history, msg.maxTokens)
      post({ type: 'result', id: msg.id, text })
    }
  } catch (err) {
    post({ type: 'error', id: msg.type === 'chat' ? msg.id : undefined, stage: msg.type, message: errText(err) })
  }
}
