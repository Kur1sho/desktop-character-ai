// Keeps replies short and chatty. Models (especially small local ones) love to
// write paragraphs; a desktop buddy should answer like a friend, in a line or
// two, unless you actually asked for detail.
import { COPIED_MARKER } from './clipboard'

/** Did the user ask for an explanation or detail? Then a longer answer is fine. */
export function wantsDetail(userText: string): boolean {
  return /\b(explain|describe|in detail|step by step|tell me (more|about|a story)|how (do|does|did|can|to|would)|why|what is|what are|list|steps|instructions|story)\b/i.test(
    userText
  )
}

/**
 * Trims a raw reply ("[happy] Sentence. Sentence. <<tag>>") to a couple of
 * sentences, keeping the emotion tag at the front and any action tags at the end.
 */
export function shortenReply(raw: string, userText: string): string {
  const actions = raw.match(/<<[^<>]*>>/g) ?? []
  let body = raw.replace(/<<[^<>]*>>/g, ' ')
  const lead = body.match(/^\s*\[\s*[a-zA-Z]+\s*\]/)?.[0]?.trim() ?? ''
  if (lead) body = body.trim().slice(lead.length)
  body = body.replace(/\s+/g, ' ').trim()

  // Working on copied text (translating, summarising) needs room.
  const copied = userText.includes(COPIED_MARKER)
  const detail = wantsDetail(userText)
  const maxSentences = copied ? 8 : detail ? 4 : 2
  const maxChars = copied ? 900 : detail ? 420 : 180
  const sentences = body.match(/[^.!?…]+(?:[.!?…]+["')\]]*|$)/g)?.map((s) => s.trim()).filter(Boolean) ?? [body]
  let out = ''
  for (const s of sentences.slice(0, maxSentences)) {
    // Always keep the first sentence whole; stop before going too long.
    if (out && out.length + 1 + s.length > maxChars) break
    out = out ? `${out} ${s}` : s
  }
  return [lead, out, ...actions].filter(Boolean).join(' ')
}
