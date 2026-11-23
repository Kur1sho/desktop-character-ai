import { describe, expect, it } from 'vitest'
import {
  applyCheckers,
  bestCheckersMove,
  checkersMoves,
  checkersResult,
  newCheckers,
  type CheckersState
} from '../src/shared/checkers'
import {
  bestHand,
  compareHands,
  dealBlackjack,
  doubleDown,
  handTotal,
  hit,
  newBlackjack,
  stand,
  type Card
} from '../src/shared/cards'
import { act, newPokerMatch, options, pokerAi, startHand, START_STACK } from '../src/shared/poker'
import { parseWindowGame } from '../src/shared/games'

const c = (s: string): Card => {
  const rank = { T: 10, J: 11, Q: 12, K: 13, A: 14 }[s[0]] ?? Number(s[0])
  return { rank, suit: s[1] as Card['suit'] }
}
const cards = (s: string) => s.split(' ').map(c)

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

describe('checkers', () => {
  it('starts with 7 moves for red', () => {
    expect(checkersMoves(newCheckers())).toHaveLength(7)
  })

  it('forces captures and chains jumps', () => {
    const cells = Array(64).fill(0)
    cells[7 * 8 + 0] = 1 // red man a1-ish
    cells[6 * 8 + 1] = -1
    cells[4 * 8 + 3] = -1
    cells[0 * 8 + 1] = -1
    const s: CheckersState = { cells, turn: 1, quiet: 0 }
    const moves = checkersMoves(s)
    expect(moves).toHaveLength(1)
    expect(moves[0].path).toEqual([56, 42, 28])
    expect(moves[0].captured).toEqual([49, 35])
  })

  it('crowns a man that reaches the far row', () => {
    const cells = Array(64).fill(0)
    cells[1 * 8 + 2] = 1
    cells[7 * 8 + 0] = -1
    const next = applyCheckers({ cells, turn: 1, quiet: 0 }, { path: [10, 1], captured: [] })
    expect(next.cells[1]).toBe(2)
  })

  it('takes a free piece', () => {
    const cells = Array(64).fill(0)
    cells[2 * 8 + 1] = -1
    cells[3 * 8 + 2] = 1
    cells[7 * 8 + 6] = 1
    const m = bestCheckersMove({ cells, turn: -1, quiet: 0 }, { depth: 3 })
    expect(m?.captured).toEqual([26])
  })

  it('plays whole games to the end without breaking the rules', () => {
    const rng = seeded(7)
    let s = newCheckers()
    let turns = 0
    while (!checkersResult(s) && turns < 300) {
      const m = bestCheckersMove(s, { depth: 2, timeMs: 50, slack: 40, rng })!
      expect(checkersMoves(s).some((x) => x.path.join() === m.path.join())).toBe(true)
      s = applyCheckers(s, m)
      turns++
    }
    expect(checkersResult(s)).not.toBeNull()
  })
})

describe('blackjack', () => {
  it('counts aces as 1 or 11', () => {
    expect(handTotal(cards('Ah Kd'))).toEqual({ total: 21, soft: true })
    expect(handTotal(cards('Ah Ad 9c'))).toEqual({ total: 21, soft: true })
    expect(handTotal(cards('Ah 9d 5c'))).toEqual({ total: 15, soft: false })
  })

  it('never loses chips it should not, over many hands', () => {
    const rng = seeded(3)
    let s = newBlackjack(1000)
    for (let i = 0; i < 300 && s.chips > 0; i++) {
      s = dealBlackjack(s, 10, rng)
      let guard = 0
      while (s.phase === 'player' && guard++ < 10) {
        const t = handTotal(s.player).total
        s = t < 12 && s.player.length === 2 ? doubleDown(s, rng) : t < 17 ? hit(s, rng) : stand(s, rng)
      }
      expect(s.phase).toBe('done')
      expect(handTotal(s.dealer).total >= 17 || s.outcome === 'bust' || s.outcome === 'blackjack' || s.dealer.length === 2).toBe(true)
      expect(s.chips).toBeGreaterThanOrEqual(0)
    }
  })

  it('pays 3 to 2 for blackjack', () => {
    const deck = cards('2c 3c 4c 5c 6c 7c 8c 9c Tc 2d 3d 4d 5d 6d 7d 8d 9d') // drawn from the end
    const s = dealBlackjack({ ...newBlackjack(100), deck: [...deck, c('9h'), c('Ks'), c('7h'), c('As')] }, 10)
    expect(s.outcome).toBe('blackjack')
    expect(s.chips).toBe(115)
  })
})

