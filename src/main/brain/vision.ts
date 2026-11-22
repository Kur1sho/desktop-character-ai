// Robotico's eyes: a local vision brain (Qwen3-VL, Apache-2.0) that looks at the
// screen when the user asks. It runs in llama.cpp's own server program
// (llama-server, MIT), downloaded once like the brain, and only listens on this PC
// (127.0.0.1). It starts when needed and stops after a few idle minutes so it
// doesn't hold on to memory. Screenshots are kept in memory only, never saved.
import { app, desktopCapturer, screen } from 'electron'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { hasDedicatedGpu } from '../../shared/brainPick'
import type { ScreenChoice } from '../../shared/screen'
import { logConversation } from '../conversationLog'
import { nativeBrainAvailable, nativeHardware } from './nativeBrain'

/** Vision brains to try, best first. llama-server fetches the model and its image reader together. */
const VISION_MODELS = ['Qwen/Qwen3-VL-4B-Instruct-GGUF:Q4_K_M', 'ggml-org/Qwen3-VL-4B-Instruct-GGUF:Q4_K_M']
const IDLE_MS = 3 * 60 * 1000
/** Screenshots are shrunk to this width: plenty to read text, and quick to process. */
const SHOT_WIDTH = 1280

export type VisionStatus = (text: string) => void

let server: { proc: ChildProcess; port: number; gpu: boolean } | null = null
let starting: Promise<{ port: number }> | null = null
let idleTimer: NodeJS.Timeout | null = null

function baseDir(): string {
  const local = process.env['LOCALAPPDATA']
  return local ? join(local, 'Desktop Companion') : app.getPath('userData')
}

function findFile(dir: string, name: string): string | null {
  if (!existsSync(dir)) return null
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (entry.toLowerCase() === name) return p
    if (statSync(p).isDirectory()) {
      const found = findFile(p, name)
      if (found) return found
    }
  }
  return null
}

interface ReleaseAsset {
  name: string
  browser_download_url: string
  size: number
}
interface Release {
  tag_name: string
  assets: ReleaseAsset[]
}

/**
 * Scores a llama.cpp release download for this PC (higher is better, 0 means
 * unusable). Names change between releases, so this matches loosely: the right
 * OS and CPU, an archive we can open, and Vulkan (works on any graphics card)
 * before the plain CPU build. CUDA/HIP/SYCL builds need extra installs, so they're skipped.
 */
export function scoreAsset(name: string, platform = process.platform, arch = process.arch): number {
  const n = name.toLowerCase()
  if (!/\.(?:zip|tar\.gz)$/.test(n) || !n.includes('bin')) return 0
  if (/cudart|cuda|hip|rocm|sycl|opencl|kompute|musa|cann|xcframework|openvino/.test(n)) return 0
  const os =
    platform === 'win32' ? /win/.test(n) : platform === 'darwin' ? /macos|darwin|osx/.test(n) : /ubuntu|linux/.test(n)
  if (!os) return 0
  const wantArm = arch === 'arm64'
  const isArm = /arm64|aarch64/.test(n)
  if (wantArm !== isArm) return 0
  if (platform === 'win32' && !wantArm && !/x64|amd64|x86_64/.test(n)) return 0
  if (/vulkan/.test(n)) return 3
  if (/cpu/.test(n)) return 2
  return 1
}

function bestAsset(release: Release): ReleaseAsset | null {
  let best: ReleaseAsset | null = null
  let bestScore = 0
  for (const a of release.assets) {
    const sc = scoreAsset(a.name)
    if (sc > bestScore) [best, bestScore] = [a, sc]
  }
  return best
}

function runTool(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) =>
    execFile(cmd, args, { windowsHide: true, timeout: 5 * 60 * 1000 }, (err, _out, errOut) =>
      err ? reject(new Error(`${err.message} ${String(errOut).trim()}`)) : resolve()
    )
  )
}

