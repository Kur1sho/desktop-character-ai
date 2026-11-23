// Heads-up Texas Hold'em, you against the character. No-limit, blinds 10/20,
// 1000 chips each. The character decides from its chance of winning (worked
// out by dealing the hand many times), the price of calling, and a little bluffing.
import { bestHand, compareHands, shuffledDeck, winChance, type Card, type HandValue } from './cards'

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'
export type Who = 0 | 1 // 0 = you, 1 = the character

export interface PokerState {
  deck: Card[]
  hole: [Card[], Card[]]
  board: Card[]
  stacks: [number, number]
  /** Put in on this street. */
  bets: [number, number]
  /** From earlier streets. */
  pot: number
  street: Street
  toAct: Who
  /** Small blind (and dealer); acts first before the flop, last after. */
  button: Who
  /** Size of the last raise, for the minimum raise. */
  lastRaise: number
  acted: [boolean, boolean]
  /** Set when the hand has ended. */
  result: { winner: Who | 'split'; text: string; hands?: [HandValue, HandValue]; folded?: Who; amount: number } | null
  /** Last few things that happened, for the table ("Robotico raises to 60"). */
  log: string[]
}

export const SMALL_BLIND = 10
export const BIG_BLIND = 20
export const START_STACK = 1000

export type PokerAction = { type: 'fold' } | { type: 'check' } | { type: 'call' } | { type: 'raise'; to: number }

export function newPokerMatch(): PokerState {
  return {
    deck: [], hole: [[], []], board: [], stacks: [START_STACK, START_STACK], bets: [0, 0], pot: 0,
    street: 'showdown', toAct: 0, button: 1, lastRaise: BIG_BLIND, acted: [false, false],
    result: { winner: 'split', text: '', amount: 0 }, log: []
  }
}

/** The match is over when someone has no chips left. */
export function matchWinner(s: PokerState): Who | null {
  if (!s.result) return null
  if (s.stacks[0] <= 0) return 1
  if (s.stacks[1] <= 0) return 0
  return null
}

export function startHand(prev: PokerState, rng: () => number = Math.random, names: [string, string] = ['You', 'Me']): PokerState {
  const deck = shuffledDeck(rng)
  const button: Who = prev.button === 0 ? 1 : 0
  const other: Who = button === 0 ? 1 : 0
  const stacks: [number, number] = [...prev.stacks]
  const bets: [number, number] = [0, 0]
  const sb = Math.min(SMALL_BLIND, stacks[button])
  const bb = Math.min(BIG_BLIND, stacks[other])
  stacks[button] -= sb
  bets[button] = sb
  stacks[other] -= bb
  bets[other] = bb
  const hole: [Card[], Card[]] = [[deck.pop()!, deck.pop()!], [deck.pop()!, deck.pop()!]]
  return {
    deck, hole, board: [], stacks, bets, pot: 0, street: 'preflop', toAct: button, button,
    lastRaise: BIG_BLIND, acted: [false, false], result: null,
    log: [`${names[button]} post${button === 0 ? '' : 's'} the small blind, ${names[other]} post${other === 0 ? '' : 's'} the big blind.`]
  }
}

export interface Options {
  canCheck: boolean
  /** Chips needed to call (0 if checking is possible). */
  toCall: number
  canRaise: boolean
  /** Smallest and largest total bet this street for a raise. */
  minRaiseTo: number
  maxRaiseTo: number
}

export function options(s: PokerState, who: Who = s.toAct): Options {
  const opp: Who = who === 0 ? 1 : 0
  const toCall = Math.max(0, s.bets[opp] - s.bets[who])
  const maxRaiseTo = s.bets[who] + s.stacks[who]
  const minRaiseTo = Math.min(maxRaiseTo, s.bets[opp] + Math.max(s.lastRaise, BIG_BLIND))
  // No raising when the other player is all in, or you can only just call.
  const canRaise = s.stacks[opp] > 0 && maxRaiseTo > s.bets[opp]
  return { canCheck: toCall === 0, toCall: Math.min(toCall, s.stacks[who]), canRaise, minRaiseTo, maxRaiseTo }
}

const potTotal = (s: PokerState) => s.pot + s.bets[0] + s.bets[1]

