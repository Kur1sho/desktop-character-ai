import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { describeAction, parseDuration, parseIntent, parseIntents, extractActions, validateAction } from '../src/shared/actions'
import {
  describeCancelled,
  describeList,
  parseReminder,
  parseReminderQuery,
  pickToCancel,
  yourWords,
  type Reminder
} from '../src/shared/reminders'

// Sunday 22 November 2026, 2:00 pm (local time).
const NOW = new Date(2026, 10, 22, 14, 0, 0)
const at = (dayOffset: number, h: number, m = 0) => new Date(2026, 10, 22 + dayOffset, h, m, 0).getTime()
const parse = (t: string) => parseReminder(t, NOW, parseDuration)

describe('parseReminder', () => {
  it.each([
    ['remind me at 6pm to call my mum', at(0, 18), 'call your mum'],
    ['remind me to call my mum at 6pm', at(0, 18), 'call your mum'],
    ['remind me at 6 p.m. to call mum', at(0, 18), 'call mum'],
    ['remind me at 6 to call mum', at(0, 18), 'call mum'],
    ['remind me at 9 to take my pills', at(0, 21), 'take your pills'],
    ['remind me at 18:30 to cook', at(0, 18, 30), 'cook'],
    ['remind me at 6:45 pm to cook', at(0, 18, 45), 'cook'],
    ['remind me at half past 7 to feed the cat', at(0, 19, 30), 'feed the cat'],
    ['remind me at quarter to 5 to leave', at(0, 16, 45), 'leave'],
    ['remind me tomorrow at 9 to email Sam', at(1, 9), 'email sam'],
    ['remind me tomorrow morning to stretch', at(1, 9), 'stretch'],
    ['remind me tonight to take the bins out', at(0, 20), 'take the bins out'],
    ['remind me about the meeting at noon tomorrow', at(1, 12), 'the meeting'],
    ['remind me on friday at 3pm to pay rent', at(5, 15), 'pay rent'],
    ['set a reminder for 7pm to start the stream', at(0, 19), 'start the stream'],
    ['remind me in 3 days to renew my passport', NOW.getTime() + 3 * 864e5, 'renew your passport'],
    ['tomorrow at 10 remind me to call the bank', at(1, 10), 'call the bank'],
    ["remind me at 4 o'clock to eat", at(0, 16), 'eat']
  ])('"%s"', (text, when, label) => {
    const r = parse(text)
    expect(r?.kind).toBe('reminder')
    expect(r?.at).toBe(when)
    expect(r?.label).toBe(label)
  })

  it('treats a time that has gone today as tomorrow', () => {
    expect(parse('remind me at 11am to stretch')?.at).toBe(at(1, 11))
  })

  it('sets alarms, and alarm hours mean the morning', () => {
    expect(parse('set an alarm for 7am')).toMatchObject({ kind: 'alarm', at: at(1, 7), label: '' })
    expect(parse('wake me up tomorrow at 6')).toMatchObject({ kind: 'alarm', at: at(1, 6) })
    expect(parse('set an alarm for 6:30')).toMatchObject({ kind: 'alarm', at: at(0, 18, 30) })
  })

  it('needs a time, and a sensible one', () => {
    expect(parse('remind me to call mum')).toBeNull()
    expect(parse('remind me today at 9am to wake up')).toBeNull()
    expect(parse('remind me at 25:00 to x')).toBeNull()
    expect(parse('what time is it')).toBeNull()
  })

  it('says it back in your words', () => {
    expect(yourWords("tell me when i'm late for my class")).toBe("tell you when you're late for your class")
  })
})

