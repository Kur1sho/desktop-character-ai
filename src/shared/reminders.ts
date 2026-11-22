// Understands reminders, alarms and timers in plain words ("remind me at 6pm
// to call mum", "wake me up tomorrow at 7", "cancel my timer"), and words the
// replies about them. No Electron or Node code, so it can be tested on its own.

export type ReminderKind = 'timer' | 'reminder' | 'alarm'

export interface Reminder {
  id: string
  /** When it goes off (ms since 1970). */
  at: number
  kind: ReminderKind
  /** What it's for ("call your mum"), or '' for none. */
  label: string
}

/** How far ahead a reminder can be set. */
export const MAX_AHEAD_MS = 366 * 24 * 60 * 60 * 1000
/** A reminder missed while the app was closed still goes off if it's no older than this. */
export const MISSED_GRACE_MS = 12 * 60 * 60 * 1000

const DAY_MS = 24 * 60 * 60 * 1000
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const HOUR_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12
}
const MINUTE_WORDS: Record<string, number> = {
  'o five': 5, ten: 10, fifteen: 15, twenty: 20, 'twenty five': 25, thirty: 30, 'thirty five': 35, forty: 40,
  'forty five': 45, fifty: 50, 'fifty five': 55
}

/** Speech-to-text writes times in many ways: "6 p.m.", "6 o'clock", "18.30". */
export function normalizeTimes(t: string): string {
  return t
    .toLowerCase()
    .replace(/[“”"]/g, '')
    .replace(/’/g, "'")
    .replace(/\b([ap])\.\s?m\b\.?/g, '$1m')
    .replace(/[!?]+$|\.+$/g, '')
    .replace(/\b(\d{1,2})\.(\d{2})\b/g, '$1:$2')
    .replace(/\s*o'?clock\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

type Part = 'morning' | 'afternoon' | 'evening' | 'night'

interface When {
  at: number
  /** The text with the time taken out. */
  rest: string
  /** Said as a length of time ("in 20 minutes") rather than a clock time. */
  relative: boolean
}

const HOUR = String.raw`(\d{1,2}|${Object.keys(HOUR_WORDS).join('|')})`
const PREP = String.raw`(?:(?:at|for|by|around|on|until|til|till) )?`

function hourOf(s: string): number {
  return /^\d/.test(s) ? Number(s) : HOUR_WORDS[s]
}

/** Finds a time in the text ("at 6pm", "tomorrow morning", "in 20 minutes") and works out when that is. */
export function findWhen(
  text: string,
  now: Date,
  parseDuration: (s: string) => number | null,
  /** Alarms: "tomorrow at 6" means 6 in the morning. */
  morningFirst = false
): When | null {
  let t = ` ${normalizeTimes(text)} `
  const take = (re: RegExp): RegExpMatchArray | null => {
    const m = t.match(re)
    if (m) t = t.replace(m[0], ' ')
    return m
  }
  const finish = (at: number, relative: boolean): When => ({ at, rest: t.replace(/\s+/g, ' ').trim(), relative })

  // "in 20 minutes", "in an hour and a half", "in 2 days"
  const rel = take(
    /\s(?:in|for) (half an? hour|an? hour and a half|(?:\d+(?:\.\d+)?|an?|[a-z]+) (?:hours?|hrs?|minutes?|mins?|seconds?|secs?|days?|weeks?)(?: and (?:a half|\d+ (?:minutes?|mins?|seconds?|secs?)|[a-z]+ (?:minutes?|mins?|seconds?)))?)(?=\s)/
  )
  if (rel) {
    const days = rel[1].match(/^(\d+|an?|[a-z]+) (days?|weeks?)$/)
    const n = days ? (/^\d/.test(days[1]) ? Number(days[1]) : days[1].startsWith('a') ? 1 : HOUR_WORDS[days[1]]) : 0
    const ms = days ? (n ? n * (days[2].startsWith('w') ? 7 : 1) * DAY_MS : 0) : (parseDuration(rel[1]) ?? 0) * 1000
    return ms > 0 ? finish(now.getTime() + ms, true) : null
  }

  // The day: "today", "tonight", "tomorrow morning", "on friday", "this evening"
  let dayOffset: number | null = null
  let part: Part | null = null
  let explicitToday = false
  const dayM = take(
    new RegExp(
      String.raw`\s${PREP}(today|tonight|this (morning|afternoon|evening)|tomorrow(?: (morning|afternoon|evening|night))?|(?:next |this )?(${WEEKDAYS.join('|')})(?: (morning|afternoon|evening|night))?)(?=\s)`
    )
  )
  if (dayM) {
    const w = dayM[1]
    if (w === 'today') (dayOffset = 0), (explicitToday = true)
    else if (w === 'tonight') (dayOffset = 0), (part = 'night'), (explicitToday = true)
    else if (w.startsWith('this ') && dayM[2]) (dayOffset = 0), (part = dayM[2] as Part), (explicitToday = true)
    else if (w.startsWith('tomorrow')) (dayOffset = 1), (part = (dayM[3] as Part) ?? null)
    else if (dayM[4]) {
      const target = WEEKDAYS.indexOf(dayM[4])
      dayOffset = (target - now.getDay() + 7) % 7 || 7
      part = (dayM[5] as Part) ?? null
    }
  }
  // "in the morning", "this evening" after the time
  const partM = take(/\s(?:in the (morning|afternoon|evening)|at night)(?=\s)/)
  if (partM) part = (partM[1] as Part) ?? 'night'

  // The clock time: "6pm", "at 6:30", "18:30", "noon", "half past 6", "quarter to 7", "six thirty"
  let hour: number | null = null
  let minute = 0
  let ampm: 'am' | 'pm' | null = null
  let m: RegExpMatchArray | null
  if ((m = take(new RegExp(String.raw`\s${PREP}(noon|midday|midnight)(?=\s)`)))) {
    hour = m[1] === 'midnight' ? 0 : 12
    ampm = m[1] === 'midnight' ? 'am' : 'pm'
  } else if ((m = take(new RegExp(String.raw`\s${PREP}(half|quarter) (past|to) ${HOUR}(?: (am|pm))?(?=\s)`)))) {
    const h = hourOf(m[3])
    hour = m[2] === 'to' ? (h + 11) % 12 || 12 : h
    minute = m[1] === 'half' ? 30 : m[2] === 'to' ? 45 : 15
    ampm = (m[4] as 'am' | 'pm') ?? null
  } else if ((m = take(new RegExp(String.raw`\s${PREP}(\d{1,2}):(\d{2})(?: (am|pm)|(am|pm))?(?=\s)`)))) {
    hour = Number(m[1])
    minute = Number(m[2])
    ampm = ((m[3] ?? m[4]) as 'am' | 'pm') ?? null
  } else if ((m = take(new RegExp(String.raw`\s${PREP}${HOUR} ?(am|pm)(?=\s)`)))) {
    hour = hourOf(m[1])
    ampm = m[2] as 'am' | 'pm'
  } else if ((m = take(new RegExp(String.raw`\s(?:at|for|by|around) ${HOUR}(?: (${Object.keys(MINUTE_WORDS).join('|')}|\d{2}))?(?: (am|pm))?(?=\s)`)))) {
    hour = hourOf(m[1])
    if (m[2]) minute = /^\d/.test(m[2]) ? Number(m[2]) : MINUTE_WORDS[m[2]]
    ampm = (m[3] as 'am' | 'pm') ?? null
  }
  if (hour !== null && (hour > 23 || minute > 59 || (ampm && (hour < 1 || hour > 12)))) return null

  if (hour === null && dayOffset === null && !part) return null
  if (hour === null) {
    // Just a day: "tomorrow" is 9 in the morning; "tonight" is 8 in the evening.
    hour = { morning: 9, afternoon: 15, evening: 19, night: 20 }[part ?? 'morning']
    minute = 0
    ampm = null
  }

  const base = new Date(now)
  base.setSeconds(0, 0)
  const at = (offset: number, h: number) => {
    const d = new Date(base)
    d.setDate(d.getDate() + offset)
    d.setHours(h, minute, 0, 0)
    return d.getTime()
  }
  const to24 = (h: number, p: 'am' | 'pm') => (p === 'am' ? h % 12 : (h % 12) + 12)

  let candidates: number[]
  if (ampm) candidates = [to24(hour, ampm)]
  else if (hour > 12 || hour === 0) candidates = [hour]
  else if (part === 'morning') candidates = [hour % 12]
  else if (part) candidates = [hour === 12 ? 12 : hour + 12]
  else if (dayOffset !== null && dayOffset > 0) {
    candidates = [morningFirst ? hour % 12 : hour >= 7 && hour < 12 ? hour : hour === 12 ? 12 : hour + 12]
  }
  else candidates = [hour % 12, hour === 12 ? 12 : hour + 12] // "at 7": the next 7 o'clock, morning or evening

  const offset = dayOffset ?? 0
  for (const h of candidates) {
    const when = at(offset, h)
    if (when > now.getTime()) return finish(when, false)
  }
  // Already gone today. Said "today"? Then it can't be done; otherwise it's tomorrow.
  if (explicitToday) return null
  return dayOffset === null ? finish(at(1, candidates[0]), false) : null
}

/** "call my mum" -> "call your mum", so the character can say it back. */
export function yourWords(label: string): string {
  const swap: Record<string, string> = { my: 'your', me: 'you', i: 'you', "i'm": "you're", myself: 'yourself', mine: 'yours' }
  return label
    .split(' ')
    .map((w) => swap[w] ?? w)
    .join(' ')
}

function cleanLabel(rest: string): string {
  return yourWords(
    rest
      .replace(/^(?:,\s*)?(?:(?:to|that|about|of|for|so|and|then)\s+)+/, '')
      .replace(/\s+(?:to|for|at|on|please|ok|okay)$/, '')
      .replace(/^(?:me|me to)\s+/, '')
      .replace(/[,\s]+$/, '')
      .trim()
  ).slice(0, 120)
}

export interface ParsedReminder {
  kind: ReminderKind
  at: number
  label: string
  /** Said as a length of time ("in 20 minutes"). */
  relative: boolean
}

const REMIND = /^(?:remind me|set (?:a |me a |up a )?reminder|make (?:a |me a )?reminder|add (?:a )?reminder|create (?:a )?reminder|new reminder|reminder)\b/
const ALARM = /^(?:set (?:an |me an |my |the |up an )?alarm|make (?:an )?alarm|add (?:an )?alarm|wake me(?: up)?|alarm)\b/

/**
 * "remind me at 6pm to call mum", "remind me to stretch in an hour",
 * "set an alarm for 7am", "wake me up tomorrow at 7". Null if it isn't one,
 * or if no time was given.
 */
export function parseReminder(text: string, now: Date, parseDuration: (s: string) => number | null): ParsedReminder | null {
  let t = normalizeTimes(text)
  // "in 20 minutes remind me to ...", "tomorrow at 9, remind me to ..."
  const after = t.match(/^(.+?),? (remind me\b.*)$/)
  if (after && !REMIND.test(t)) t = `${after[2]} ${after[1]}`
  let kind: ReminderKind
  let m: RegExpMatchArray | null
  if ((m = t.match(REMIND))) kind = 'reminder'
  else if ((m = t.match(ALARM))) kind = 'alarm'
  else return null
  const rest = t.slice(m[0].length)
  const when = findWhen(rest, now, parseDuration, kind === 'alarm')
  if (!when) return null
  if (when.at <= now.getTime() || when.at - now.getTime() > MAX_AHEAD_MS) return null
  return { kind, at: when.at, label: cleanLabel(when.rest), relative: when.relative }
}

// --- Asking about and cancelling them -------------------------------------------------

export type ReminderQuery =
  | { op: 'list'; kind: ReminderKind | null }
  | { op: 'cancel'; kind: ReminderKind | null; all: boolean; words: string[] }

const KIND_WORD = /\b(reminders?|timers?|alarms?)\b/
const kindOf = (w: string | undefined): ReminderKind | null =>
  !w ? null : w.startsWith('timer') ? 'timer' : w.startsWith('alarm') ? 'alarm' : 'reminder'

const FILLER = new Set(['the', 'my', 'a', 'an', 'that', 'this', 'it', 'for', 'to', 'all', 'of', 'every', 'each', 'any', 'one', 'please', 'off', 'set', 'i', 'just', 'me', 'about', 'on', 'at', 'up'])

/** "what reminders do I have", "how long left on my timer", "cancel the oven reminder". */
export function parseReminderQuery(text: string): ReminderQuery | null {
  const t = normalizeTimes(text).replace(/^(?:hey|hi|ok|okay|so)\b,?\s*/, '')
  if (t.split(' ').length > 14) return null
  let m: RegExpMatchArray | null
  if ((m = t.match(/^(?:cancel|stop|delete|remove|clear|turn off|switch off|get rid of|forget(?: about)?|scrap|kill|dismiss|never mind|nevermind)\b(.*)$/))) {
    const k = m[1].match(KIND_WORD)
    if (!k) return null
    const all = /\b(?:all|every|everything|both)\b/.test(m[1]) || k[1].endsWith('s')
    const words = m[1]
      .replace(KIND_WORD, ' ')
      .split(/\s+/)
      .filter((w) => w && !FILLER.has(w))
    // "Cancel all my reminders" means everything, alarms and timers too.
    return { op: 'cancel', kind: all && k[1].startsWith('reminder') ? null : kindOf(k[1]), all, words }
  }
  if (
    ((m = t.match(/^(?:what|which|list|show(?: me)?|tell me|read(?: me)?|any|check)\b.*?\b(reminders?|timers?|alarms?)\b/)) &&
      /\b(?:my|i|i've|any|set|left|got|have)\b/.test(t)) ||
    (m = t.match(/^(?:do i have|have i got|are there|is there)(?: any)?.*?\b(reminders?|timers?|alarms?)\b/)) ||
    (m = t.match(/^how (?:long|much time|many minutes)\b.*?\b(timers?|alarms?|reminders?)\b/)) ||
    (m = t.match(/^(?:when(?:'s| is| does)|what time(?:'s| is)?) (?:my|the) (timer|alarm|reminder)\b/))
  ) {
    // "What reminders do I have?" means everything, alarms and timers too.
    return { op: 'list', kind: m[1].startsWith('reminder') ? null : kindOf(m[1]) }
  }
  return null
}

/** Which ones a "cancel" means: all that match, or the next one due. */
export function pickToCancel(list: Reminder[], q: Extract<ReminderQuery, { op: 'cancel' }>): Reminder[] {
  let found = list.filter((r) => !q.kind || r.kind === q.kind || (q.kind === 'reminder' && r.kind === 'timer' && r.label))
  if (q.words.length) {
    const named = found.filter((r) => q.words.some((w) => r.label.toLowerCase().includes(w)))
    if (named.length) found = named
  }
  found.sort((a, b) => a.at - b.at)
  return q.all ? found : found.slice(0, 1)
}

// --- Saying when -------------------------------------------------------------------

/** "6:00 pm" (or "18:00", whatever the PC uses). */
export function clockTime(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** "at 6:00 pm", "tomorrow at 9:00 am", "on Friday at 3:00 pm", "on 3 Dec at 9:00 am". */
export function formatWhen(at: number, now: Date): string {
  const d = new Date(at)
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  const time = clockTime(at)
  if (sameDay(d, now)) return `at ${time}`
  if (sameDay(d, tomorrow)) return `tomorrow at ${time}`
  if (at - now.getTime() < 6 * DAY_MS) return `on ${WEEKDAYS[d.getDay()][0].toUpperCase()}${WEEKDAYS[d.getDay()].slice(1)} at ${time}`
  return `on ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} at ${time}`
}

/** "4 minutes", "1 hour 20 minutes", "30 seconds". */
export function timeLeft(at: number, now: Date): string {
  const s = Math.max(1, Math.round((at - now.getTime()) / 1000))
  const part = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`
  if (s < 60) return part(s, 'second')
  const mins = Math.round(s / 60)
  const h = Math.floor(mins / 60)
  const mm = mins % 60
  if (h >= 24) return part(Math.round(h / 24), 'day')
  return [h && part(h, 'hour'), mm && part(mm, 'minute')].filter(Boolean).join(' ')
}

/** One item, as said out loud: "a timer with 4 minutes left", "call your mum at 6:00 pm". */
export function describeReminder(r: Reminder, now: Date): string {
  const what = r.label ? ` (${r.label})` : ''
  if (r.kind === 'timer') return `a timer with ${timeLeft(r.at, now)} left${what}`
  return `${r.kind === 'alarm' ? 'an alarm' : 'a reminder'} ${formatWhen(r.at, now)}${what}`
}

/** The answer to "what reminders do I have?". */
export function describeList(list: Reminder[], kind: ReminderKind | null, now: Date): string {
  const shown = list.filter((r) => !kind || r.kind === kind || (kind === 'reminder' && r.kind === 'timer' && r.label)).sort((a, b) => a.at - b.at)
  const noun = kind === 'timer' ? 'timers' : kind === 'alarm' ? 'alarms' : 'reminders'
  if (!shown.length) return `You don't have any ${noun} set.`
  const items = shown.slice(0, 5).map((r) => describeReminder(r, now))
  const more = shown.length > 5 ? `, and ${shown.length - 5} more` : ''
  if (items.length === 1) return `You've got ${items[0]}.`
  return `You've got ${shown.length}: ${items.slice(0, -1).join(', ')}${more ? `, ${items.at(-1)}${more}` : ` and ${items.at(-1)}`}.`
}

/** The answer after cancelling. */
export function describeCancelled(gone: Reminder[], kind: ReminderKind | null, now: Date): string {
  const noun = kind === 'timer' ? 'timers' : kind === 'alarm' ? 'alarms' : 'reminders'
  if (!gone.length) return `You don't have any ${noun} like that.`
  if (gone.length === 1) return `Cancelled ${describeReminder(gone[0], now).replace(/ left\b/, ' to go')}.`
  return `Cancelled ${gone.length} ${noun}.`
}