describe('poker hands', () => {
  it.each([
    ['Ah Kh Qh Jh Th 2c 3d', 'Royal flush'],
    ['9s 8s 7s 6s 5s Ah Ad', 'Straight flush, nine high'],
    ['Kc Kd Kh Ks 2c 3d 4h', 'Four kings'],
    ['Qc Qd Qh 9s 9c 2d 3h', 'Full house, queens full of nines'],
    ['Ah 9h 7h 4h 2h Kc Kd', 'Flush, ace high'],
    ['Ac 2d 3h 4s 5c Kd Qh', 'Straight, five high'],
    ['7c 7d 7h Ks 2c 3d 9h', 'Three sevens'],
    ['Jc Jd 4h 4s Ac 3d 9h', 'Two pair, jacks and fours'],
    ['Tc Td 4h 8s Ac 3d 9h', 'Pair of tens'],
    ['Ac Jd 4h 8s 6c 3d 9h', 'Ace high']
  ])('%s is %s', (hand, name) => expect(bestHand(cards(hand)).name).toBe(name))

  it('breaks ties with kickers', () => {
    const board = 'Kc Kd 7h 4s 2c'
    expect(compareHands(bestHand(cards(`Ah 3d ${board}`)), bestHand(cards(`Qh 3s ${board}`)))).toBeGreaterThan(0)
    expect(compareHands(bestHand(cards(`3h 2d ${board}`)), bestHand(cards(`3s 2s ${board}`)))).toBe(0)
  })
})

describe('poker', () => {
  it('lets the character play whole matches without losing any chips', () => {
    const rng = seeded(11)
    let s = startHand(newPokerMatch(), rng)
    let hands = 0
    for (let step = 0; step < 4000 && hands < 40; step++) {
      if (s.result) {
        expect(s.stacks[0] + s.stacks[1]).toBe(START_STACK * 2)
        if (s.stacks[0] === 0 || s.stacks[1] === 0) break
        s = startHand(s, rng)
        hands++
        continue
      }
      // Both seats use the character's brain.
      const flipped = s.toAct === 0 ? mirror(s) : s
      const a = pokerAi(flipped, rng, 40)
      s = act(s, a)
      const o = options(s, s.toAct)
      expect(o.toCall).toBeGreaterThanOrEqual(0)
    }
    expect(hands).toBeGreaterThan(5)
  })

  it('ends the hand when someone folds', () => {
    let s = startHand(newPokerMatch(), seeded(1))
    s = act(s, { type: 'fold' })
    expect(s.result?.folded).toBe(s.button)
    expect(s.stacks[0] + s.stacks[1]).toBe(START_STACK * 2)
  })

  it('runs out the board when both are all in', () => {
    let s = startHand(newPokerMatch(), seeded(2))
    s = act(s, { type: 'raise', to: 10000 })
    s = act(s, { type: 'call' })
    expect(s.board).toHaveLength(5)
    expect(s.result?.hands).toBeDefined()
    expect(s.stacks[0] + s.stacks[1]).toBe(START_STACK * 2)
  })
})

/** The same table seen from the other seat, so the AI can play for you too in tests. */
function mirror(s: ReturnType<typeof startHand>) {
  return {
    ...s,
    hole: [s.hole[1], s.hole[0]] as typeof s.hole,
    stacks: [s.stacks[1], s.stacks[0]] as typeof s.stacks,
    bets: [s.bets[1], s.bets[0]] as typeof s.bets,
    toAct: 1 as const
  }
}

describe('opening the game window', () => {
  it.each([
    ["let's play chess", 'chess'],
    ['play checkers with me', 'checkers'],
    ["let's play poker", 'poker'],
    ['texas holdem', 'poker'],
    ['play blackjack', 'blackjack'],
    ['rock paper scissors', 'rps'],
    ['quiz me', 'trivia'],
    ["let's play a game", ''],
    ['play some lofi', null],
    ['twenty questions', null]
  ])('"%s"', (text, want) => expect(parseWindowGame(text)).toBe(want))
})
