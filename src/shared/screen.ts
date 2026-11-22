// Spots questions about what's on the screen ("what's this error?", "look at my
// screen"). The screen is only ever captured when one of these is asked.

const tidy = (s: string) =>
  s
    .toLowerCase()
    .replace(/[“”"’]/g, (c) => (c === '’' ? "'" : ''))
    .replace(/[.!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()

const ASKS_ABOUT_SCREEN = [
  // "look at my screen", "what's on my screen", "read the screen", "check out this screen"
  /\b(?:look(?:ing)? at|check(?: out)?|see|read|scan|describe|explain|what'?s on|what is on|whats on|anything on)\b.*\b(?:my|the|this|your) (?:screen|monitor|display)\b/,
  /\b(?:on|at) (?:my|the) (?:screen|monitor)\b.*\?|^(?:what|how|why|who|where|which|can|could|do|does|is)\b.*\bon (?:my|the) (?:screen|monitor)\b/,
  // "can you see this?", "can you see what I'm doing"
  /\bcan you see (?:this|that|it|my|what|the)\b/,
  // "what's this error", "what does this message mean", "what does that say"
  /\bwhat(?:'s| is| does| do)? (?:this|that) (?:error|message|popup|pop-up|pop up|window|warning|notification|code|thing|button|setting|option|page|website|site|mean|say|says)\b/,
  /\bwhat (?:does|do) (?:this|that|it) (?:say|mean)\b/,
  // "look at this", "read this for me"
  /^(?:hey \w+,? )?(?:look at|read|check) (?:this|that)\b/,
  // "help me with this", "how do I beat this boss", "what am I looking at"
  /\bhelp me with (?:this|what i'?m (?:doing|playing|looking at|reading))\b/,
  /\bwhat am i (?:looking at|playing|watching|reading)\b/,
  /\bhow do i (?:beat|fix|solve|close|get past|do) (?:this|that)\b/,
  // "what's on the right screen", "read my second monitor"
  /\b(?:left|right|other|second|2nd|main|first|top|bottom|primary|middle|big|small) (?:screen|monitor|display)\b/,
  // Any question that mentions the screen: "what's the first video on youtube on my screen"
  /^(?:what|whats|what's|how|why|who|where|which|when|can|could|would|do|does|is|are|tell me|read|find|describe|summari[sz]e|explain)\b.*\b(?:screen|monitor|display)s?\b/
]

export type ScreenChoice = 'left' | 'right' | 'top' | 'bottom' | 'primary' | 'other' | null

/** Which screen they mean, for PCs with more than one. Null means the one the mouse is on. */
export function screenChoice(text: string): ScreenChoice {
  const t = tidy(text)
  const m = t.match(/\b(left|right|top|bottom|upper|lower|other|second|2nd|main|primary|first) (?:screen|monitor|display)\b/)
  if (!m) return null
  const w = m[1]
  if (w === 'upper') return 'top'
  if (w === 'lower') return 'bottom'
  if (w === 'main' || w === 'primary' || w === 'first') return 'primary'
  if (w === 'other' || w === 'second' || w === '2nd') return 'other'
  return w as ScreenChoice
}

/** Not about seeing: saving a screenshot, brightness, locking. Those are normal commands. */
const NOT_SEEING = /\bscreen ?shot|screen capture|brightness|dim (?:the |my )?screen|lock (?:the |my )?screen|full ?screen|screen ?saver|share (?:my |the )?screen/

export function screenRequest(text: string): boolean {
  const t = tidy(text)
  if (!t || NOT_SEEING.test(t)) return false
  return ASKS_ABOUT_SCREEN.some((re) => re.test(t))
}

/** Asked to explain what's on screen, so a longer answer is fine. */
export const SCREEN_MAX_TOKENS = 320
