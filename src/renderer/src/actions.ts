// Asks before every action, then runs it. The user can answer with the
// buttons in the speech bubble or, if they asked by voice, by saying yes or no.
import {
  CAN_ALWAYS_ALLOW,
  describeAction,
  formatDuration,
  parseYesNo,
  type Action,
  type ActionResult
} from '@shared/actions'
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
  const timers = new Set<number>()

  function startTimer(a: Extract<Action, { type: 'timer' }>): ActionResult {
    const id = window.setTimeout(() => {
      timers.delete(id)
      deps.summon()
      deps.setEmotion('surprised')
      beep()
      const line = deps.persona().lines.timerDone + (a.label ? ` (${a.label})` : '')
      deps.chat.say(line)
      void deps.speak(line)
    }, a.seconds * 1000)
    timers.add(id)
    return { ok: true, message: `Timer set for ${formatDuration(a.seconds)}.` }
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
    const canAlways = CAN_ALWAYS_ALLOW.has(action.type)
    const preApproved = canAlways && settings.alwaysAllow.includes(action.type)
    if (!preApproved) {
      deps.setEmotion('neutral')
      const question = fill(persona.lines.confirm, { action: describeAction(action) })
      const choice = await ask(intro ? `${intro}\n${question}` : question, canAlways)
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
    const final = result.ok && action.type === 'timer' ? startTimer(action) : result
    const line = fill(final.ok ? persona.lines.done : persona.lines.failed, { result: final.message })
    deps.setEmotion(final.ok ? 'happy' : 'sad')
    deps.chat.say(line, { error: !final.ok })
    void deps.speak(line)
  }

  return {
    async run(actions: Action[], source: 'user' | 'ai', intro?: string): Promise<void> {
      for (const [i, a] of actions.entries()) await runOne(a, source, i === 0 ? intro : '')
    },
    cancelTimers(): void {
      timers.forEach((id) => window.clearTimeout(id))
      timers.clear()
    }
  }
}

/** Three short beeps, made on the fly (no sound files). */
function beep(): void {
  try {
    const ctx = new AudioContext()
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = 880
      gain.gain.value = 0.15
      osc.connect(gain).connect(ctx.destination)
      const t = ctx.currentTime + i * 0.3
      osc.start(t)
      osc.stop(t + 0.15)
    }
    window.setTimeout(() => void ctx.close(), 1500)
  } catch {
    /* no audio device */
  }
}
