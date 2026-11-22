// Messages between the main process and the llama.cpp brain process.
import type { Hardware } from '../../shared/brainPick'

export type Turn = { role: 'user' | 'assistant'; content: string }

export type HostIn =
  | { type: 'init'; gpu: boolean }
  | { type: 'load'; uri: string; gpu: boolean; directory: string }
  | { type: 'preload'; system: string }
  | { type: 'chat'; id: number; system: string; history: Turn[]; maxTokens: number }

export type HostOut =
  | { type: 'hardware'; hw: Hardware }
  | { type: 'progress'; percent: number }
  /** The file is on disk; loading it into memory starts now. */
  | { type: 'downloaded' }
  | { type: 'preloaded' }
  | { type: 'loaded' }
  | { type: 'result'; id: number; text: string }
  | { type: 'error'; id?: number; stage: HostIn['type']; message: string }
