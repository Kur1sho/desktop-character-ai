// Counts the things that unlock hats and colours. Kept on this PC only.
import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { EMPTY_PROGRESS, type Progress, type Stat } from '../shared/cosmetics'

interface Stored extends Progress {
  /** The last day the app was used (yyyy-mm-dd, local time). */
  lastDay: string
}

const file = () => join(app.getPath('userData'), 'progress.json')
let cache: Stored | null = null

function read(): Stored {
  if (cache) return cache
  let data: Stored = { ...EMPTY_PROGRESS, lastDay: '' }
  try {
    if (existsSync(file())) data = { ...data, ...(JSON.parse(readFileSync(file(), 'utf8')) as Partial<Stored>) }
  } catch (err) {
    console.error('Progress file unreadable, starting again:', err)
  }
  cache = data
  return data
}

function write(): void {
  if (!cache) return
  mkdirSync(dirname(file()), { recursive: true })
  writeFileSync(file(), JSON.stringify(cache, null, 2))
}

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Counts today as a day together. Returns true the first time it's called on a new day. */
export function markDay(): boolean {
  const data = read()
  const t = today()
  if (data.lastDay === t) return false
  data.lastDay = t
  data.days++
  write()
  return true
}

export function getProgress(): Progress {
  const { lastDay: _lastDay, ...p } = read()
  return p
}

const STATS: Stat[] = ['days', 'wins', 'dances', 'pats', 'pokes', 'chats']

export function recordStat(stat: unknown): Progress {
  if (typeof stat === 'string' && (STATS as string[]).includes(stat) && stat !== 'days') {
    const data = read()
    data[stat as Stat] = Math.min(1e6, (data[stat as Stat] ?? 0) + 1)
    write()
  }
  return getProgress()
}
