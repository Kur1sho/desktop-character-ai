// Fetches llama.cpp's llama-server (MIT) for Windows into build/llama-server, so
// the installer can carry it (and sign it with the rest of the app) instead of
// the app downloading an unsigned copy the first time "look at my screen" is used.
//
//   node scripts/fetch-llama-server.mjs            newest release with a Windows build
//   LLAMA_TAG=b1234 node scripts/fetch-llama-server.mjs   a particular release
//   LLAMA_ZIP=C:\path\to\llama-bXXXX-bin-win-vulkan-x64.zip node scripts/fetch-llama-server.mjs   one you downloaded yourself
import { execFileSync } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const OUT = join('build', 'llama-server')
const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'desktop-companion-build' }

/** Same choice as the app makes: Windows x64, Vulkan (any graphics card), else the CPU build. */
function score(name) {
  const n = name.toLowerCase()
  if (!n.endsWith('.zip') || !n.includes('bin') || !/win/.test(n) || !/x64|amd64|x86_64/.test(n)) return 0
  if (/arm64|aarch64|cudart|cuda|hip|rocm|sycl|opencl|kompute|musa|cann|openvino/.test(n)) return 0
  return /vulkan/.test(n) ? 3 : /cpu/.test(n) ? 2 : 1
}

const localZip = process.env.LLAMA_ZIP
let pick
const tmp = join('build', '.llama-download')
let zip
if (localZip) {
  const name = localZip.split(/[\\/]/).pop()
  pick = { release: name.match(/b\d+/)?.[0] ?? 'local', asset: { name } }
  zip = localZip
} else {
  const tag = process.env.LLAMA_TAG
  const url = tag
    ? `https://api.github.com/repos/ggml-org/llama.cpp/releases/tags/${tag}`
    : 'https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=5'
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`GitHub said ${res.status} for ${url}`)
  const releases = tag ? [await res.json()] : await res.json()
  for (const r of releases) {
    const best = r.assets.map((a) => ({ a, s: score(a.name) })).filter((x) => x.s > 0).sort((x, y) => y.s - x.s)[0]
    if (best) {
      pick = { release: r.tag_name, asset: best.a }
      break
    }
  }
  if (!pick) throw new Error('No Windows x64 llama.cpp build found in the latest releases.')
}

const versionFile = join(OUT, 'VERSION')
if (existsSync(versionFile) && readFileSync(versionFile, 'utf8').trim() === `${pick.release} ${pick.asset.name}`) {
  console.log(`llama-server ${pick.release} already in ${OUT}`)
  process.exit(0)
}

rmSync(tmp, { recursive: true, force: true })
mkdirSync(tmp, { recursive: true })
if (!localZip) {
  zip = join(tmp, pick.asset.name)
  console.log(`Downloading ${pick.asset.name} (${pick.release})…`)
  const dl = await fetch(pick.asset.browser_download_url, { headers: { 'User-Agent': headers['User-Agent'] } })
  if (!dl.ok || !dl.body) throw new Error(`Download failed: ${dl.status}`)
  await pipeline(Readable.fromWeb(dl.body), createWriteStream(zip))
  if (statSync(zip).size !== pick.asset.size) throw new Error('Download was the wrong size.')
}

const unpacked = join(tmp, 'x')
mkdirSync(unpacked)
if (process.platform === 'win32') {
  const winTar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
  execFileSync(winTar, ['-xf', zip, '-C', unpacked])
} else execFileSync('unzip', ['-q', zip, '-d', unpacked])

// Only the server and the libraries it loads: the other llama tools aren't needed.
function walk(dir) {
  return readdirSync(dir).flatMap((e) => (statSync(join(dir, e)).isDirectory() ? walk(join(dir, e)) : [join(dir, e)]))
}
const files = walk(unpacked)
const server = files.find((f) => /llama-server\.exe$/i.test(f))
if (!server) throw new Error('llama-server.exe was not in the download.')
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const keep = files.filter((f) => f === server || /\.dll$/i.test(f) || /^license/i.test(f.split(/[\\/]/).pop()))
for (const f of keep) copyFileSync(f, join(OUT, f.split(/[\\/]/).pop()))
writeFileSync(versionFile, `${pick.release} ${pick.asset.name}\n`)
rmSync(tmp, { recursive: true, force: true })
console.log(`llama-server ${pick.release}: ${keep.length} files in ${OUT}`)
