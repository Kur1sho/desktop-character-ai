// Asks before every action, then runs it. The user can answer with the
// buttons in the speech bubble or, if they asked by voice, by saying yes or no.
import { canAlwaysAllow, describeAction, parseYesNo, type Action } from '@shared/actions'
import { clockTime, type Reminder } from '@shared/reminders'
import type { CompanionApi } from '@shared/ipc'
import type { Emotion, Persona } from '@shared/personas'
import type { Settings } from '@shared/settings'
import type { ChatUi, Choice } from './chat'

export interface ActionDeps {
  api: CompanionApi
  chat: ChatUi
  settings: () => Settings
  persona: () => Persona
  setEmotion: (e: Emotion) => void
  /** Says a line out loud (if voice is on). Resolves when finished. */
  speak: (text: string) => Promise<void>
  summon: () => void
  /** Listens for one short answer. Null if listening isn't possible right now. */
  hear: () => { result: Promise<string | null>; cancel(): void } | null
  /** True if the last request was spoken, so the answer can be spoken too. */
  spokenRequest: () => boolean
}

const fill = (line: string, vars: Record<string, string>) =>
  line.replace(/\{(\w+)\}/g, (_m, k: string) => vars[k] ?? '').replace(/\s+/g, ' ').trim()

export function createActions(deps: ActionDeps) {
  /** A timer, reminder or alarm going off (they're kept by the main process, so they survive a restart). */
  function due(r: Reminder, late: boolean): void {
    const lines = deps.persona().lines
    deps.summon()
    deps.setEmotion('surprised')
    beep(r.kind === 'alarm' ? 4 : 1)
    let line = r.kind === 'alarm'
      ? fill(lines.alarmDue, { time: clockTime(r.at) }) + (r.label ? ` (${r.label})` : '')
      : r.label
        ? fill(lines.reminderDue, { label: r.label })
        : lines.timerDone
    if (late) line = `${lines.missed} ${line}`
    deps.chat.say(line)
    void deps.speak(line)
  }

  async function ask(question: string, canAlways: boolean): Promise<Choice> {
    const pending = deps.chat.confirm(question, canAlways)
    let listening = null as ReturnType<ActionDeps['hear']>
    if (deps.spokenRequest()) {
      // Say the question, then listen for "yes" or "no". The buttons still work.
      void deps.speak(question).then(async () => {
        listening = deps.hear()
        const heard = await listening?.result
        const yn = heard ? parseYesNo(heard) : null
        if (yn) pending.answer(yn === 'yes' ? 'allow' : 'cancel')
      })
    }
    const choice = await pending.choice
    listening?.cancel()
    return choice
  }

  async function runOne(action: Action, source: 'user' | 'ai', intro = ''): Promise<void> {
    const persona = deps.persona()
    const settings = deps.settings()
    const canAlways = canAlwaysAllow(action)
    const preApproved = canAlways && (settings.autoApprove || settings.alwaysAllow.includes(action.type))
    if (!preApproved) {
      deps.setEmotion('neutral')
      const question = fill(persona.lines.confirm, { action: describeAction(action) })
      const choice = await ask(intro ? `${intro}\n${question}` : question, canAlways)
      if (choice === 'dismissed') return
      if (choice === 'cancel') {
        deps.setEmotion('neutral')
        deps.chat.say(persona.lines.cancelled)
        void deps.speak(persona.lines.cancelled)
        return
      }
      if (choice === 'always') {
        await deps.api.saveSettings({ ...settings, alwaysAllow: [...new Set([...settings.alwaysAllow, action.type])] })
      }
    }
    deps.chat.status('…')
    // The main process checks the action again and keeps the activity log.
    const result = await deps.api.runAction(action, source)
    const line = fill(result.ok ? persona.lines.done : persona.lines.failed, { result: result.message })
    deps.setEmotion(result.ok ? 'happy' : 'sad')
    deps.chat.say(line, { error: !result.ok })
    void deps.speak(line)
  }

  return {
    async run(actions: Action[], source: 'user' | 'ai', intro?: string): Promise<void> {
      for (const [i, a] of actions.entries()) await runOne(a, source, i === 0 ? intro : '')
    },
    due
  }
}

/** Three short beeps per round, made on the fly (no sound files). */
function beep(rounds = 1): void {
  try {
    const ctx = new AudioContext()
    for (let i = 0; i < 3 * rounds; i++) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = 880
      gain.gain.value = 0.15
      osc.connect(gain).connect(ctx.destination)
      const t = ctx.currentTime + i * 0.3 + Math.floor(i / 3) * 0.6
      osc.start(t)
      osc.stop(t + 0.15)
    }
    window.setTimeout(() => void ctx.close(), 1500 * rounds + 500)
  } catch {
    /* no audio device */
  }
}