describe('reminders as actions', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => vi.useRealTimers())

  it('makes "in 20 minutes" a timer and "at 6pm" a reminder', () => {
    expect(parseIntent('remind me to check the oven in 20 minutes')).toEqual({ type: 'timer', seconds: 1200, label: 'check the oven' })
    expect(parseIntent('remind me in an hour to stretch')).toEqual({ type: 'timer', seconds: 3600, label: 'stretch' })
    expect(parseIntent('Remind me at 6pm to call my mum.')).toEqual({ type: 'reminder', at: at(0, 18), label: 'call your mum', kind: 'reminder' })
    expect(parseIntent('hey robotico, set an alarm for 7am')).toEqual({ type: 'reminder', at: at(1, 7), label: '', kind: 'alarm' })
  })

  it('keeps the label whole when it has an "and" in it', () => {
    expect(parseIntents('remind me at 6 to buy milk and eggs')).toEqual([
      { type: 'reminder', at: at(0, 18), label: 'buy milk and eggs', kind: 'reminder' }
    ])
  })

  it('describes them for the Yes/No question', () => {
    expect(describeAction({ type: 'timer', seconds: 1200, label: 'check the oven' })).toBe('Set a timer for 20 minutes (check the oven)')
    expect(describeAction({ type: 'reminder', at: at(1, 9), label: 'email Sam', kind: 'reminder' })).toMatch(/^Remind you tomorrow at 9:00.* to email Sam$/)
    expect(describeAction({ type: 'reminder', at: at(1, 7), label: '', kind: 'alarm' })).toMatch(/^Set an alarm tomorrow at 7:00/)
  })

  it('checks reminder actions', () => {
    expect(validateAction({ type: 'reminder', at: at(0, 18), label: 'x', kind: 'reminder' })).not.toBeNull()
    expect(validateAction({ type: 'reminder', at: at(-1, 18), label: 'x', kind: 'reminder' })).toBeNull()
    expect(validateAction({ type: 'reminder', at: 'soon', label: 'x' })).toBeNull()
  })

  it('understands the AI asking for one', () => {
    expect(extractActions('Will do! <<remind 6pm | call mum>>').actions).toEqual([
      { type: 'reminder', at: at(0, 18), label: 'call mum', kind: 'reminder' }
    ])
    expect(extractActions('<<alarm tomorrow at 7am>>').actions).toEqual([{ type: 'reminder', at: at(1, 7), label: '', kind: 'alarm' }])
  })
})

describe('asking about and cancelling reminders', () => {
  it.each([
    ['what reminders do I have', { op: 'list', kind: null }],
    ['do I have any alarms set?', { op: 'list', kind: 'alarm' }],
    ['how long is left on my timer', { op: 'list', kind: 'timer' }],
    ["when's my alarm", { op: 'list', kind: 'alarm' }],
    ['cancel my timer', { op: 'cancel', kind: 'timer', all: false, words: [] }],
    ['cancel the oven reminder', { op: 'cancel', kind: 'reminder', all: false, words: ['oven'] }],
    ['clear all my reminders', { op: 'cancel', kind: null, all: true, words: [] }],
    ['cancel my reminder', { op: 'cancel', kind: 'reminder', all: false, words: [] }],
    ['turn off my alarm', { op: 'cancel', kind: 'alarm', all: false, words: [] }]
  ])('"%s"', (text, want) => expect(parseReminderQuery(text)).toEqual(want))

  it('leaves other things alone', () => {
    expect(parseReminderQuery('stop the music')).toBeNull()
    expect(parseReminderQuery('what is a good timer app')).toBeNull()
    expect(parseReminderQuery('set a timer for 5 minutes')).toBeNull()
  })

  const list: Reminder[] = [
    { id: 'a', at: NOW.getTime() + 4 * 60_000, kind: 'timer', label: '' },
    { id: 'b', at: NOW.getTime() + 20 * 60_000, kind: 'timer', label: 'check the oven' },
    { id: 'c', at: at(0, 18), kind: 'reminder', label: 'call your mum' },
    { id: 'd', at: at(1, 7), kind: 'alarm', label: '' }
  ]

  it('picks which ones to cancel', () => {
    const cancel = (t: string) => pickToCancel(list, parseReminderQuery(t) as never).map((r) => r.id)
    expect(cancel('cancel my timer')).toEqual(['a'])
    expect(cancel('cancel the oven timer')).toEqual(['b'])
    expect(cancel('cancel my timers')).toEqual(['a', 'b'])
    expect(cancel('cancel the mum reminder')).toEqual(['c'])
    expect(cancel('turn off my alarm')).toEqual(['d'])
    expect(cancel('cancel all my reminders')).toEqual(['a', 'b', 'c', 'd'])
  })

  it('says what is set', () => {
    expect(describeList(list, 'timer', NOW)).toBe("You've got 2: a timer with 4 minutes left and a timer with 20 minutes left (check the oven).")
    expect(describeList([], null, NOW)).toBe("You don't have any reminders set.")
    expect(describeList(list.slice(2, 3), 'reminder', NOW)).toMatch(/^You've got a reminder at 6:00.*\(call your mum\)\.$/)
    expect(describeCancelled([list[0]], 'timer', NOW)).toBe('Cancelled a timer with 4 minutes to go.')
    expect(describeCancelled([], 'alarm', NOW)).toBe("You don't have any alarms like that.")
  })
})
