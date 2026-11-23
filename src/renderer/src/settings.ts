import type { CompanionApi } from '@shared/ipc'
import { PERSONAS } from '@shared/personas'
import { PROVIDERS, type ProviderId, type PublicSettings } from '@shared/settings'
import { ACTION_LABELS, ACTION_TYPES, CAN_ALWAYS_ALLOW } from '@shared/actions'
import { COLORS, EMPTY_PROGRESS, HATS, isUnlocked, unlockHint, type Progress } from '@shared/cosmetics'

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
const size = $<HTMLInputElement>('size')
const sizeValue = $<HTMLSpanElement>('sizeValue')
const miniMode = $<HTMLInputElement>('miniMode')
const chatter = $<HTMLSelectElement>('chatter')
const sitOnWindows = $<HTMLInputElement>('sitOnWindows')
const hideInGames = $<HTMLInputElement>('hideInGames')
const cursorPlay = $<HTMLInputElement>('cursorPlay')
const friend = $<HTMLInputElement>('friend')
const friendName = $<HTMLSpanElement>('friendName')
const hat = $<HTMLSelectElement>('hat')
const color = $<HTMLSelectElement>('color')

let current: PublicSettings
let progress: Progress = { ...EMPTY_PROGRESS }

/** Fills a hat or colour list; locked ones show how to unlock them. */
function fillLook(select: HTMLSelectElement, items: { id: string; label: string; needs?: Parameters<typeof unlockHint>[0] }[], value: string): void {
  select.replaceChildren(new Option("Character's own", 'auto'))
  for (const item of items) {
    const open = isUnlocked(item, progress)
    const o = new Option(open ? item.label : `🔒 ${item.label} (${unlockHint(item.needs!)})`, item.id)
    o.disabled = !open
    select.add(o)
  }
  select.value = value
  if (select.selectedIndex < 0 || select.selectedOptions[0]?.disabled) select.value = 'auto'
}

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
  model.placeholder = info.defaultModel === 'auto' ? 'auto (best for your PC)' : info.defaultModel
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
  size.value = String(current.size)
  sizeValue.textContent = `${Math.round(current.size * 100)}%`
  size.disabled = current.miniMode
  miniMode.checked = current.miniMode
  chatter.value = current.chatter
  sitOnWindows.checked = current.sitOnWindows
  hideInGames.checked = current.hideInGames
  cursorPlay.checked = current.cursorPlay
  friend.checked = current.friend
  friendName.textContent = PERSONAS.find((p) => p.id !== current.personaId)?.name ?? 'Suzu'
  fillLook(hat, HATS, current.hat)
  fillLook(color, COLORS, current.color)
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
size.addEventListener('input', () => {
  current.size = Number(size.value)
  sizeValue.textContent = `${Math.round(current.size * 100)}%`
})
miniMode.addEventListener('change', () => {
  current.miniMode = miniMode.checked
  render()
})
chatter.addEventListener('change', () => (current.chatter = chatter.value as typeof current.chatter))
sitOnWindows.addEventListener('change', () => (current.sitOnWindows = sitOnWindows.checked))
hideInGames.addEventListener('change', () => (current.hideInGames = hideInGames.checked))
cursorPlay.addEventListener('change', () => (current.cursorPlay = cursorPlay.checked))
friend.addEventListener('change', () => (current.friend = friend.checked))
hat.addEventListener('change', () => (current.hat = hat.value))
color.addEventListener('change', () => (current.color = color.value))
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

$('openLog').addEventListener('click', () => api.openActivityLog())

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

void Promise.all([api.getSettings(), api.getProgress()]).then(([s, p]) => {
  current = s
  progress = p
  render()
})
