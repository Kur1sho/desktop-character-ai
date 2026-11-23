// What every game in the game window gets: the character's voice, its brain, and small DOM helpers.
import { gameLine, type GameMoment } from '@shared/gameLines'
import type { Emotion } from '@shared/personas'
import type { AiJob } from './aiWorker'

export interface GameCtx {
  /** The character's name ("Robotico"). */
  name: string
  personaId: string
  /** Shows a line in the window and has the character say it on the desktop. */
  say(text: string, emotion?: Emotion): void
  /** A line for a moment in the game ("I win!"). Some moments only speak sometimes, so it isn't constant chatter. */
  react(moment: GameMoment, chance?: number): void
  /** Runs the character's thinking in the background. */
  think<T>(job: DistributiveOmit<AiJob, 'id'>): Promise<T>
  /** Saved between sessions on this PC (chips, difficulty). */
  load<T>(key: string, fallback: T): T
  save(key: string, value: unknown): void
}

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never

export type GameModule = (root: HTMLElement, ctx: GameCtx) => (() => void) | void

/** Makes an element: el('div', 'card red', 'text'). */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text) e.textContent = text
  return e
}

export function button(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = el('button', cls, label)
  b.addEventListener('click', onClick)
  return b
}

export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, (v: unknown) => void>()

export function think<T>(job: DistributiveOmit<AiJob, 'id'>): Promise<T> {
  if (!worker) {
    worker = new Worker(new URL('./aiWorker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<{ id: number; result: unknown }>) => {
      pending.get(e.data.id)?.(e.data.result)
      pending.delete(e.data.id)
    }
  }
  const id = nextId++
  return new Promise<T>((resolve) => {
    pending.set(id, resolve as (v: unknown) => void)
    worker!.postMessage({ ...job, id })
  })
}

export function lineFor(personaId: string, moment: GameMoment) {
  return gameLine(personaId, moment)
}
