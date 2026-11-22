// Decides whether a short transcript starts with (or contains) the character's
// name, allowing for the ways speech recognition misspells unusual names.

export interface WakeMatch {
  matched: boolean
  /** Whatever was said after the name, e.g. "how are you today". */
  rest: string
}

const FILLERS = new Set(['hey', 'hi', 'hello', 'ok', 'okay', 'yo', 'oi', 'um', 'uh', 'so'])

export function normalise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return dp[b.length]
}

/**
 * Looks for the name in the first few words. Joins neighbouring words too,
 * because "Robotico" often comes back as "robot ico" or "robo tico".
 */
export function matchWakeWord(transcript: string, name: string): WakeMatch {
  const words = normalise(transcript)
  const target = name.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!target || words.length === 0) return { matched: false, rest: '' }
  // Short names need a closer match than long ones.
  const allowed = target.length <= 4 ? 0 : target.length <= 6 ? 1 : 2
  const searchUpTo = Math.min(words.length, 4)

  for (let start = 0; start < searchUpTo; start++) {
    // Only fillers may come before the name ("hey", "ok"...).
    if (start > 0 && !FILLERS.has(words[start - 1])) break
    for (let len = 1; len <= 3 && start + len <= words.length; len++) {
      const joined = words.slice(start, start + len).join('').replace(/'/g, '')
      if (Math.abs(joined.length - target.length) > allowed + 1) continue
      if (levenshtein(joined, target) <= allowed) {
        return { matched: true, rest: words.slice(start + len).join(' ') }
      }
    }
  }
  return { matched: false, rest: '' }
}
