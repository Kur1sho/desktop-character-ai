// Channel names and payloads shared by the main process, preload and renderer.
import type { Layout } from './layout'
import type { Emotion } from './personas'
import type { ProviderId, PublicSettings, Settings } from './settings'

export const IPC = {
  layout: 'companion:layout',
  setClickThrough: 'companion:set-click-through',
  loadModel: 'companion:load-model',
  getInitialModel: 'companion:get-initial-model',
  summon: 'companion:summon',
  openChat: 'companion:open-chat',
  listen: 'companion:listen',
  chat: 'companion:chat',
  chatPrepare: 'companion:chat-prepare',
  chatRecord: 'companion:chat-record',
  personaChanged: 'companion:persona-changed',
  settingsChanged: 'companion:settings-changed',
  getSettings: 'settings:get',
  saveSettings: 'settings:save',
  setApiKey: 'settings:set-key',
  clearMemory: 'settings:clear-memory',
  openSettings: 'settings:open'
} as const

export interface ChatReply {
  emotion: Emotion
  text: string
  error?: boolean
}

export interface CompanionApi {
  /** Let clicks pass through the window (true) or catch them (false). */
  setClickThrough(passThrough: boolean): void
  /** Called with the current layout, and again whenever the display changes. */
  onLayout(cb: (layout: Layout) => void): void
  /** Called when the user picks a VRM file from the tray menu. */
  onLoadModel(cb: (data: ArrayBuffer, name: string) => void): void
  /** Called when the character should pop up (tray click, later the wake word). */
  onSummon(cb: () => void): void
  /** Called when the user asks to type to the character (tray menu or hotkey). */
  onOpenChat(cb: () => void): void
  /** Called after any settings change is saved. */
  onSettingsChanged(cb: () => void): void
  /** Called when the user presses the talk hotkey. */
  onListen(cb: () => void): void
  /** Called when the chosen character changes in Settings. */
  onPersonaChanged(cb: (personaId: string) => void): void
  /** Returns the default VRM model if one is in assets/characters, or null. */
  getInitialModel(): Promise<{ data: ArrayBuffer; name: string } | null>
  /** Sends a message to the character and returns its reply. */
  chat(text: string): Promise<ChatReply>
  /** For the built-in brain: the system prompt and history to send, including the new message. */
  chatPrepare(text: string): Promise<{ system: string; history: { role: 'user' | 'assistant'; content: string }[] }>
  /** For the built-in brain: saves the exchange to local history. */
  chatRecord(userText: string, reply: string): Promise<void>
  getSettings(): Promise<PublicSettings>
  saveSettings(settings: Settings): Promise<void>
  /** Saves (or with null, removes) an API key. The key is encrypted and never sent back. */
  setApiKey(provider: ProviderId, key: string | null): Promise<void>
  clearMemory(): Promise<void>
  openSettings(): void
}
