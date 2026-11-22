// The speech bubble and text box above the character.
import type { AskOptions, ChatReply } from '@shared/ipc'
import type { Emotion } from '@shared/personas'
import { describeAction, extractActions, parseIntents, wasRequested, type Action } from '@shared/actions'
import { quickMath } from '@shared/quickMath'
import { clipboardRequest, withCopiedText } from '@shared/clipboard'

/** 'dismissed' means the question was dropped (the user started something new), so nothing is said. */
export type Choice = 'allow' | 'always' | 'cancel' | 'dismissed'

export interface ChatUi {
  /** Element that should catch the mouse while visible. */
  readonly el: HTMLElement
  isActive(): boolean
  /** Waiting for the AI's reply (the "…" bubble is showing). */
  isThinking(): boolean
  /** Moves the bubble so its bottom centre sits at this window point. */
  place(x: number, y: number): void
  openInput(): void
  say(text: string, opts?: { error?: boolean }): void
  /** Shows a message that stays until replaced (for "Listening…" and similar). */
  status(text: string): void
  hide(): void
  /** Sends text to the character and shows the reply. */
  ask(text: string): Promise<void>
  /** Asks the user to OK an action, with buttons. `answer` settles it from elsewhere (a spoken "yes"). */
  confirm(question: string, canAlways: boolean): { choice: Promise<Choice>; answer(c: Choice): void }
  /** Drops whatever is in progress (a reply on its way, an open question), e.g. when "Hey <name>" interrupts. */
  cancel(): void
}

/** Roughly how long to keep a reply on screen: 2.5s plus reading time. */
export function readingMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return Math.min(15000, 2500 + words * 320)
}

