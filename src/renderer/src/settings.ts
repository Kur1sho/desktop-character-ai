import type { CompanionApi } from '@shared/ipc'
import { PERSONAS } from '@shared/personas'
import { PROVIDERS, type ProviderId, type PublicSettings } from '@shared/settings'

const api = (window as unknown as { companion: CompanionApi }).companion
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const persona = $<HTMLSelectElement>('persona')
const personaHint = $<HTMLParagraphElement>('personaHint')
const provider = $<HTMLSelectElement>('provider')
const model = $<HTMLInputElement>('model')
const modelHint = $<HTMLParagraphElement>('modelHint')
const ollamaBox = $<HTMLDivElement>('ollamaBox')
const ollamaUrl = $<HTMLInputElement>('ollamaUrl')
const keyBox = $<HTMLDivElement>('keyBox')
const key = $<HTMLInputElement>('key')
const keyHint = $<HTMLParagraphElement>('keyHint')
const status = $<HTMLSpanElement>('status')
const voiceOutput = $<HTMLInputElement>('voiceOutput')
const sttSize = $<HTMLSelectElement>('sttSize')

let current: PublicSettings

for (const p of PERSONAS) persona.add(new Option(p.name, p.id))
for (const p of PROVIDERS) provider.add(new Option(p.label, p.id))

function flash(text: string): void {
  status.textContent = text
  window.setTimeout(() => (status.textContent = ''), 3000)
}

function render(): void {
  persona.value = current.personaId
  personaHint.textContent = PERSONAS.find((p) => p.id === current.personaId)?.tagline ?? ''
  provider.value = current.provider
  const info = PROVIDERS.find((p) => p.id === current.provider)!
  model.value = current.models[current.provider] ?? ''
  model.placeholder = info.defaultModel
  modelHint.textContent = info.modelHint
  ollamaBox.style.display = current.provider === 'ollama' ? '' : 'none'
  ollamaUrl.value = current.ollamaUrl
  keyBox.style.display = info.needsKey ? '' : 'none'
  key.value = ''
  key.placeholder = current.hasKey[current.provider] ? 'Saved (hidden). Paste a new one to replace it.' : 'Paste your key'
  keyHint.textContent = info.keyUrl ? `Get a key at ${info.keyUrl}` : ''
  voiceOutput.checked = current.voiceOutput
  sttSize.value = current.sttSize
}

persona.addEventListener('change', () => {
  current.personaId = persona.value
  render()
})
provider.addEventListener('change', () => {
  current.provider = provider.value as ProviderId
  render()
})
model.addEventListener('input', () => {
  current.models[current.provider] = model.value
})
voiceOutput.addEventListener('change', () => {
  current.voiceOutput = voiceOutput.checked
})
sttSize.addEventListener('change', () => {
  current.sttSize = sttSize.value as typeof current.sttSize
})
ollamaUrl.addEventListener('input', () => {
  current.ollamaUrl = ollamaUrl.value
})

$('removeKey').addEventListener('click', async () => {
  await api.setApiKey(current.provider, null)
  current = await api.getSettings()
  render()
  flash('Key removed.')
})

$('clearMemory').addEventListener('click', async () => {
  await api.clearMemory()
  flash('Conversation history wiped.')
})

$('save').addEventListener('click', async () => {
  try {
    if (key.value.trim()) await api.setApiKey(current.provider, key.value.trim())
    const { hasKey: _hasKey, ...settings } = current
    await api.saveSettings(settings)
    current = await api.getSettings()
    render()
    flash('Saved.')
  } catch (err) {
    flash(String(err))
  }
})

void api.getSettings().then((s) => {
  current = s
  render()
})
