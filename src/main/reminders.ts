// Keeps timers, reminders and alarms, so they still go off after a restart.
// Saved only on this PC, in the app's own folder.
import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { MAX_AHEAD_MS, MISSED_GRACE_MS, type Reminder, type ReminderKind } from '../shared/reminders'
import { logConversation } from './conversationLog'

/** Checked at least this often, so a PC waking from sleep doesn't miss one for long. */
const CHECK_MS = 30_000
const MAX_SAVED = 100

let list: Reminder[] = []
let loaded = false
let timer: NodeJS.Timeout | null = null
let onDue: ((r: Reminder, late: boolean) => void) | null = null

const file = () => join(app.getPath('userData'), 'reminders.json')

function load(): void {
  if (loaded) return
  loaded = true
  try {
    const raw = JSON.parse(readFileSync(file(), 'utf8')) as unknown
    if (!Array.isArray(raw)) return
    list = raw
      .filter(
        (r): r is Reminder =>
          r && typeof r.id === 'string' && Number.isFinite(r.at) && ['timer', 'reminder', 'alarm'].includes(r.kind)
      )
      .map((r) => ({ id: r.id, at: r.at, kind: r.kind, label: typeof r.label === 'string' ? r.label.slice(0, 200) : '' }))
  } catch {
    list = []
  }
}

function save(): void {
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(file(), JSON.stringify(list, null, 2))
  } catch (err) {
    console.error('Could not save reminders:', err)
  }
}

function schedule(): void {
  if (timer) clearTimeout(timer)
  timer = null
  if (!onDue || !list.length) return
  const next = Math.min(...list.map((r) => r.at))
  timer = setTimeout(check, Math.max(0, Math.min(CHECK_MS, next - Date.now())))
}

function check(): void {
  const now = Date.now()
  const due = list.filter((r) => r.at <= now).sort((a, b) => a.at - b.at)
  if (due.length) {
    list = list.filter((r) => r.at > now)
    save()
    for (const r of due) {
      const lateBy = now - r.at
      // Missed while the app was closed (or the PC was asleep) for a long time.
      if (lateBy > MISSED_GRACE_MS) {
        logConversation(`Reminder dropped, it was due over 12 hours ago: ${r.kind} "${r.label}"`)
        continue
      }
      logConversation(`Reminder went off: ${r.kind}${r.label ? ` "${r.label}"` : ''}`)
      onDue?.(r, lateBy > 2 * 60_000)
    }
  }
  schedule()
}

/** Starts going off. Call once the companion window is ready to show them. */
export function startReminders(handler: (r: Reminder, late: boolean) => void): void {
  load()
  onDue = handler
  check()
}

export function addReminder(kind: ReminderKind, at: number, label: string): Reminder {
  load()
  const now = Date.now()
  const r: Reminder = { id: randomUUID(), at: Math.min(Math.max(at, now + 1000), now + MAX_AHEAD_MS), kind, label: label.slice(0, 200) }
  list = [...list, r].sort((a, b) => a.at - b.at).slice(0, MAX_SAVED)
  save()
  schedule()
  return r
}

export function listReminders(): Reminder[] {
  load()
  return [...list].sort((a, b) => a.at - b.at)
}

export function cancelReminders(ids: string[]): Reminder[] {
  load()
  const gone = list.filter((r) => ids.includes(r.id))
  if (gone.length) {
    list = list.filter((r) => !ids.includes(r.id))
    save()
    schedule()
  }
  return gone
}

/** Re-checks straight away (after the PC wakes up). */
export function checkReminders(): void {
  if (onDue) check()
}