async function unpack(archive: string, dir: string): Promise<void> {
  mkdirSync(dir, { recursive: true })
  if (process.platform === 'win32') {
    // Windows' own tar (bsdtar) opens zip files. Use it by full path: a "tar"
    // from Git for Windows may come first on PATH, and it can't read zips or C:\ paths.
    const winTar = join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'tar.exe')
    try {
      if (existsSync(winTar)) return await runTool(winTar, ['-xf', archive, '-C', dir])
    } catch (err) {
      logConversation(`Vision: Windows tar couldn't unpack (${err instanceof Error ? err.message : err}), trying PowerShell`)
    }
    // Fallback: PowerShell's Expand-Archive. Paths go in environment variables, never into the command.
    return new Promise((resolve, reject) =>
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', 'Expand-Archive -LiteralPath $env:ZIP_IN -DestinationPath $env:ZIP_OUT -Force'],
        { windowsHide: true, timeout: 10 * 60 * 1000, env: { ...process.env, ZIP_IN: archive, ZIP_OUT: dir } },
        (err, _out, errOut) => (err ? reject(new Error(`${err.message} ${String(errOut).trim()}`)) : resolve())
      )
    )
  }
  return archive.endsWith('.tar.gz') ? runTool('tar', ['-xzf', archive, '-C', dir]) : runTool('unzip', ['-q', '-o', archive, '-d', dir])
}

/** Downloads llama-server once (from llama.cpp's official GitHub releases) and returns its path. */
async function ensureServerProgram(status: VisionStatus): Promise<string> {
  const dir = join(baseDir(), 'llama-server')
  const exe = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'
  const existing = findFile(dir, exe)
  if (existing) return existing

  status('Getting my eyes ready (one time only)…')
  // The newest few releases: the very latest can still be uploading its files.
  const res = await fetch('https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=5', {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'desktop-companion' }
  })
  if (!res.ok) throw new Error(`Couldn't find the vision engine download (HTTP ${res.status}).`)
  const releases = (await res.json()) as Release[]
  let release: Release | null = null
  let asset: ReleaseAsset | null = null
  for (const r of releases) {
    asset = bestAsset(r)
    if (asset) {
      release = r
      break
    }
  }
  if (!release || !asset) {
    const names = releases[0]?.assets.map((a) => a.name).join(', ') ?? 'none'
    logConversation(`Vision: no download matched this PC (${process.platform} ${process.arch}). Files offered: ${names}`)
    throw new Error('No vision engine download for this PC.')
  }
  logConversation(`Vision: downloading ${asset.name}`)

  mkdirSync(dir, { recursive: true })
  const archive = join(dir, asset.name)
  // A complete download from an earlier try (if unpacking failed) is reused.
  if (!(existsSync(archive) && statSync(archive).size === asset.size)) {
    const dl = await fetch(asset.browser_download_url, { headers: { 'User-Agent': 'desktop-companion' } })
    if (!dl.ok || !dl.body) throw new Error(`Couldn't download the vision engine (HTTP ${dl.status}).`)
    let got = 0
    let lastPct = -1
    const counter = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, ctl) {
        got += chunk.byteLength
        const pct = asset.size ? Math.floor((got / asset.size) * 100) : 0
        if (pct !== lastPct) status(`Getting my eyes ready (one time only)… ${(lastPct = pct)}%`)
        ctl.enqueue(chunk)
      }
    })
    await pipeline(Readable.fromWeb(dl.body.pipeThrough(counter) as never), createWriteStream(archive))
  }
  await unpack(archive, join(dir, release.tag_name))
  rmSync(archive, { force: true })
  const found = findFile(dir, exe)
  if (!found) throw new Error('The vision engine download was missing llama-server.')
  logConversation(`Vision: installed llama.cpp ${release.tag_name}`)
  return found
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer()
    s.once('error', reject)
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port
      s.close(() => resolve(port))
    })
  })
}

async function healthy(port: number): Promise<boolean> {
  try {
    return (await fetch(`http://127.0.0.1:${port}/health`)).ok
  } catch {
    return false
  }
}

/** Starts llama-server with a vision model, waiting while it downloads (first time) and loads. */
function startServer(program: string, model: string, gpu: boolean, status: VisionStatus): Promise<{ proc: ChildProcess; port: number }> {
  return freePort().then(
    (port) =>
      new Promise((resolve, reject) => {
        const cache = join(baseDir(), 'models', 'vision')
        mkdirSync(cache, { recursive: true })
        const args = ['-hf', model, '--host', '127.0.0.1', '--port', String(port), '-c', '8192', '-ngl', gpu ? '99' : '0', '--no-webui']
        const proc = spawn(program, args, { windowsHide: true, env: { ...process.env, LLAMA_CACHE: cache } })
        let tail = ''
        let done = false
        const finish = (err?: Error) => {
          if (done) return
          done = true
          clearInterval(poll)
          if (err) {
            proc.kill()
            reject(err)
          } else resolve({ proc, port })
        }
        const onOutput = (d: Buffer) => {
          const text = String(d)
          tail = (tail + text).slice(-2000)
          // Download progress, e.g. "  45%" from llama.cpp's downloader.
          const pct = text.match(/(\d{1,3})(?:\.\d+)?%/g)?.at(-1)
          if (pct) status(`Downloading my eyes (one time only)… ${parseInt(pct, 10)}%`)
        }
        proc.stdout?.on('data', onOutput)
        proc.stderr?.on('data', onOutput)
        proc.on('error', (err) => finish(err))
        proc.on('exit', (code) => finish(new Error(`The vision engine stopped (code ${code}). ${tail.split('\n').slice(-4).join(' ').trim()}`)))
        const started = Date.now()
        const poll = setInterval(async () => {
          if (await healthy(port)) finish()
          // The first download can take a while; loading alone shouldn't.
          else if (Date.now() - started > 45 * 60 * 1000) finish(new Error('The vision engine took too long to start.'))
        }, 700)
      })
  )
}

