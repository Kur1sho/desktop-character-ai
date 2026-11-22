// Keeps the recent conversation per character and sends it to the chosen AI.
// History is stored only on this PC.
import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getPersona, parseEmotion, systemPrompt } from '../../shared/personas'
import { shortenReply } from '../../shared/brevity'
import { modelFor, PROVIDERS } from '../../shared/settings'
import { getApiKey, getSettings } from '../settingsStore'
import { anthropicChat } from './anthropic'
import { ollamaChat } from './ollama'
import { openaiCompatibleChat } from './openaiCompatible'
import type { ChatTurn } from './types'
import { maxTokensFor, stripThinking } from '../../shared/brainModels'
import { nativeChat } from '../brain/nativeBrain'
import { captureScreen, lookAndAnswer, type VisionStatus } from '../brain/vision'
import { extractActions } from '../../shared/actions'
import { SCREEN_MAX_TOKENS } from '../../shared/screen'
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

/** The system prompt and history (with the new message) for the current character. */
export function prepare(userText: string, oneOff = false): { system: string; history: ChatTurn[] } {
  const persona = getPersona(getSettings().personaId)
  const past = oneOff ? [] : loadHistory(persona.id)
  return { system: systemPrompt(persona), history: [...past, { role: 'user', content: userText }] }
}

/** Saves an exchange that was answered outside the main process (the built-in brain). */
export function record(userText: string, reply: string): void {
  const persona = getPersona(getSettings().personaId)
  saveHistory(persona.id, [
    ...loadHistory(persona.id),
    { role: 'user', content: userText },
    { role: 'assistant', content: reply.trim() }
  ])
}

/** oneOff: a single job that neither sees nor joins the chat history (small models copy old answers). */
export async function chat(userText: string, oneOff = false): Promise<ChatReply> {
  const settings = getSettings()
  const persona = getPersona(settings.personaId)
  const history = [...(oneOff ? [] : loadHistory(persona.id)), { role: 'user' as const, content: userText }]
  const req = { system: systemPrompt(persona), history, model: modelFor(settings) }
  const info = PROVIDERS.find((p) => p.id === settings.provider)

  try {
    let raw: string
    if (settings.provider === 'builtin') {
      // llama.cpp in its own process. (If it can't run here, the window uses its own brain instead.)
      raw = stripThinking(await nativeChat(req.system, history, maxTokensFor(userText)))
    } else if (settings.provider === 'ollama') {
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
    // Short replies, saved short too, so the model keeps to the same length.
    const short = shortenReply(raw, userText)
    const reply = parseEmotion(short)
    if (!oneOff) saveHistory(persona.id, [...history, { role: 'assistant', content: short }])
    return reply
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Chat failed:', message)
    return { emotion: 'sad', text: message, error: true }
  }
}

const SEEING_RULES = `
You can see the user's screen: it's in the picture with their message. Answer about what's actually on it.
Read any text that matters (errors, settings, game hints) and be specific. If you can't make something out, say so.
Don't use action tags here.`

/**
 * Looks at the screen and answers a question about it, in character. The
 * screenshot is only kept in memory for this one question.
 */
export async function lookAtScreen(userText: string, status: VisionStatus): Promise<ChatReply> {
  const persona = getPersona(getSettings().personaId)
  try {
    const image = await captureScreen()
    const raw = await lookAndAnswer(systemPrompt(persona) + SEEING_RULES, userText, image, SCREEN_MAX_TOKENS, status)
    // Nothing the vision brain says gets to run actions.
    const said = extractActions(stripThinking(raw)).text
    const short = shortenReply(said, userText, true)
    saveHistory(persona.id, [
      ...loadHistory(persona.id),
      { role: 'user', content: `${userText} (you looked at my screen)` },
      { role: 'assistant', content: short }
    ])
    return parseEmotion(short)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Looking failed:', message)
    return { emotion: 'sad', text: message, error: true }
  }
}
