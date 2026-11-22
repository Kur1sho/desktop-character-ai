// The welcome screen: one button per account, plus the "don't keep asking" switch.
import { CONNECTIONS, type ConnectionInfo } from '@shared/connections'
import type { CompanionApi } from '@shared/ipc'
import { getPersona } from '@shared/personas'
import type { PublicSettings } from '@shared/settings'

const api = (window as unknown as { companion: CompanionApi }).companion
const grid = document.getElementById('grid') as HTMLDivElement
const autoApprove = document.getElementById('autoApprove') as HTMLInputElement
let current: PublicSettings

function isConnected(c: ConnectionInfo): boolean {
  return Boolean(c.noSignIn)
}

function tile(c: ConnectionInfo): HTMLElement {
  const el = document.createElement('div')
  el.className = 'tile'
  el.innerHTML = `<div class="top"><div class="badge"></div><div class="name"></div></div><div class="blurb"></div><button></button><div class="err"></div>`
  const badge = el.querySelector('.badge') as HTMLDivElement
  badge.style.background = c.color
  badge.textContent = c.name[0]
  ;(el.querySelector('.name') as HTMLDivElement).textContent = c.name
  ;(el.querySelector('.blurb') as HTMLDivElement).textContent = c.blurb
  const button = el.querySelector('button') as HTMLButtonElement
  const err = el.querySelector('.err') as HTMLDivElement

  const paint = () => {
    const on = isConnected(c)
    button.disabled = !c.available || Boolean(c.noSignIn)
    button.classList.toggle('connected', on)
    button.textContent = !c.available ? 'Coming soon' : c.noSignIn ? 'Ready ✓' : on ? 'Connected ✓' : 'Connect'
  }
  paint()

  button.addEventListener('click', () => {
    // Accounts that need signing in get their one-click connect here as they're added.
    err.textContent = ''
  })
  return el
}

document.getElementById('done')!.addEventListener('click', async () => {
  const fresh = await api.getSettings()
  const { hasKey: _k, ...settings } = fresh
  await api.saveSettings({ ...settings, autoApprove: autoApprove.checked, autoApproveAsked: true })
  window.close()
})

void api.getSettings().then((s) => {
  current = s
  const name = getPersona(s.personaId).name
  document.getElementById('title')!.textContent = `Welcome! Let's set up ${name}`
  document.getElementById('autoLabel')!.textContent = `Let ${name} do simple things without asking`
  if (s.autoApproveAsked) autoApprove.checked = s.autoApprove
  grid.replaceChildren(...CONNECTIONS.map(tile))
})
