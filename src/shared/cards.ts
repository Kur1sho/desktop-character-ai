// Playing cards, blackjack and poker hand ranking.

export type Suit = 's' | 'h' | 'd' | 'c'
export interface Card {
  /** 2..14 (11 jack, 12 queen, 13 king, 14 ace). */
  rank: number
  suit: Suit
}

export const SUITS: Suit[] = ['s', 'h', 'd', 'c']
export const SUIT_SYMBOL: Record<Suit, string> = { s: '♠', h: '♥', d: '♦', c: '♣' }
export const RANK_LABEL = (r: number) => (r <= 10 ? String(r) : { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[r]!)
const RANK_NAME: Record<number, string> = {
  2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten',
  11: 'jack', 12: 'queen', 13: 'king', 14: 'ace'
}
const plural = (r: number) => (r === 6 ? 'sixes' : `${RANK_NAME[r]}s`)

export function shuffledDeck(rng: () => number = Math.random): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) for (let rank = 2; rank <= 14; rank++) deck.push({ rank, suit })
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

// --- Blackjack ----------------------------------------------------------------

/** The best blackjack total, and whether an ace still counts as 11 ("soft"). */
export function handTotal(cards: Card[]): { total: number; soft: boolean } {
  let total = 0
  let aces = 0
  for (const c of cards) {
    if (c.rank === 14) {
      aces++
      total += 11
    } else total += Math.min(10, c.rank)
  }
  while (total > 21 && aces) {
    total -= 10
    aces--
  }
  return { total, soft: aces > 0 }
}

export const isBlackjack = (cards: Card[]) => cards.length === 2 && handTotal(cards).total === 21

export type BlackjackPhase = 'betting' | 'player' | 'done'
export type BlackjackOutcome = 'blackjack' | 'win' | 'lose' | 'push' | 'bust' | 'dealer-bust'

export interface BlackjackState {
  phase: BlackjackPhase
  deck: Card[]
  player: Card[]
  dealer: Card[]
  bet: number
  chips: number
  outcome: BlackjackOutcome | null
  /** Doubled down this hand. */
  doubled: boolean
}

export function newBlackjack(chips = 1000): BlackjackState {
  return { phase: 'betting', deck: [], player: [], dealer: [], bet: 0, chips, outcome: null, doubled: false }
}

function draw(s: BlackjackState, rng: () => number): Card {
  if (s.deck.length < 15) s.deck = shuffledDeck(rng)
  return s.deck.pop()!
}

export function dealBlackjack(prev: BlackjackState, bet: number, rng: () => number = Math.random): BlackjackState {
  const stake = Math.max(1, Math.min(Math.floor(bet), prev.chips))
  const s: BlackjackState = { ...prev, deck: [...prev.deck], player: [], dealer: [], bet: stake, chips: prev.chips - stake, outcome: null, doubled: false, phase: 'player' }
  s.player.push(draw(s, rng))
  s.dealer.push(draw(s, rng))
  s.player.push(draw(s, rng))
  s.dealer.push(draw(s, rng))
  if (isBlackjack(s.player) || isBlackjack(s.dealer)) return settle(s)
  return s
}

export function hit(prev: BlackjackState, rng: () => number = Math.random): BlackjackState {
  if (prev.phase !== 'player') return prev
  const s = { ...prev, deck: [...prev.deck], player: [...prev.player] }
  s.player.push(draw(s, rng))
  const t = handTotal(s.player).total
  if (t > 21) return settle(s)
  if (t === 21) return stand(s, rng)
  return s
}

export function canDouble(s: BlackjackState): boolean {
  return s.phase === 'player' && s.player.length === 2 && s.chips >= s.bet
}

export function doubleDown(prev: BlackjackState, rng: () => number = Math.random): BlackjackState {
  if (!canDouble(prev)) return prev
  const s = { ...prev, deck: [...prev.deck], player: [...prev.player], chips: prev.chips - prev.bet, bet: prev.bet * 2, doubled: true }
  s.player.push(draw(s, rng))
  if (handTotal(s.player).total > 21) return settle(s)
  return stand(s, rng)
}

/** The dealer draws to 17 and stands on all 17s. */
export function stand(prev: BlackjackState, rng: () => number = Math.random): BlackjackState {
  if (prev.phase !== 'player') return prev
  const s = { ...prev, deck: [...prev.deck], dealer: [...prev.dealer] }
  while (handTotal(s.dealer).total < 17) s.dealer.push(draw(s, rng))
  return settle(s)
}

function settle(s: BlackjackState): BlackjackState {
  const p = handTotal(s.player).total
  const d = handTotal(s.dealer).total
  let outcome: BlackjackOutcome
  if (p > 21) outcome = 'bust'
  else if (isBlackjack(s.player) && !isBlackjack(s.dealer)) outcome = 'blackjack'
  else if (isBlackjack(s.dealer) && !isBlackjack(s.player)) outcome = 'lose'
  else if (d > 21) outcome = 'dealer-bust'
  else if (p > d) outcome = 'win'
  else if (p < d) outcome = 'lose'
  else outcome = 'push'
  const payout = { blackjack: Math.floor(s.bet * 2.5), win: s.bet * 2, 'dealer-bust': s.bet * 2, push: s.bet, lose: 0, bust: 0 }[outcome]
  return { ...s, phase: 'done', outcome, chips: s.chips + payout }
}

