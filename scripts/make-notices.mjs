// Writes build/THIRD_PARTY_NOTICES.txt: the licences of everything the app ships
// (libraries in the installer, libraries bundled into its pages, the word list
// and llama-server), plus the models it downloads on first use. The installer
// copies it next to the app.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const lock = JSON.parse(readFileSync('package-lock.json', 'utf8')).packages
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))

/** Libraries bundled into the app's pages (devDependencies only because they're bundled). */
const BUNDLED = ['three', '@pixiv/three-vrm', 'chess.js', '@huggingface/transformers', 'onnxruntime-web']

// Everything the shipped code needs: dependencies, the bundled libraries, and theirs.
const want = new Set()
/** Node-only parts of the bundled libraries, which aren't in the app's pages. */
const NOT_SHIPPED = /^(sharp|@img\/|onnxruntime-node)/
function add(name, from = '') {
  if (NOT_SHIPPED.test(name)) return
  // npm's lookup: nested first, then the top level.
  const key = [from && `${from}/node_modules/${name}`, `node_modules/${name}`].find((k) => k && lock[k])
  if (!key || want.has(key)) return
  if (!existsSync(key)) return // an optional package for another platform
  want.add(key)
  for (const dep of Object.keys({ ...lock[key].dependencies, ...lock[key].optionalDependencies })) add(dep, key)
}
for (const name of [...Object.keys(pkg.dependencies), ...BUNDLED]) add(name)

function licenceText(dir) {
  const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying|notice)(\.|$|-)/i.test(f))
  return file ? readFileSync(join(dir, file), 'utf8').trim() : null
}

const parts = [
  'Desktop Companion: third-party notices',
  '======================================',
  '',
  'Desktop Companion is made by Kur1sho. It includes or downloads the following',
  "third-party software and data, under their own licences. Electron's and",
  "Chromium's licences are in LICENSE.electron.txt and LICENSES.chromium.html",
  'in the install folder.',
  ''
]

const sorted = [...want].sort((a, b) => a.split('node_modules/').pop().localeCompare(b.split('node_modules/').pop()))
const seen = new Set()
for (const key of sorted) {
  const meta = JSON.parse(readFileSync(join(key, 'package.json'), 'utf8'))
  const id = `${meta.name}@${meta.version}`
  if (seen.has(id)) continue
  seen.add(id)
  const text = licenceText(key)
  const licence = typeof meta.license === 'string' ? meta.license : meta.license?.type ?? 'see below'
  parts.push('-'.repeat(78), `${id} (${licence})`, meta.homepage ? meta.homepage : '', '', text ?? `Licensed under ${licence}.`, '')
}

// The spelling word list (SCOWL): its notice is the header of the generated file.
const words = readFileSync(join('src', 'shared', 'spelling', 'words.ts'), 'utf8')
const scowl = words
  .split('\n')
  .filter((l) => l.startsWith('//'))
  .map((l) => l.replace(/^\/\/ ?/, ''))
  .join('\n')
  .trim()
parts.push('-'.repeat(78), 'SCOWL word lists (spelling fixes)', 'http://wordlist.aspell.net/', '', scowl, '')

parts.push(
  '-'.repeat(78),
  'Silero VAD v5 (MIT), speech detection model',
  'https://github.com/snakers4/silero-vad',
  '',
  'MIT License. Copyright (c) 2020-present Silero Team.',
  '',
  'Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated',
  'documentation files (the "Software"), to deal in the Software without restriction, including without limitation',
  'the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and',
  'to permit persons to whom the Software is furnished to do so, subject to the following conditions:',
  '',
  'The above copyright notice and this permission notice shall be included in all copies or substantial portions',
  'of the Software.',
  '',
  'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED',
  'TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL',
  'THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF',
  'CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER',
  'DEALINGS IN THE SOFTWARE.',
  ''
)

const llama = join('build', 'llama-server')
if (existsSync(llama)) {
  const version = existsSync(join(llama, 'VERSION')) ? readFileSync(join(llama, 'VERSION'), 'utf8').trim() : ''
  parts.push('-'.repeat(78), `llama.cpp llama-server ${version} (MIT)`, 'https://github.com/ggml-org/llama.cpp', '', licenceText(llama) ?? 'MIT License, Copyright (c) 2023-2026 The ggml authors.', '')
}

parts.push(
  '-'.repeat(78),
  'Models downloaded on first use (not included in the installer)',
  '',
  '- Whisper speech recognition (tiny.en, base.en, small.en), ONNX versions by onnx-community: MIT (OpenAI).',
  '- Qwen3 language models (0.6B to 14B, GGUF and ONNX) and Qwen3-VL-4B vision model: Apache License 2.0 (Alibaba Cloud).',
  "- Gemma 3 1B (ONNX), if picked: Gemma Terms of Use (https://ai.google.dev/gemma/terms), including Google's Prohibited Use Policy.",
  ''
)

writeFileSync(join('build', 'THIRD_PARTY_NOTICES.txt'), parts.join('\n'))
console.log(`Wrote build/THIRD_PARTY_NOTICES.txt (${seen.size} packages)`)
