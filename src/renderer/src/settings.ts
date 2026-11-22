import type { CompanionApi } from '@shared/ipc'
import { PERSONAS } from '@shared/personas'
import { PROVIDERS, type ProviderId, type PublicSettings } from '@shared/settings'
import { ACTION_LABELS, ACTION_TYPES, CAN_ALWAYS_ALLOW } from '@shared/actions'

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
const wakeWord = $<HTMLInputElement>('wakeWord')
const wakeName = $<HTMLSpanElement>('wakeName')
const alwaysAllow = $<HTMLDivElement>('alwaysAllow')
const alwaysAllowBox = $<HTMLDivElement>('alwaysAllowBox')
const autoApprove = $<HTMLInputElement>('autoApprove')
const spotifyState = $<HTMLParagraphElement>('spotifyState')
const spotifySetup = $<HTMLDetailsElement>('spotifySetup')
const spotifyClientId = $<HTMLInputElement>('spotifyClientId')
const spotifyConnect = $<HTMLButtonElement>('spotifyConnect')

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
  wakeWord.checked = current.wakeWord
  wakeName.textContent = PERSONAS.find((p) => p.id === current.personaId)?.name ?? 'Robotico'
  sttSize.value = current.sttSize
  autoApprove.checked = current.autoApprove
  spotifyClientId.value = current.spotifyClientId
  spotifySetup.style.display = current.spotifyConnected ? 'none' : ''
  spotifyConnect.textContent = current.spotifyConnected ? 'Disconnect Spotify' : 'Connect Spotify'
  spotifyState.textContent = current.spotifyConnected
    ? 'Connected. "Play lofi" plays it straight away.'
    : 'Not connected: "play lofi" opens the search in Spotify. Connect it so your character can press play (needs Spotify Premium).'
  alwaysAllowBox.style.display = current.autoApprove ? 'none' : ''
  alwaysAllow.replaceChildren(
    ...ACTION_TYPES.filter((t) => CAN_ALWAYS_ALLOW.has(t)).map((t) => {
      const label = document.createElement('label')
      const box = document.createElement('input')
      box.type = 'checkbox'
      box.style.cssText = 'width: auto; margin-right: 6px'
      box.checked = current.alwaysAllow.includes(t)
      box.addEventListener('change', () => {
        current.alwaysAllow = box.checked
          ? [...new Set([...current.alwaysAllow, t])]
          : current.alwaysAllow.filter((x) => x !== t)
      })
      label.append(box, ACTION_LABELS[t])
      return label
    })
  )
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
wakeWord.addEventListener('change', () => {
  current.wakeWord = wakeWord.checked
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

autoApprove.addEventListener('change', () => {
  current.autoApprove = autoApprove.checked
  current.autoApproveAsked = true
  render()
})

spotifyConnect.addEventListener('click', async () => {
  try {
    if (current.spotifyConnected) {
      await api.spotifyDisconnect()
      flash('Spotify disconnected.')
    } else {
      flash('Approve it in your browser…')
      await api.spotifyConnect(spotifyClientId.value)
      flash('Spotify connected!')
    }
    const fresh = await api.getSettings()
    current.spotifyConnected = fresh.spotifyConnected
    current.spotifyClientId = fresh.spotifyClientId
    render()
  } catch (err) {
    flash(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err))
  }
})

$('openLog').addEventListener('click', () => api.openActivityLog())

$('clearMemory').addEventListener('click', async () => {
  await api.clearMemory()
  flash('Conversation history wiped.')
})

$('save').addEventListener('click', async () => {
  try {
    if (key.value.trim()) await api.setApiKey(current.provider, key.value.trim())
    const { hasKey: _hasKey, spotifyConnected: _sc, ...settings } = current
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
