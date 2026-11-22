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
    defaultModel: 'onnx-community/gemma-3-1b-it-ONNX',
    modelHint: 'Runs on your PC. Downloads about 1 GB the first time, then works offline.'
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
  sttSize: 'base'
}

export function modelFor(settings: Settings): string {
  const info = PROVIDERS.find((p) => p.id === settings.provider)
  return settings.models[settings.provider]?.trim() || info?.defaultModel || ''
}
