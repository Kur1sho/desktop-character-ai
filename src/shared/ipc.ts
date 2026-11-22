// Channel names and payloads shared by the main process, preload and renderer.
import type { Layout } from './layout'

export const IPC = {
  layout: 'companion:layout',
  setClickThrough: 'companion:set-click-through',
  loadModel: 'companion:load-model',
  getInitialModel: 'companion:get-initial-model',
  summon: 'companion:summon'
} as const

export interface CompanionApi {
  /** Let clicks pass through the window (true) or catch them (false). */
  setClickThrough(passThrough: boolean): void
  /** Called with the current layout, and again whenever the display changes. */
  onLayout(cb: (layout: Layout) => void): void
  /** Called when the user picks a VRM file from the tray menu. */
  onLoadModel(cb: (data: ArrayBuffer, name: string) => void): void
  /** Called when the character should pop up (tray click, later the wake word). */
  onSummon(cb: () => void): void
  /** Returns the default VRM model if one is in assets/characters, or null. */
  getInitialModel(): Promise<{ data: ArrayBuffer; name: string } | null>
}