async function ensureServer(status: VisionStatus): Promise<{ port: number }> {
  if (server && server.proc.exitCode === null) return server
  if (!starting) {
    starting = (async () => {
      const program = await ensureServerProgram(status)
      // The brain engine knows the graphics card; start it if needed (it's cheap).
      await nativeBrainAvailable()
      const hw = nativeHardware()
      const gpuFirst = hw ? hasDedicatedGpu(hw) : false
      let lastErr: unknown = null
      for (const model of VISION_MODELS) {
        // On a graphics card first; if that won't load (not enough video memory), the processor.
        for (const gpu of gpuFirst ? [true, false] : [false]) {
          try {
            status('Opening my eyes…')
            const s = await startServer(program, model, gpu, status)
            server = { ...s, gpu }
            s.proc.on('exit', () => {
              if (server?.proc === s.proc) server = null
            })
            logConversation(`Vision: ${model} on the ${gpu ? 'graphics card' : 'processor'}`)
            return s
          } catch (err) {
            lastErr = err
            logConversation(`Vision: ${model} (${gpu ? 'graphics card' : 'processor'}) didn't start: ${err instanceof Error ? err.message : err}`)
          }
        }
      }
      throw lastErr instanceof Error ? lastErr : new Error("My eyes wouldn't open.")
    })().finally(() => (starting = null))
  }
  return starting
}

function scheduleIdleStop(): void {
  if (idleTimer) clearTimeout(idleTimer)
  // Frees the memory (and video memory) when he hasn't looked at anything for a while.
  idleTimer = setTimeout(() => stopVision(), IDLE_MS)
}

export function stopVision(): void {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = null
  server?.proc.kill()
  server = null
}

/** The display they asked about ("the right screen"), or the one the mouse is on. */
function pickDisplay(choice: ScreenChoice): Electron.Display {
  const all = screen.getAllDisplays()
  const current = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  if (all.length < 2 || !choice) return current
  const by = (f: (d: Electron.Display) => number) => all.reduce((a, b) => (f(b) < f(a) ? b : a))
  switch (choice) {
    case 'left':
      return by((d) => d.bounds.x)
    case 'right':
      return by((d) => -(d.bounds.x + d.bounds.width))
    case 'top':
      return by((d) => d.bounds.y)
    case 'bottom':
      return by((d) => -(d.bounds.y + d.bounds.height))
    case 'primary':
      return screen.getPrimaryDisplay()
    case 'other':
      return all.find((d) => d.id !== current.id) ?? current
  }
}

/** Takes a picture of a screen, shrunk, as a JPEG data URL. Never written to disk. */
export async function captureScreen(choice: ScreenChoice = null): Promise<string> {
  const display = pickDisplay(choice)
  const width = Math.min(SHOT_WIDTH, Math.round(display.size.width * display.scaleFactor))
  const height = Math.round((width * display.size.height) / display.size.width)
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width, height } })
  const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0]
  if (!source || source.thumbnail.isEmpty()) throw new Error("I couldn't see the screen.")
  return `data:image/jpeg;base64,${source.thumbnail.toJPEG(82).toString('base64')}`
}

/** Asks the vision brain about a picture. */
export async function lookAndAnswer(
  system: string,
  question: string,
  image: string,
  maxTokens: number,
  status: VisionStatus
): Promise<string> {
  const { port } = await ensureServer(status)
  status('Looking…')
  const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: image } },
            { type: 'text', text: question }
          ]
        }
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
      top_p: 0.8
    })
  })
  scheduleIdleStop()
  if (!res.ok) throw new Error(`My eyes had a problem (HTTP ${res.status}).`)
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return data.choices?.[0]?.message?.content?.trim() ?? ''
}