export function act(prev: PokerState, action: PokerAction, names: [string, string] = ['You', 'Me']): PokerState {
  if (prev.result) return prev
  const s: PokerState = { ...prev, stacks: [...prev.stacks], bets: [...prev.bets], acted: [...prev.acted], board: [...prev.board], deck: [...prev.deck], log: [...prev.log] }
  const me = s.toAct
  const opp: Who = me === 0 ? 1 : 0
  const o = options(s, me)
  const name = names[me]
  const verb = (base: string) => (me === 0 ? base : `${base}s`)
  switch (action.type) {
    case 'fold': {
      const amount = potTotal(s)
      s.stacks[opp] += amount
      s.log.push(`${name} ${verb('fold')}.`)
      s.result = { winner: opp, text: `${names[opp]} win${opp === 0 ? '' : 's'} ${amount}.`, folded: me, amount }
      return s
    }
    case 'check':
      if (!o.canCheck) return act(prev, { type: 'call' }, names)
      s.log.push(`${name} ${verb('check')}.`)
      break
    case 'call': {
      if (o.toCall === 0) return act(prev, { type: 'check' }, names)
      s.stacks[me] -= o.toCall
      s.bets[me] += o.toCall
      s.log.push(`${name} ${verb('call')} ${o.toCall}${s.stacks[me] === 0 ? ' and is all in' : ''}.`.replace('You call 0', 'You check'))
      break
    }
    case 'raise': {
      if (!o.canRaise) return act(prev, { type: 'call' }, names)
      const to = Math.max(o.minRaiseTo, Math.min(o.maxRaiseTo, Math.floor(action.to)))
      const add = to - s.bets[me]
      s.lastRaise = Math.max(s.lastRaise, to - s.bets[opp])
      s.stacks[me] -= add
      s.bets[me] = to
      // A raise reopens the betting for the other player.
      s.acted[opp] = false
      s.log.push(`${name} ${s.bets[opp] === 0 ? verb('bet') : verb('raise') + ' to'} ${to}${s.stacks[me] === 0 ? ' (all in)' : ''}.`)
      break
    }
  }
  s.acted[me] = true
  const even = s.bets[0] === s.bets[1]
  const someoneAllIn = s.stacks[0] === 0 || s.stacks[1] === 0
  // Calling an all-in that was bigger than your stack still ends the betting.
  const calledShort = action.type === 'call' && s.stacks[me] === 0
  if ((even && s.acted[0] && s.acted[1]) || calledShort || (someoneAllIn && even && s.acted[me] && action.type !== 'raise')) {
    return nextStreet(s, names)
  }
  s.toAct = opp
  return s
}

function nextStreet(s: PokerState, names: [string, string]): PokerState {
  // Return any chips the other player couldn't match.
  const matched = Math.min(s.bets[0], s.bets[1])
  for (const w of [0, 1] as Who[]) {
    s.stacks[w] += s.bets[w] - matched
  }
  s.pot += matched * 2
  s.bets = [0, 0]
  s.acted = [false, false]
  s.lastRaise = BIG_BLIND
  const allIn = s.stacks[0] === 0 || s.stacks[1] === 0
  const deal = (n: number) => {
    s.deck.pop() // burn
    for (let i = 0; i < n; i++) s.board.push(s.deck.pop()!)
  }
  const order: Street[] = ['preflop', 'flop', 'turn', 'river', 'showdown']
  do {
    const next = order[order.indexOf(s.street) + 1]
    s.street = next
    if (next === 'flop') deal(3)
    else if (next === 'turn' || next === 'river') deal(1)
  } while (allIn && s.street !== 'showdown')
  if (s.street === 'showdown') return showdown(s, names)
  // After the flop the big blind (not the button) acts first.
  s.toAct = s.button === 0 ? 1 : 0
  return s
}

function showdown(s: PokerState, names: [string, string]): PokerState {
  const hands: [HandValue, HandValue] = [bestHand([...s.hole[0], ...s.board]), bestHand([...s.hole[1], ...s.board])]
  const d = compareHands(hands[0], hands[1])
  const amount = s.pot
  if (d === 0) {
    const half = Math.floor(amount / 2)
    s.stacks[0] += half
    s.stacks[1] += amount - half
    s.result = { winner: 'split', text: `Split pot, both with ${hands[0].name.toLowerCase()}.`, hands, amount }
  } else {
    const w: Who = d > 0 ? 0 : 1
    s.stacks[w] += amount
    s.result = { winner: w, text: `${names[w]} win${w === 0 ? '' : 's'} ${amount} with ${hands[w].name.toLowerCase()}.`, hands, amount }
  }
  s.pot = 0
  return s
}

/** What the character does. `trials` trades thinking time for accuracy. */
export function pokerAi(s: PokerState, rng: () => number = Math.random, trials = 250): PokerAction {
  const me: Who = 1
  const o = options(s, me)
  const equity = winChance(s.hole[me], s.board, trials, rng)
  const pot = potTotal(s)
  const potOdds = o.toCall / (pot + o.toCall || 1)
  const bluff = rng() < (s.street === 'river' ? 0.08 : 0.12)
  const raiseTo = (fraction: number) => Math.round(Math.max(o.minRaiseTo, Math.min(o.maxRaiseTo, s.bets[1 - me] + pot * fraction)))
  if (o.canRaise && (equity > 0.78 || (equity > 0.62 && rng() < 0.6) || (bluff && o.toCall <= BIG_BLIND * 2))) {
    const size = equity > 0.85 && rng() < 0.3 ? 1.2 : 0.6 + rng() * 0.3
    return { type: 'raise', to: raiseTo(size) }
  }
  if (o.canCheck) return { type: 'check' }
  // Call when the chance of winning beats the price, with a small margin for being a tough opponent.
  if (equity >= potOdds - 0.04 || (o.toCall <= BIG_BLIND && equity > 0.3)) return { type: 'call' }
  return { type: 'fold' }
}
