// The speech bubble and text box above the character.
import type { ChatReply } from '@shared/ipc'
import type { Emotion } from '@shared/personas'

export interface ChatUi {
  /** Element that should catch the mouse while visible. */
  readonly el: HTMLElement
  isActive(): boolean
  /** Moves the bubble so its bottom centre sits at this window point. */
  place(x: number, y: number): void
  openInput(): void
  say(text: string, opts?: { error?: boolean }): void
  /** Shows a message that stays until replaced (for "Listening…" and similar). */
  status(text: string): void
  hide(): void
  /** Sends text to the character and shows the reply. */
  ask(text: string): Promise<void>
}

/** Roughly how long to keep a reply on screen: 2.5s plus reading time. */
export function readingMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return Math.min(15000, 2500 + words * 320)
}

export function createChat(
  askFn: ((text: string) => Promise<ChatReply>) | null,
  onEmotion: (e: Emotion) => void,
  onReply: (text: string) => void = () => {}
): ChatUi {
  const root = document.getElementById('chat') as HTMLDivElement
  const bubble = document.getElementById('bubble') as HTMLDivElement
  const input = document.getElementById('input') as HTMLInputElement
  let hideTimer = 0
  let busy = false

  function show(content: string | Node, ms: number | null, error = false): void {
    window.clearTimeout(hideTimer)
    bubble.replaceChildren(content)
    bubble.classList.toggle('error', error)
    bubble.classList.add('show')
    if (ms !== null) hideTimer = window.setTimeout(hide, ms)
  }

  function hide(): void {
    bubble.classList.remove('show')
    onEmotion('neutral')
  }

  function thinking(): void {
    const dots = document.createElement('span')
    dots.className = 'dots'
    dots.innerHTML = '<span>●</span><span>●</span><span>●</span>'
    show(dots, null)
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
    thinking()
    try {
      const reply = await askFn(text)
      onEmotion(reply.emotion)
      show(reply.text || '…', readingMs(reply.text), Boolean(reply.error))
      if (!reply.error && reply.text) onReply(reply.text)
    } catch (err) {
      show(String(err), 6000, true)
    } finally {
      busy = false
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
    ask
  }
}
