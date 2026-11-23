// Fixes typos in what people type, on the PC (no internet), before anything tries to
// understand it. Careful by design: it only touches words it doesn't know, and never
// the names of apps, songs or things to search for (those are matched loosely later).
import { WORD_TIERS } from './words'

/** Words the companion itself needs to understand, ranked above everything else. */
const COMMAND_WORDS = `
open close launch start quit exit play pause resume stop skip next previous shuffle repeat
volume louder quieter mute unmute turn up down set cancel clear delete
timer timers alarm alarms remind reminder reminders minute minutes second seconds hour hours
today tonight tomorrow morning afternoon evening noon midnight week weekend
monday tuesday wednesday thursday friday saturday sunday
chess checkers poker blackjack trivia rock paper scissors quiz game games hub arcade
dance dancing music song songs playlist album spotify youtube google search look find
weather screenshot screen clipboard copied copy paste translate explain summarise summarize
calculator notepad settings discord steam chrome edge firefox explorer window windows desktop
minimise minimize maximise maximize snap left right focus
min mins sec secs hr hrs am pm
robotico suzu twenty questions number guess riddle joke jokes story
hello hey hiya thanks thank please sorry yes yeah nope okay
what when where which who why how much many
`
  .trim()
  .split(/\s+/)

/** Text-speak and common misspellings that edits alone won't fix well. (Missing apostrophes,
 * like "dont" and "whats", are understood as they are, so they're left alone.) */
const SHORTHAND: Record<string, string> = {
  u: 'you', ur: 'your', r: 'are', 'b4': 'before', pls: 'please', plz: 'please', pleas: 'please',
  thx: 'thanks', thnx: 'thanks', ty: 'thank you', tmr: 'tomorrow', tmrw: 'tomorrow', tmrrw: 'tomorrow', '2moro': 'tomorrow',
  tonite: 'tonight', '2nite': 'tonight', nite: 'night', wat: 'what', wot: 'what', wats: 'whats', wots: 'whats', rember: 'remember', remeber: 'remember', remembr: 'remember', wut: 'what', wen: 'when', wher: 'where',
  hw: 'how', abt: 'about', bc: 'because', cuz: 'because', coz: 'because', cos: 'because', rn: 'right now',
  ppl: 'people', msg: 'message', pic: 'picture', vid: 'video', alot: 'a lot', ok: 'okay', k: 'okay', kk: 'okay',
  idk: "I don't know", dunno: "don't know", gimme: 'give me', lemme: 'let me', wanna: 'want to', gonna: 'going to',
  gotta: 'got to', probly: 'probably', prolly: 'probably', definatly: 'definitely', definitly: 'definitely',
  basicly: 'basically', thanx: 'thanks', happend: 'happened', publically: 'publicly', sumthing: 'something', somthing: 'something'
}

/** Names it should know aren't typos (the word list has no proper nouns). */
const PROPER = `
january february march april may june july august september october november december
christmas easter halloween xmas valentines diwali eid hanukkah ramadan thanksgiving
england scotland wales ireland britain uk usa america canada australia france germany spain italy portugal
netherlands holland belgium sweden norway denmark finland iceland poland russia ukraine greece turkey egypt
india china japan korea vietnam thailand indonesia philippines pakistan brazil argentina mexico chile peru
africa nigeria kenya europe asia antarctica switzerland austria hungary romania israel iran iraq
london paris berlin madrid rome tokyo beijing moscow dublin edinburgh manchester liverpool birmingham glasgow
cardiff belfast leeds bristol newcastle york sydney melbourne toronto vancouver chicago boston seattle
english british american french german spanish italian japanese chinese korean russian irish scottish welsh
indian australian canadian mexican brazilian dutch swedish polish greek arabic hindi portuguese
facebook instagram twitter tiktok whatsapp snapchat reddit netflix twitch amazon microsoft apple android
im ive id youre youve youll theyre thats whats whos hows wheres theres heres lets
dont doesnt didnt isnt arent wasnt werent cant couldnt wouldnt shouldnt havent hasnt wont aint
texas holdem lol lmao bruh banger lofi meme memes emoji vibe vibes chill noob gg
iphone xbox playstation nintendo minecraft fortnite roblox valorant pokemon zelda mario wifi bluetooth
`
  .trim()
  .split(/\s+/)

