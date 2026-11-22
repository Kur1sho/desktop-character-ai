// A plain-text log of what the character heard and decided, so the user can
// see why it did (or didn't do) something. Kept only on this PC.
import { app } from 'electron'
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const MAX_BYTES = 512 * 1024

export function conversationLogPath(): string {
  return join(app.getPath('userData'), 'activity', 'conversation.log')
}

export function logConversation(line: string): void {
  try {
    const file = conversationLogPath()
    mkdirSync(join(file, '..'), { recursive: true })
    // Keep it small: when it gets big, drop the older half.
    if (existsSync(file) && statSync(file).size > MAX_BYTES) {
      const text = readFileSync(file, 'utf8')
      writeFileSync(file, text.slice(text.indexOf('\n', text.length / 2) + 1))
    }
    const time = new Date().toLocaleString('en-GB', { hour12: false })
    const clean = line.replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').slice(0, 1500)
    appendFileSync(file, `[${time}] ${clean.replace(/\n/g, '\n    ')}\n`)
  } catch {
    /* logging must never break anything */
  }
}
