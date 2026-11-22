// Voice games the character runs: rock paper scissors, trivia, twenty
// questions and higher or lower. The rules and scores are kept here, so the
// AI never has to remember them; it only answers the yes/no questions in
// twenty questions. No Electron code, so it can be tested on its own.
import type { Emotion } from './personas'
import { TRIVIA } from './trivia'

export type GameId = 'rps' | 'trivia' | 'twenty' | 'number'

export const GAME_NAMES: Record<GameId, string> = {
  rps: 'rock paper scissors',
  trivia: 'trivia',
  twenty: 'twenty questions',
  number: 'higher or lower'
}

export interface GameReply {
  say: string
  emotion: Emotion
  /** The game finished with this reply. */
  over?: boolean
}

type Move = 'rock' | 'paper' | 'scissors'

export type GameState =
  | { id: 'rps'; you: number; me: number; target: number }
  | { id: 'trivia'; order: number[]; round: number; score: number; options: string[]; answer: number }
  | { id: 'twenty'; secret: Secret; asked: number }
  | { id: 'number'; secret: number; guesses: number }

export interface GameContext {
  personaId: string
  /** 0 to 1, like Math.random (tests pass a fixed one). */
  rng: () => number
  /** Twenty questions: asks the AI whether the answer to this yes/no question is yes. */
  judge?: (secret: string, question: string) => Promise<{ answer: 'yes' | 'no' | 'sometimes'; text: string } | null>
}

// --- What the character says --------------------------------------------------

interface Lines {
  menu: string
  rpsStart: string
  win: string[]
  lose: string[]
  draw: string[]
  matchWon: string
  matchLost: string
  triviaStart: string
  right: string[]
  wrong: string
  triviaEnd: string
  twentyStart: string
  twentyWon: string
  twentyLost: string
  numberStart: string
  numberWon: string
  quit: string
  again: string
}

const LINES: Record<string, Lines> = {
  robotico: {
    menu: "Games? With ME? Excellent. I know rock paper scissors, trivia, twenty questions and higher or lower. Pick one, if you dare.",
    rpsStart: "Rock paper scissors, first to 3. My circuits have already predicted your every move. Go!",
    win: ['Ha! Calculated.', 'Too easy. Did you even try?', 'Another victory for the greatest robot ever built.'],
    lose: ['What?! That was a glitch.', 'You got lucky. My sensors were warming up.', 'Fine. ONE point. Enjoy it.'],
    draw: ['A draw. Great minds think alike. Mine is greater.', "Same move! Stop copying me."],
    matchWon: "And that's the match! {score}. Bow before your champion.",
    matchLost: "You won the match, {score}. I demand a rematch. Say \"again\".",
    triviaStart: "Trivia time! Five questions. Try to keep up with a genius.",
    right: ['Correct! Not bad, for a human.', "Right! Okay, that one was easy.", 'Yes! I taught you that, probably.'],
    wrong: 'Wrong! It was {answer}. I knew that, obviously.',
    triviaEnd: "That's the quiz! You got {score} out of 5. {verdict}",
    twentyStart: "I'm thinking of something. You get twenty yes or no questions. Good luck, you'll need it.",
    twentyWon: "WHAT?! Yes, it's {secret}! In {n} questions. Are you reading my code?",
    twentyLost: "Ha! It was {secret}. I win again. Say \"again\" for another go.",
    numberStart: "I'm thinking of a number from 1 to 100. Guess it, and I'll say higher or lower.",
    numberWon: "{secret}! You got it in {n} guesses. {verdict}",
    quit: 'Giving up already? Fine. I was winning anyway.',
    again: 'Say "again" if you want another round.'
  },
  tsundere: {
    menu: "Hmph, you want to play with me? Fine. Rock paper scissors, trivia, twenty questions or higher or lower. Pick one.",
    rpsStart: "Rock paper scissors, first to 3. D-don't cry when you lose.",
    win: ['Hmph. Obviously.', 'Too slow, baka.', 'I win. Were you even trying?'],
    lose: ['Ugh! That one doesn\'t count.', "I let you have that. Don't get used to it.", 'Hmph. Lucky.'],
    draw: ['A tie? Stop copying me!', 'Same again? Annoying.'],
    matchWon: "I win the match, {score}. Not that it was hard.",
    matchLost: "You won, {score}. I-it's not like I care! Say \"again\" for a rematch.",
    triviaStart: "Trivia. Five questions. Try not to embarrass yourself.",
    right: ["Correct. I guess you're not completely hopeless.", 'Right. Hmph, lucky guess.', "Fine, that's correct."],
    wrong: 'Wrong, idiot. It was {answer}.',
    triviaEnd: "Done. {score} out of 5. {verdict}",
    twentyStart: "I'm thinking of something. Twenty yes or no questions. Go on then.",
    twentyWon: "Ugh, yes, it's {secret}. In {n} questions. Not that I'm impressed.",
    twentyLost: "Out of questions! It was {secret}. Hmph, too easy. Say \"again\" if you want to lose again.",
    numberStart: "I picked a number from 1 to 100. Guess. I'll tell you higher or lower.",
    numberWon: "{secret}. You got it in {n}. {verdict}",
    quit: "Hmph. Quitting? Fine, I was bored anyway.",
    again: 'Say "again" if you want another round.'
  }
}