// --- Poker hand ranking ----------------------------------------------------------

export const HAND_NAMES = [
  'High card',
  'Pair',
  'Two pair',
  'Three of a kind',
  'Straight',
  'Flush',
  'Full house',
  'Four of a kind',
  'Straight flush'
]

export interface HandValue {
  /** 0 (high card) to 8 (straight flush). */
  category: number
  /** Compare these in order to break ties. */
  kickers: number[]
  /** "Two pair, kings and fives". */
  name: string
}

/** The best five-card hand from five to seven cards. */
export function bestHand(cards: Card[]): HandValue {
  const counts = new Map<number, number>()
  const bySuit = new Map<Suit, number[]>()
  for (const c of cards) {
    counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1)
    bySuit.set(c.suit, [...(bySuit.get(c.suit) ?? []), c.rank])
  }
  const straightHigh = (ranks: number[]): number => {
    const set = new Set(ranks)
    if (set.has(14)) set.add(1)
    for (let hi = 14; hi >= 5; hi--) {
      let ok = true
      for (let k = 0; k < 5; k++) if (!set.has(hi - k)) ok = false
      if (ok) return hi
    }
    return 0
  }
  const flushRanks = [...bySuit.values()].find((r) => r.length >= 5)
  if (flushRanks) {
    const sf = straightHigh(flushRanks)
    if (sf) return { category: 8, kickers: [sf], name: sf === 14 ? 'Royal flush' : `Straight flush, ${RANK_NAME[sf]} high` }
  }
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  const ranksDesc = [...counts.keys()].sort((a, b) => b - a)
  const rest = (exclude: number[], n: number) => ranksDesc.filter((r) => !exclude.includes(r)).slice(0, n)
  if (groups[0][1] === 4) {
    const q = groups[0][0]
    return { category: 7, kickers: [q, ...rest([q], 1)], name: `Four ${plural(q)}` }
  }
  if (groups[0][1] === 3 && groups[1]?.[1] >= 2) {
    const t = groups[0][0]
    const pair = groups.slice(1).find((g) => g[1] >= 2)![0]
    return { category: 6, kickers: [t, pair], name: `Full house, ${plural(t)} full of ${plural(pair)}` }
  }
  if (flushRanks) {
    const top = [...flushRanks].sort((a, b) => b - a).slice(0, 5)
    return { category: 5, kickers: top, name: `Flush, ${RANK_NAME[top[0]]} high` }
  }
  const st = straightHigh(ranksDesc)
  if (st) return { category: 4, kickers: [st], name: `Straight, ${RANK_NAME[st]} high` }
  if (groups[0][1] === 3) {
    const t = groups[0][0]
    return { category: 3, kickers: [t, ...rest([t], 2)], name: `Three ${plural(t)}` }
  }
  if (groups[0][1] === 2 && groups[1]?.[1] === 2) {
    const [hi, lo] = [groups[0][0], groups[1][0]]
    return { category: 2, kickers: [hi, lo, ...rest([hi, lo], 1)], name: `Two pair, ${plural(hi)} and ${plural(lo)}` }
  }
  if (groups[0][1] === 2) {
    const p = groups[0][0]
    return { category: 1, kickers: [p, ...rest([p], 3)], name: `Pair of ${plural(p)}` }
  }
  return { category: 0, kickers: ranksDesc.slice(0, 5), name: `${RANK_NAME[ranksDesc[0]][0].toUpperCase()}${RANK_NAME[ranksDesc[0]].slice(1)} high` }
}

/** Positive if a beats b, negative if b wins, 0 for a split. */
export function compareHands(a: HandValue, b: HandValue): number {
  if (a.category !== b.category) return a.category - b.category
  for (let i = 0; i < Math.max(a.kickers.length, b.kickers.length); i++) {
    const d = (a.kickers[i] ?? 0) - (b.kickers[i] ?? 0)
    if (d) return d
  }
  return 0
}

/** Chance (0..1) that these hole cards win against one random hand, by dealing it out many times. */
export function winChance(hole: Card[], board: Card[], trials = 300, rng: () => number = Math.random): number {
  const used = new Set([...hole, ...board].map((c) => c.rank * 10 + SUITS.indexOf(c.suit)))
  const rest: Card[] = []
  for (const suit of SUITS) for (let rank = 2; rank <= 14; rank++) if (!used.has(rank * 10 + SUITS.indexOf(suit))) rest.push({ rank, suit })
  let score = 0
  for (let t = 0; t < trials; t++) {
    const pool = [...rest]
    const take = () => pool.splice(Math.floor(rng() * pool.length), 1)[0]
    const opp = [take(), take()]
    const full = [...board]
    while (full.length < 5) full.push(take())
    const d = compareHands(bestHand([...hole, ...full]), bestHand([...opp, ...full]))
    score += d > 0 ? 1 : d === 0 ? 0.5 : 0
  }
  return score / trials
}