export function createChat(
  askFn: ((text: string, opts?: AskOptions) => Promise<ChatReply>) | null,
  onEmotion: (e: Emotion) => void,
  onReply: (text: string) => void = () => {},
  /** Runs actions: plain requests ("open Spotify") come from the user, tags in replies from the AI. */
  onActions: (actions: Action[], source: 'user' | 'ai', intro?: string) => Promise<void> = async () => {},
  /** Handles requests that never reach the AI (like "dance"). Returns true if it took care of it. */
  onLocal: (text: string) => boolean = () => false,
  /** Reads what the user copied, only when they ask about it. */
  readClipboard: () => Promise<string> = async () => '',
  /** Writes a line to the conversation log (what was heard and decided). */
  log: (line: string) => void = () => {}
): ChatUi {
  const root = document.getElementById('chat') as HTMLDivElement
  const bubble = document.getElementById('bubble') as HTMLDivElement
  const input = document.getElementById('input') as HTMLInputElement
  let hideTimer = 0
  let busy = false
  /** Bumped to drop replies that arrive after being interrupted. */
  let generation = 0
  /** An open Yes/No question. Other messages show briefly, then it comes back. */
  let pending: { node: Node; answer: (c: Choice) => void } | null = null

  let waiting = false

  function show(content: string | Node, ms: number | null, error = false): void {
    window.clearTimeout(hideTimer)
    waiting = false
    bubble.replaceChildren(content)
    bubble.classList.toggle('error', error)
    bubble.classList.add('show')
    if (ms !== null) {
      hideTimer = window.setTimeout(() => (pending ? show(pending.node, null) : hide()), ms)
    }
  }

  function hide(): void {
    waiting = false
    bubble.classList.remove('show')
    onEmotion('neutral')
  }

  function thinking(): void {
    const dots = document.createElement('span')
    dots.className = 'dots'
    dots.innerHTML = '<span>●</span><span>●</span><span>●</span>'
    show(dots, null)
    waiting = true
  }

  function closeInput(): void {
    input.classList.remove('show')
    input.blur()
  }

  async function ask(text: string): Promise<void> {
    if (!askFn) {
      show('(Running outside the app, so there is no AI to talk to.)', 4000, true)
      return
    }
    if (busy) return
    busy = true
    const mine = ++generation
    try {
      log(`Message: "${text}"`)
      // Plain requests are handled straight away, without the AI.
      if (onLocal(text)) {
        log('  -> handled straight away (dancing)')
        return
      }
      // "Read / translate / explain what I copied": the clipboard is read only now, when asked.
      const clip = clipboardRequest(text)
      let copied = ''
      if (clip) {
        copied = (await readClipboard()).trim()
        log(`  -> about the copied text (${copied.length} characters)`)
        if (mine !== generation) return
        if (!copied) {
          show("There's nothing copied right now. Copy some text first!", 4000)
          return
        }
        if (clip === 'read') {
          const out = copied.length > 600 ? `${copied.slice(0, 600)}…` : copied
          show(out, readingMs(out))
          onReply(out)
          return
        }
      }
      const intents = clip ? null : parseIntents(text)
      if (intents) {
        log(`  -> understood as: ${intents.map(describeAction).join(', then ')} (no AI needed)`)
        await onActions(intents, 'user')
        return
      }
      thinking()
      // Sums are worked out exactly here; the AI just has to say it in character.
      const sum = clip ? null : quickMath(text)
      // Jobs on copied text are one-offs: the small AI would otherwise copy its last answer.
      let reply = await askFn(
        copied ? withCopiedText(text, copied) : sum ? `${text} (${sum.expression} = ${sum.answer}. Say the answer first.)` : text,
        copied ? { oneOff: true } : undefined
      )
      if (sum) log(`  -> worked out ${sum.expression} = ${sum.answer}`)
      log(`  AI replied: ${reply.text}`)
      if (mine !== generation) return // interrupted while thinking
      let { text: said, actions: tagged } = extractActions(reply.text)
      // Nothing in copied text gets to run actions.
      let actions = copied ? [] : tagged.filter((a) => wasRequested(a, text))
      if (tagged.length && !actions.length && !copied) {
        // The AI tried to do something nobody asked for (small models copy the
        // example), so its words are about that too. Ask again for a plain chat reply.
        log(`  -> ignored, you didn't ask for it: ${tagged.map(describeAction).join(', ')}. Asking again.`)
        reply = await askFn(`${text} (Just chat. Don't do anything on the computer.)`)
        if (mine !== generation) return
        ;({ text: said } = extractActions(reply.text))
        log(`  AI replied: ${reply.text}`)
        actions = []
      }
      // Small models sometimes cheer instead of answering: make sure the answer is said.
      if (sum && !reply.error && !said.includes(sum.answer)) said = `${sum.answer}! ${said}`.trim()
      onEmotion(reply.emotion)
      if (actions.length) log(`  -> AI wants to: ${actions.map(describeAction).join(', ')}`)
      if (!reply.error && actions.length) {
        // What the character said goes with the question, so it isn't lost.
        await onActions(actions, 'ai', said)
        return
      }
      show(said || '…', readingMs(said), Boolean(reply.error))
      if (!reply.error && said) onReply(said)
    } catch (err) {
      if (mine === generation) show(String(err), 6000, true)
    } finally {
      if (mine === generation) busy = false
    }
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeInput()
      return
    }
    if (e.key !== 'Enter' || busy) return
    const text = input.value.trim()
    if (!text) return
    input.value = ''
    void ask(text)
  })

  return {
    el: root,
    isActive: () => bubble.classList.contains('show') || input.classList.contains('show'),
    isThinking: () => waiting,
    place(x, y) {
      root.style.left = `${Math.round(x)}px`
      root.style.top = `${Math.round(y)}px`
    },
    openInput() {
      input.classList.add('show')
      input.focus()
    },
    say(text, opts) {
      show(text, readingMs(text), opts?.error)
    },
    status(text) {
      show(text, null)
    },
    hide,
    ask,
    confirm(question, canAlways) {
      let answer: (c: Choice) => void = () => {}
      const choice = new Promise<Choice>((resolve) => {
        const box = document.createElement('div')
        const q = document.createElement('div')
        q.textContent = question
        const row = document.createElement('div')
        row.className = 'choices'
        let settled = false
        answer = (c) => {
          if (settled) return
          settled = true
          if (pending?.node === box) pending = null
          resolve(c)
        }
        const button = (label: string, c: Choice, cls: string) => {
          const b = document.createElement('button')
          b.textContent = label
          b.className = cls
          b.addEventListener('click', () => answer(c))
          row.append(b)
        }
        button('Yes', 'allow', 'yes')
        if (canAlways) button('Always', 'always', 'always')
        button('No', 'cancel', 'no')
        box.append(q, row)
        pending?.answer('dismissed')
        pending = { node: box, answer }
        show(box, null)
        // Nothing runs without an answer: no answer in 30 seconds means no.
        window.setTimeout(() => answer('cancel'), 30000)
      })
      return { choice, answer: (c) => answer(c) }
    },
    cancel() {
      generation++
      waiting = false
      busy = false
      pending?.answer('dismissed')
    }
  }
}
