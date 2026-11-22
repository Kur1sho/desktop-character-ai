// Keeps the recent conversation per character and sends it to the chosen AI.
// History is stored only on this PC.
import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getPersona, parseEmotion, systemPrompt } from '../../shared/personas'
import { modelFor, PROVIDERS } from '../../shared/settings'
import { getApiKey, getSettings } from '../settingsStore'
import { anthropicChat } from './anthropic'
import { ollamaChat } from './ollama'
import { openaiCompatibleChat } from './openaiCompatible'
import type { ChatTurn } from './types'
import type { ChatReply } from '../../shared/ipc'

const MAX_TURNS = 30


const historyFile = (personaId: string) => join(app.getPath('userData'), 'memory', `${personaId}.json`)

function loadHistory(personaId: string): ChatTurn[] {
  try {
    const f = historyFile(personaId)
    if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8')) as ChatTurn[]
  } catch {
    /* start fresh */
  }
  return []
}

function saveHistory(personaId: string, turns: ChatTurn[]): void {
  const f = historyFile(personaId)
  mkdirSync(join(f, '..'), { recursive: true })
  writeFileSync(f, JSON.stringify(turns.slice(-MAX_TURNS), null, 2))
}

export function clearHistory(personaId: string): void {
  saveHistory(personaId, [])
}

export async function chat(userText: string): Promise<ChatReply> {
  const settings = getSettings()
  const persona = getPersona(settings.personaId)
  const history = [...loadHistory(persona.id), { role: 'user' as const, content: userText }]
  const req = { system: systemPrompt(persona), history, model: modelFor(settings) }
  const info = PROVIDERS.find((p) => p.id === settings.provider)

  try {
    let raw: string
    if (settings.provider === 'ollama') {
      raw = await ollamaChat(req, settings.ollamaUrl)
    } else {
      const key = getApiKey(settings.provider)
      if (!key) {
        return { emotion: 'sad', text: `I need a ${info?.label ?? ''} API key first. Add one in Settings.`, error: true }
      }
      raw =
        settings.provider === 'anthropic'
          ? await anthropicChat(req, key)
          : await openaiCompatibleChat(settings.provider, req, key)
    }
    const reply = parseEmotion(raw)
    saveHistory(persona.id, [...history, { role: 'assistant', content: raw.trim() }])
    return reply
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Chat failed:', message)
    return { emotion: 'sad', text: message, error: true }
  }
}