const linesFor = (id: string): Lines => LINES[id] ?? LINES.robotico
const pick = <T>(arr: T[], rng: () => number): T => arr[Math.floor(rng() * arr.length) % arr.length]
const fill = (line: string, vars: Record<string, string | number>) => line.replace(/\{(\w+)\}/g, (_m, k: string) => String(vars[k] ?? ''))

// --- Understanding what was said ------------------------------------------------

const tidy = (s: string) =>
  s
    .toLowerCase()
    .replace(/[“”"]/g, '')
    .replace(/’/g, "'")
    .replace(/[.!?,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:hey|hi|ok|okay|so|um|uh)\s+(?:\w+\s+)?(?=let'?s|can we|play|start|i want|do you)/, '')

const START = String.raw`^(?:(?:can|could|shall|should) we |do you want to |wanna |want to |i want to |i wanna |let'?s |let us )?(?:play |do |start |have )?(?:a |an |some |a game of |a round of |another )?`

/** "let's play rock paper scissors", "quiz me", "20 questions". 'menu' is "let's play a game". */
export function parseGameStart(text: string): GameId | 'menu' | null {
  const t = tidy(text)
  if (t.split(' ').length > 12) return null
  if (new RegExp(`${START}(?:rock,? paper,? scissors?|rps|paper scissors rock|roshambo)(?: with me)?$`).test(t)) return 'rps'
  if (new RegExp(`${START}(?:trivia|quiz|pub quiz|trivia game|trivia quiz)(?: game)?(?: with me)?$`).test(t) || /^(?:quiz|test) me$|^ask me (?:some )?(?:trivia|quiz) questions$/.test(t)) return 'trivia'
  if (new RegExp(`${START}(?:20|twenty) questions(?: with me)?$`).test(t)) return 'twenty'
  if (new RegExp(`${START}(?:higher or lower|higher lower|number guessing(?: game)?|guess the number|guess my number|guessing game)(?: with me)?$`).test(t)) return 'number'
  if (new RegExp(`${START}(?:game|games)(?: with me)?$`).test(t) || /^(?:i'?m bored|entertain me|what games (?:can|do) you (?:play|know|have))$/.test(t)) return 'menu'
  return null
}

/** "stop", "I give up", "end the game". */
export function isQuit(text: string): boolean {
  return /^(?:stop|quit|end|exit|cancel|enough|no more|i'?m done|done|i give up|give up|forget it|never ?mind)(?: (?:the |this )?(?:game|playing|it|now|quiz))?$|^stop playing$|^(?:i )?don'?t want to play(?: anymore)?$/.test(tidy(text))
}

/** "again", "play again", "rematch", "one more". */
export function isAgain(text: string): boolean {
  return /^(?:again|play again|rematch|one more(?: time| game| round)?|another(?: one| round| game)?|go again|let'?s go again|yes|yeah|sure|ok|okay)$/.test(tidy(text))
}

const MOVES: Record<string, Move> = {
  rock: 'rock', rocks: 'rock', stone: 'rock', rok: 'rock', fist: 'rock',
  paper: 'paper', papers: 'paper', paypal: 'paper',
  scissors: 'scissors', scissor: 'scissors', sizzles: 'scissors', caesars: 'scissors', sissors: 'scissors'
}

function moveIn(text: string): Move | null {
  const found = new Set(tidy(text).split(' ').map((w) => MOVES[w]).filter(Boolean))
  return found.size === 1 ? [...found][0] : null
}

const NUM_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100
}

/** "42", "forty two", "forty-two", "a hundred". */
export function numberIn(text: string): number | null {
  const t = tidy(text).replace(/-/g, ' ')
  const digits = t.match(/\b\d{1,3}\b/)
  if (digits) return Number(digits[0])
  let total = 0
  let found = false
  for (const w of t.split(' ')) {
    if (w in NUM_WORDS) {
      total = w === 'hundred' ? (total || 1) * 100 : total + NUM_WORDS[w]
      found = true
    } else if (found && w !== 'and') break
  }
  return found ? total : null
}

// --- Twenty questions ---------------------------------------------------------

export interface Secret {
  name: string
  /** Other ways of saying it. */
  also: string[]
}

export const SECRETS: Secret[] = [
  { name: 'a penguin', also: ['penguin'] },
  { name: 'an elephant', also: ['elephant'] },
  { name: 'a dog', also: ['dog', 'puppy'] },
  { name: 'a cat', also: ['cat', 'kitten'] },
  { name: 'a shark', also: ['shark'] },
  { name: 'a giraffe', also: ['giraffe'] },
  { name: 'a spider', also: ['spider'] },
  { name: 'a horse', also: ['horse', 'pony'] },
  { name: 'an owl', also: ['owl'] },
  { name: 'a frog', also: ['frog', 'toad'] },
  { name: 'a pizza', also: ['pizza'] },
  { name: 'a banana', also: ['banana'] },
  { name: 'an apple', also: ['apple'] },
  { name: 'ice cream', also: ['ice cream', 'icecream'] },
  { name: 'a carrot', also: ['carrot'] },
  { name: 'chocolate', also: ['chocolate'] },
  { name: 'a guitar', also: ['guitar'] },
  { name: 'a piano', also: ['piano'] },
  { name: 'a bicycle', also: ['bicycle', 'bike'] },
  { name: 'a car', also: ['car'] },
  { name: 'an aeroplane', also: ['aeroplane', 'airplane', 'plane', 'jet'] },
  { name: 'a boat', also: ['boat', 'ship'] },
  { name: 'a phone', also: ['phone', 'smartphone', 'mobile'] },
  { name: 'a laptop', also: ['laptop', 'computer'] },
  { name: 'a toothbrush', also: ['toothbrush'] },
  { name: 'a chair', also: ['chair'] },
  { name: 'a pillow', also: ['pillow'] },
  { name: 'an umbrella', also: ['umbrella'] },
  { name: 'a clock', also: ['clock'] },
  { name: 'a book', also: ['book'] },
  { name: 'a football', also: ['football', 'soccer ball'] },
  { name: 'a candle', also: ['candle'] },
  { name: 'a tree', also: ['tree'] },
  { name: 'the Moon', also: ['moon'] },
  { name: 'the Sun', also: ['sun'] },
  { name: 'a volcano', also: ['volcano'] },
  { name: 'a rainbow', also: ['rainbow'] },
  { name: 'a snowman', also: ['snowman'] },
  { name: 'a robot', also: ['robot'] },
  { name: 'a pirate', also: ['pirate'] }
]

function guessed(text: string, s: Secret): boolean {
  const t = ` ${tidy(text)} `
  return s.also.some((w) => new RegExp(`\\b${w}s?\\b`).test(t))
}

// --- Running a game -----------------------------------------------------------------

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function triviaQuestion(state: Extract<GameState, { id: 'trivia' }>, rng: () => number): { state: typeof state; text: string } {
  const q = TRIVIA[state.order[state.round]]
  const order = shuffle([0, 1, 2], rng)
  const options = order.map((i) => q.options[i])
  const answer = order.indexOf(0)
  return {
    state: { ...state, options, answer },
    text: `Question ${state.round + 1}: ${q.q} ${options[0]}, ${options[1]}, or ${options[2]}?`
  }
}

const norm = (s: string) => s.toLowerCase().replace(/^the /, '').replace(/[^a-z0-9 ]/g, '').trim()

/** Which of the three options they said: by name, or "the first one", "B". */
export function optionIn(text: string, options: string[]): number | null {
  const t = ` ${norm(tidy(text))} `
  const hits = options.map((o, i) => (t.includes(` ${norm(o)} `) ? i : -1)).filter((i) => i >= 0)
  if (hits.length === 1) return hits[0]
  // Part of a long answer ("da vinci", "blue whale" said as "whale").
  const partial = options
    .map((o, i) => (norm(o).split(' ').some((w) => w.length > 3 && t.includes(` ${w} `)) ? i : -1))
    .filter((i) => i >= 0)
  if (partial.length === 1) return partial[0]
  const pos = t.match(/\b(?:(first|1st|a)|(second|2nd|middle|b)|(third|3rd|last|c))(?: one| option| answer)?\s*$/)
  if (pos && t.trim().split(' ').length <= 4) return pos[1] ? 0 : pos[2] ? 1 : 2
  return null
}

/** Starts a game. */
export function startGame(id: GameId, ctx: GameContext): { state: GameState; reply: GameReply } {
  const L = linesFor(ctx.personaId)
  switch (id) {
    case 'rps':
      return { state: { id, you: 0, me: 0, target: 3 }, reply: { say: L.rpsStart, emotion: 'excited' } }
    case 'trivia': {
      const order = shuffle(TRIVIA.map((_q, i) => i), ctx.rng).slice(0, 5)
      const first = triviaQuestion({ id, order, round: 0, score: 0, options: [], answer: 0 }, ctx.rng)
      return { state: first.state, reply: { say: `${L.triviaStart} ${first.text}`, emotion: 'excited' } }
    }
    case 'twenty':
      return { state: { id, secret: pick(SECRETS, ctx.rng), asked: 0 }, reply: { say: L.twentyStart, emotion: 'smug' } }
    case 'number':
      return { state: { id, secret: 1 + Math.floor(ctx.rng() * 100), guesses: 0 }, reply: { say: L.numberStart, emotion: 'happy' } }
  }
}

export function menuReply(personaId: string): GameReply {
  return { say: linesFor(personaId).menu, emotion: 'excited' }
}

export function quitReply(state: GameState, personaId: string): GameReply {
  const L = linesFor(personaId)
  if (state.id === 'twenty') return { say: fill(L.twentyLost, { secret: state.secret.name }), emotion: 'smug', over: true }
  if (state.id === 'number') return { say: `It was ${state.secret}. ${L.quit}`, emotion: 'smug', over: true }
  return { say: L.quit, emotion: 'smug', over: true }
}

const BEATS: Record<Move, Move> = { rock: 'scissors', paper: 'rock', scissors: 'paper' }
const MOVE_SAID: Record<Move, string> = { rock: 'Rock', paper: 'Paper', scissors: 'Scissors' }

/**
 * One turn. Returns null when what was said isn't a move in this game (so
 * the normal chat can answer it and the game carries on).
 */
export async function playTurn(
  state: GameState,
  text: string,
  ctx: GameContext
): Promise<{ state: GameState; reply: GameReply } | null> {
  const L = linesFor(ctx.personaId)
  switch (state.id) {
    case 'rps': {
      const you = moveIn(text)
      if (!you) return null
      const mine = pick<Move>(['rock', 'paper', 'scissors'], ctx.rng)
      const s = { ...state }
      let line: string
      let emotion: Emotion
      if (you === mine) (line = pick(L.draw, ctx.rng)), (emotion = 'surprised')
      else if (BEATS[mine] === you) s.me++, (line = pick(L.win, ctx.rng)), (emotion = 'smug')
      else s.you++, (line = pick(L.lose, ctx.rng)), (emotion = 'angry')
      const score = `${Math.max(s.you, s.me)} to ${Math.min(s.you, s.me)}`
      const said = `${MOVE_SAID[mine]}! ${line}`
      if (s.me >= s.target) return { state: s, reply: { say: `${said} ${fill(L.matchWon, { score })}`, emotion: 'smug', over: true } }
      if (s.you >= s.target) return { state: s, reply: { say: `${said} ${fill(L.matchLost, { score })}`, emotion: 'sad', over: true } }
      return { state: s, reply: { say: `${said} That's you ${s.you}, me ${s.me}.`, emotion } }
    }
    case 'trivia': {
      const picked = optionIn(text, state.options)
      if (picked === null) {
        if (tidy(text).split(' ').length > 6) return null
        return { state, reply: { say: `Pick one: ${state.options.join(', ')}.`, emotion: 'confused' } }
      }
      const right = picked === state.answer
      const s = { ...state, score: state.score + (right ? 1 : 0), round: state.round + 1 }
      const verdict = right ? pick(L.right, ctx.rng) : fill(L.wrong, { answer: state.options[state.answer] })
      if (s.round >= s.order.length) {
        const v = s.score >= 4 ? 'Impressive. Almost as smart as me.' : s.score >= 2 ? 'Not bad.' : 'Ouch. We need to study.'
        return { state: s, reply: { say: `${verdict} ${fill(L.triviaEnd, { score: s.score, verdict: v })} ${L.again}`, emotion: s.score >= 3 ? 'happy' : 'laughing', over: true } }
      }
      const next = triviaQuestion(s, ctx.rng)
      return { state: next.state, reply: { say: `${verdict} ${next.text}`, emotion: right ? 'happy' : 'smug' } }
    }
    case 'twenty': {
      const s = { ...state, asked: state.asked + 1 }
      if (guessed(text, s.secret)) {
        return { state: s, reply: { say: fill(L.twentyWon, { secret: s.secret.name, n: s.asked }), emotion: 'surprised', over: true } }
      }
      const judged = ctx.judge ? await ctx.judge(s.secret.name, text) : null
      if (!judged) return { state, reply: { say: "Hmm, I can't answer that one. Ask it a different way?", emotion: 'confused' } }
      const answer = { yes: 'Yes!', no: 'No.', sometimes: 'Sometimes.' }[judged.answer]
      if (s.asked >= 20) return { state: s, reply: { say: `${answer} ${fill(L.twentyLost, { secret: s.secret.name })}`, emotion: 'smug', over: true } }
      const left = 20 - s.asked
      return { state: s, reply: { say: `${answer} ${left} question${left === 1 ? '' : 's'} left.`, emotion: judged.answer === 'yes' ? 'happy' : 'smug' } }
    }
    case 'number': {
      const n = numberIn(text)
      if (n === null || n < 1 || n > 100) return null
      const s = { ...state, guesses: state.guesses + 1 }
      if (n === s.secret) {
        const v = s.guesses <= 5 ? 'Impressive!' : s.guesses <= 8 ? 'Not bad.' : 'Took you long enough.'
        return { state: s, reply: { say: `${fill(L.numberWon, { secret: s.secret, n: s.guesses, verdict: v })} ${L.again}`, emotion: 'surprised', over: true } }
      }
      return { state: s, reply: { say: n < s.secret ? 'Higher!' : 'Lower!', emotion: 'smug' } }
    }
  }
}

/** The prompt for the AI to answer one twenty-questions question about the secret. */
export function judgePrompt(secret: string, question: string): string {
  return (
    `(We're playing twenty questions. You secretly picked: ${secret}. ` +
    `The user asked: "${question.slice(0, 200)}". ` +
    `Answer truthfully about ${secret}: start with Yes, No or Sometimes, then at most five more words. Never say what you picked.)`
  )
}

/** Reads the AI's yes/no answer. */
export function readJudgement(reply: string): 'yes' | 'no' | 'sometimes' | null {
  const t = tidy(reply).replace(/^\[\w+\]\s*/, '')
  const first = t.match(/\b(yes|yeah|yep|yup|correct|absolutely|definitely|no|nope|nah|not|sometimes|maybe|partly|kind of|sort of|depends)\b/)
  if (!first) return null
  if (/^(?:yes|yeah|yep|yup|correct|absolutely|definitely)$/.test(first[1])) return 'yes'
  if (/^(?:no|nope|nah|not)$/.test(first[1])) return 'no'
  return 'sometimes'
}

// --- One game at a time ---------------------------------------------------------

export interface GameSession {
  /** A game is going on. */
  active(): boolean
  /** Handles what was said if it's about a game. Null lets the normal chat answer. */
  handle(text: string): Promise<GameReply | null>
}

const IDLE_MS = 10 * 60 * 1000
const AGAIN_MS = 3 * 60 * 1000

export function createGameSession(
  ctx: () => GameContext,
  /** Commands ("open Spotify") still work in the middle of a game. */
  isCommand: (text: string) => boolean = () => false,
  now: () => number = Date.now
): GameSession {
  let state: GameState | null = null
  let lastMove = 0
  let last: { id: GameId; at: number } | null = null

  const begin = (id: GameId): GameReply => {
    const started = startGame(id, ctx())
    state = started.state
    lastMove = now()
    return started.reply
  }

  return {
    active: () => state !== null && now() - lastMove < IDLE_MS,
    async handle(text) {
      if (state && now() - lastMove >= IDLE_MS) state = null
      const start = parseGameStart(text)
      if (start && start !== 'menu') return begin(start)
      if (state) {
        if (isQuit(text)) {
          const reply = quitReply(state, ctx().personaId)
          last = { id: state.id, at: now() }
          state = null
          return reply
        }
        if (isCommand(text)) return null
        const r = await playTurn(state, text, ctx())
        if (!r) return null
        lastMove = now()
        if (r.reply.over) {
          last = { id: r.state.id, at: now() }
          state = null
        } else state = r.state
        return r.reply
      }
      if (start === 'menu') return menuReply(ctx().personaId)
      if (last && now() - last.at < AGAIN_MS && isAgain(text)) return begin(last.id)
      return null
    }
  }
}