/** After these, the rest is a name (an app, a song, a search), so only command words are fixed there. */
const NAME_AFTER = /\b(?:open|launch|start|close|quit|play|put on|search(?: for)?|google|look up|youtube|find|called|named)\s+$/i

const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']
const KEY_POS = new Map<string, [number, number]>()
ROWS.forEach((row, r) => [...row].forEach((ch, c) => KEY_POS.set(ch, [r, c + r * 0.5])))

function nearKeys(a: string, b: string): boolean {
  const p = KEY_POS.get(a)
  const q = KEY_POS.get(b)
  return Boolean(p && q && Math.abs(p[0] - q[0]) <= 1 && Math.abs(p[1] - q[1]) <= 1.01)
}

let rank: Map<string, number> | null = null
/** Word -> how common it is (higher is more common). Command words beat everything. */
function ranks(): Map<string, number> {
  if (rank) return rank
  rank = new Map()
  WORD_TIERS.forEach((tier, i) => {
    for (const w of tier.split(' ')) if (w) rank!.set(w, WORD_TIERS.length - i)
  })
  for (const w of PROPER) if (!rank.has(w)) rank.set(w, 1)
  for (const w of COMMAND_WORDS) rank.set(w, WORD_TIERS.length + 2)
  return rank
}

export function isKnownWord(w: string): boolean {
  const r = ranks()
  const lower = w.toLowerCase()
  return r.has(lower) || (lower.endsWith("'s") && r.has(lower.slice(0, -2)))
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'

/** Every string one edit away, with a note of how "natural" the slip was. */
function edits1(w: string): Map<string, number> {
  const out = new Map<string, number>()
  const add = (s: string, bonus: number) => out.set(s, Math.max(out.get(s) ?? 0, bonus))
  for (let i = 0; i <= w.length; i++) {
    const a = w.slice(0, i)
    const b = w.slice(i)
    if (b) add(a + b.slice(1), b[0] === a.slice(-1) || b[0] === b[1] ? 1 : 0) // deleted a doubled letter: natural
    if (b.length > 1) add(a + b[1] + b[0] + b.slice(2), 2) // swapped letters: the commonest slip
    for (const c of LETTERS) {
      if (b) add(a + c + b.slice(1), nearKeys(c, b[0]) ? 1 : 0) // hit the key next door
      add(a + c + b, c === a.slice(-1) || c === b[0] ? 1 : 0) // missed a doubled letter
    }
  }
  out.delete(w)
  return out
}

export interface Correction {
  from: string
  to: string
}

/**
 * The best known word for a typo, or null to leave it alone.
 * @param commandsOnly only correct to the companion's own command words (inside names)
 */
export function correctWord(word: string, commandsOnly = false): string | null {
  const w = word.toLowerCase()
  if (!commandsOnly && SHORTHAND[w] !== undefined && SHORTHAND[w] !== w) return SHORTHAND[w]
  // Contractions and anything odd are left as typed.
  if (w.length < 2 || /[^a-z]/.test(w)) return null
  const r = ranks()
  if (isKnownWord(w)) return null
  const top = WORD_TIERS.length + 2
  const allowed = (s: string) => {
    const k = r.get(s)
    return k !== undefined && (!commandsOnly || k === top) ? k : undefined
  }
  if (w.length < 3) return null
  const score = (cand: string, bonus: number, dist: number) => {
    const k = allowed(cand)!
    // Common words and natural slips win; the first letter is rarely the mistake.
    // Plurals stay plural ("minuts" is "minutes", not "minute").
    const plural = w.endsWith('s') === cand.endsWith('s') ? 2 : 0
    return k * 2 + bonus * 1.5 + (cand[0] === w[0] ? 2 : 0) + plural - dist * 6 - Math.abs(cand.length - w.length) * 0.3
  }
  let best: string | null = null
  let bestScore = -Infinity
  let tie = false
  const consider = (cand: string, s: number) => {
    if (s > bestScore + 1e-9) {
      best = cand
      bestScore = s
      tie = false
    } else if (Math.abs(s - bestScore) < 1e-9 && cand !== best) tie = true
  }
  // Only fixes it's sure of: a natural slip (swapped letters, a key next door, a doubled
  // letter) or a very common word. Anything else (names, slang) is left alone.
  const confident = (cand: string, bonus: number, dist: number) => {
    const k = allowed(cand)!
    if (k === top) return bonus >= 1 || cand[0] === w[0]
    if (dist === 1) return (bonus >= 1 && k >= 2) || (k >= 4 && cand[0] === w[0])
    return w.length >= 6 && cand[0] === w[0] && bonus >= 1 && k >= 3
  }
  const one = edits1(w)
  for (const [cand, bonus] of one) if (allowed(cand) !== undefined && confident(cand, bonus, 1)) consider(cand, score(cand, bonus, 1))
  if (best === null) {
    // Two words run together: "remindme", "letsplay".
    if (!commandsOnly && w.length >= 5) {
      for (let i = 2; i <= w.length - 2; i++) {
        const a = w.slice(0, i)
        const b = w.slice(i)
        const ka = r.get(a) ?? (SHORTHAND[a] ? top : undefined)
        const kb = r.get(b)
        const command = ka === top || kb === top || SHORTHAND[a] !== undefined
        if (command && ka !== undefined && kb !== undefined && ka >= 3 && kb >= 3) return `${SHORTHAND[a] ?? a} ${b}`
      }
    }
  }
  // Two slips, for longer words only (short ones have too many lookalikes).
  if (best === null && w.length >= 5) {
    for (const [e1, b1] of one) {
      for (const [cand, b2] of edits1(e1))
        if (allowed(cand) !== undefined && confident(cand, (b1 + b2) / 2, 2)) consider(cand, score(cand, (b1 + b2) / 2, 2))
    }
  }
  if (best !== null && !(tie && w.length <= 4)) return best
  return null
}

function matchCase(original: string, fixed: string): string {
  if (original.length > 1 && original === original.toUpperCase()) return fixed.toUpperCase()
  if (original[0] === original[0].toUpperCase() && fixed[0] !== 'I') return fixed[0].toUpperCase() + fixed.slice(1)
  return fixed
}

/** Fixes the typos in a message. `changes` lists what was changed, for the log. */
export function autocorrect(text: string): { text: string; changes: Correction[] } {
  const changes: Correction[] = []
  // Leave links, emails, file paths and anything in quotes exactly as typed.
  const keep = /(https?:\/\/\S+|\S+@\S+|[a-z]:\\\S*|\S+\.[a-z]{2,}\b|"[^"]*"|“[^”]*”)/gi
  // ALL CAPS messages are checked like any other (only single words in caps are acronyms).
  const shouting = !/[a-z]/.test(text) && /[A-Z]{2}/.test(text)
  const parts = text.split(keep)
  let out = ''
  for (let p = 0; p < parts.length; p++) {
    const part = parts[p]
    if (p % 2 === 1) {
      out += part
      continue
    }
    out += part.replace(/[A-Za-z0-9']+/g, (word, offset: number) => {
      if (/\d/.test(word) && !/^(?:b4|2moro|2nite)$/i.test(word)) return word
      // Acronyms (GPU), camelCase and Capitalised names mid-sentence are left as typed.
      const before = out + part.slice(0, offset)
      const sentenceStart = /(?:^|[.!?]\s*)$/.test(before.trimEnd()) || before.trim() === ''
      if (!shouting && (/[A-Z]/.test(word.slice(1)) || (/^[A-Z]/.test(word) && !sentenceStart))) return word
      // Parts of hyphenated words ("pre-roll") too.
      if (part[offset - 1] === '-' || part[offset + word.length] === '-') return word
      const insideName = NAME_AFTER.test(before) || /\b(?:open|launch|start|close|quit|play|put on|search(?: for)?|google|look up|youtube|find|called|named)\s+\S/i.test(before.split(/[.,!?;]/).pop() ?? '')
      const fixed = correctWord(word.replace(/^'+|'+$/g, ''), insideName)
      if (!fixed) return word
      const to = matchCase(word, fixed)
      changes.push({ from: word, to })
      return to
    })
  }
  return { text: out, changes }
}
