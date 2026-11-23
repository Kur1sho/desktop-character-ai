import type { ActionType } from './actions'
export type ProviderId = 'builtin' | 'ollama' | 'anthropic' | 'openai' | 'openrouter' | 'gemini'

export interface ProviderInfo {
  id: ProviderId
  label: string
  needsKey: boolean
  defaultModel: string
  /** Shown under the model box to help people pick. */
  modelHint: string
  keyUrl?: string
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'builtin',
    label: 'Built-in (free, private, works offline)',
    needsKey: false,
    defaultModel: 'auto',
    modelHint:
      'Runs on your PC and works offline. "auto" picks the biggest brain your PC can run: Qwen3 14B or 8B on a strong graphics card, otherwise Qwen3 4B (downloaded once). To choose one yourself, type an hf: link or a .gguf file.'
  },
  {
    id: 'ollama',
    label: 'Local (Ollama, free and private)',
    needsKey: false,
    defaultModel: 'gemma3:4b',
    modelHint: 'Install Ollama, then run "ollama pull gemma3:4b". Bigger models sound better but need a stronger PC.'
  },
  {
    id: 'anthropic',
    label: 'Claude (Anthropic)',
    needsKey: true,
    defaultModel: 'claude-opus-5-5',
    modelHint: 'claude-opus-5-5 is the best. claude-haiku-5-5 is much cheaper and faster.',
    keyUrl: 'https://platform.claude.com/'
  },
  {
    id: 'openai',
    label: 'OpenAI',
    needsKey: true,
    defaultModel: 'gpt-5-mini',
    modelHint: 'Any OpenAI chat model name.',
    keyUrl: 'https://platform.openai.com/api-keys'
  },
  {
    id: 'openrouter',
    label: 'OpenRouter (many models, one key)',
    needsKey: true,
    defaultModel: 'google/gemma-3-27b-it',
    modelHint: 'Any model ID from openrouter.ai/models.',
    keyUrl: 'https://openrouter.ai/keys'
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    needsKey: true,
    defaultModel: 'gemini-2.5-flash',
    modelHint: 'Any Gemini model name.',
    keyUrl: 'https://aistudio.google.com/apikey'
  }
]

export interface Settings {
  personaId: string
  provider: ProviderId
  /** Model name per provider, so switching back and forth keeps your choice. */
  models: Partial<Record<ProviderId, string>>
  ollamaUrl: string
  /** Speak replies out loud. */
  voiceOutput: boolean
  /** Listen for "Hey <name>" all the time (processed locally). */
  wakeWord: boolean
  /** Speech recognition model size: bigger is more accurate but slower. */
  sttSize: 'tiny' | 'base' | 'small'
  /** The one-time setup (downloading and preparing the local models) has finished. */
  setupDone: boolean
  /** Kinds of action that run without asking each time. Empty by default. */
  alwaysAllow: ActionType[]
  /** Do simple actions (everything except opening websites) without asking. */
  autoApprove: boolean
  /** The user has been asked about autoApprove once. */
  autoApproveAsked: boolean
  /** How big the character is, 0.5 to 1.6 times normal. */
  size: number
  /** Tiny and tucked away; the size slider is ignored while it's on. */
  miniMode: boolean
  /** How often the character speaks up by itself. */
  chatter: 'off' | 'rare' | 'normal'
  /** The character plays with the mouse pointer now and then. */
  cursorPlay: boolean
  /** Dropped on a window, the character sits on top of it. */
  sitOnWindows: boolean
  /** Hide while a Steam game is running. */
  hideInGames: boolean
  /** 'auto' wears the character's own; otherwise a hat or colour id from cosmetics. */
  hat: string
  color: string
  /** The other character comes too. */
  friend: boolean
}

/** Mini mode's size. */
export const MINI_SIZE = 0.5

export function characterScale(s: Pick<Settings, 'size' | 'miniMode'>): number {
  if (s.miniMode) return MINI_SIZE
  return Number.isFinite(s.size) ? Math.min(1.6, Math.max(0.5, s.size)) : 1
}

/** What the settings screen sees. Keys never leave the main process; only whether one is saved. */
export interface PublicSettings extends Settings {
  hasKey: Partial<Record<ProviderId, boolean>>
}

export const DEFAULT_SETTINGS: Settings = {
  personaId: 'robotico',
  provider: 'builtin',
  models: {},
  ollamaUrl: 'http://127.0.0.1:11434',
  voiceOutput: true,
  wakeWord: true,
  sttSize: 'base',
  setupDone: false,
  alwaysAllow: [],
  autoApprove: false,
  autoApproveAsked: false,
  size: 1,
  miniMode: false,
  chatter: 'rare',
  cursorPlay: false,
  sitOnWindows: true,
  hideInGames: true,
  hat: 'auto',
  color: 'auto',
  friend: false
}

export function modelFor(settings: Settings): string {
  const info = PROVIDERS.find((p) => p.id === settings.provider)
  return settings.models[settings.provider]?.trim() || info?.defaultModel || ''
}
