// Small built-in AI models are bad at sums and love to waffle instead of
// answering. Simple arithmetic ("what's 9 + 10", "12 times 3") is worked out
// here exactly, so the character always gets it right.

const WORDS: [RegExp, string][] = [
  [/\bmultiplied by\b|\btimes\b|×/g, '*'],
  [/\bdivided by\b|\bover\b|÷/g, '/'],
  [/\bplus\b|\band\b/g, '+'],
  [/\bminus\b|\btake away\b/g, '-'],
  [/(\d)\s*x\s*(?=\d)/g, '$1*']
]

/** The answer to a simple sum in the message, or null if there isn't one. */
export function quickMath(text: string): { expression: string; answer: string } | null {
  // Only for things that look like a sum being asked about, not dates or phone numbers.
  if (/\d{4}-\d{1,2}-\d{1,2}/.test(text)) return null
  const asked = /\b(what|whats|what's|calculate|how much|equals?|solve|work out|add)\b|[=?]/i.test(text)
  let t = text.toLowerCase().replace(/,(?=\d{3})/g, '')
  for (const [re, op] of WORDS) t = t.replace(re, op)
  // Or the message is nothing but a sum ("100 divided by 8").
  const bare = /^[\d\s.()+\-*/]+$/.test(t.trim())
  if (!asked && !bare) return null
  // Find the longest run of numbers, operators and brackets with at least one operator.
  const runs = t.match(/[\d.()+\-*/\s]+/g) ?? []
  const expr = runs
    .map((r) => r.trim())
    .filter((r) => /\d/.test(r) && /\d\s*[-+*/]\s*[\d(]/.test(r))
    .sort((a, b) => b.length - a.length)[0]
  if (!expr) return null
  const value = evaluate(expr)
  if (value === null || !Number.isFinite(value)) return null
  const answer = Number.isInteger(value) ? String(value) : String(Math.round(value * 1e6) / 1e6)
  return { expression: expr.replace(/\s+/g, ' '), answer }
}

/** A tiny, safe calculator: numbers, + - * / and brackets. Never uses eval. */
function evaluate(src: string): number | null {
  const tokens = src.match(/\d+(?:\.\d+)?|[-+*/()]/g)
  if (!tokens) return null
  let i = 0
  const peek = () => tokens[i]
  const next = () => tokens[i++]
  function expr(): number | null {
    let v = term()
    while (v !== null && (peek() === '+' || peek() === '-')) {
      const op = next()
      const r = term()
      if (r === null) return null
      v = op === '+' ? v + r : v - r
    }
    return v
  }
  function term(): number | null {
    let v = factor()
    while (v !== null && (peek() === '*' || peek() === '/')) {
      const op = next()
      const r = factor()
      if (r === null) return null
      v = op === '*' ? v * r : v / r
    }
    return v
  }
  function factor(): number | null {
    const t = next()
    if (t === undefined) return null
    if (t === '-') {
      const v = factor()
      return v === null ? null : -v
    }
    if (t === '(') {
      const v = expr()
      if (next() !== ')') return null
      return v
    }
    const n = Number(t)
    return Number.isFinite(n) ? n : null
  }
  const v = expr()
  return i === tokens.length ? v : null
}
