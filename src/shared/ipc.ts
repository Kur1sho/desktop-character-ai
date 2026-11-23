// Channel names and payloads shared by the main process, preload and renderer.
import type { Action, ActionResult } from './actions'
import type { Layout } from './layout'
import type { Emotion } from './personas'
import type { Reminder } from './reminders'
import type { Presence } from './chatter'
import type { Progress, Stat } from './cosmetics'
import type { WinRect } from './perch'
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
  openSettings: 'settings:open',
  runAction: 'actions:run',
  readClipboard: 'actions:read-clipboard',
  logConversation: 'log:conversation',
  openConversationLog: 'log:open-conversation',
  openActivityLog: 'actions:open-log',
  brainWarmUp: 'brain:warm-up',
  brainProgress: 'brain:progress',
  lookAtScreen: 'vision:look',
  visionStatus: 'vision:status',
  reminderDue: 'reminders:due',
  listReminders: 'reminders:list',
  cancelReminders: 'reminders:cancel',
  openGames: 'games:open',
  openGame: 'games:show',
  gameSay: 'games:say',
  presence: 'life:presence',
  listWindows: 'life:windows',
  recordStat: 'life:stat',
  getProgress: 'life:progress',
  firstToday: 'life:first-today'
} as const

export interface AskOptions {
  oneOff?: boolean
}

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
  /** oneOff: a single job (like translating copied text) that ignores and doesn't join the chat history. */
  chat(text: string, opts?: AskOptions): Promise<ChatReply>
  /** For the built-in brain: the system prompt and history to send, including the new message. */
  chatPrepare(text: string, opts?: AskOptions): Promise<{ system: string; history: { role: 'user' | 'assistant'; content: string }[] }>
  /** For the built-in brain: saves the exchange to local history. */
  chatRecord(userText: string, reply: string): Promise<void>
  getSettings(): Promise<PublicSettings>
  saveSettings(settings: Settings): Promise<void>
  /** Saves (or with null, removes) an API key. The key is encrypted and never sent back. */
  setApiKey(provider: ProviderId, key: string | null): Promise<void>
  clearMemory(): Promise<void>
  openSettings(): void
  /** Runs an action the user has confirmed. The main process checks it again first. */
  runAction(action: Action, source: 'user' | 'ai'): Promise<ActionResult>
  /** The text the user copied. Only called when they ask about it. */
  readClipboard(): Promise<string>
  /** Adds a line to the conversation log (what was heard and decided). */
  logConversation(line: string): void
  /** Opens the conversation log. */
  openConversationLog(): void
  /** Opens the log of everything the character has done. */
  openActivityLog(): void
  /**
   * Downloads (first time only) and loads the built-in brain with llama.cpp.
   * 'web' means llama.cpp can't run on this PC, so the window's own brain is used.
   */
  brainWarmUp(): Promise<{ mode: 'native' | 'web'; error?: string }>
  /** Download progress for brainWarmUp, 0 to 100. */
  onBrainProgress(cb: (percent: number) => void): void
  /** Looks at the screen (only now, never saved) and answers a question about it. */
  lookAtScreen(text: string): Promise<ChatReply>
  /** "Downloading my eyes… 40%", "Looking…" while lookAtScreen works. */
  onVisionStatus(cb: (text: string) => void): void
  /** A timer, reminder or alarm going off. `late` means it was missed while the app was closed. */
  onReminderDue(cb: (r: Reminder, late: boolean) => void): void
  /** Timers, reminders and alarms still to come, soonest first. */
  listReminders(): Promise<Reminder[]>
  /** Cancels these (by id) and returns the ones that were cancelled. */
  cancelReminders(ids: string[]): Promise<Reminder[]>
  /** Opens the game window, on one game ('chess', 'poker', ...) or the menu. */
  openGames(game?: string): void
  /** Game window: called when it should switch to a game ('' for the menu). */
  onOpenGame(cb: (game: string) => void): void
  /** Game window: the character says this on the desktop. */
  gameSay(text: string, emotion: Emotion): void
  /** Companion window: a line from the game window to say. */
  onGameSay(cb: (text: string, emotion: Emotion) => void): void
  /** Every couple of seconds: how long since the mouse or keyboard was used, and any Steam game running. */
  onPresence(cb: (p: Presence) => void): void
  /** Other windows on screen, front first, so the character can sit on them. Empty if not possible. */
  listWindows(): Promise<WinRect[]>
  /** Counts a pat, a win, a dance... towards unlocking hats and colours. */
  recordStat(stat: Stat): Promise<Progress>
  getProgress(): Promise<Progress>
  /** True the first time the app starts on a new day (for the greeting). */
  firstToday(): Promise<boolean>
}
