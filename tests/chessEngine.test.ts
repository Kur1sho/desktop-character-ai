import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { bestMove, Board, perft } from '../src/shared/chessEngine'

describe('chess move generator', () => {
  // Known move counts (perft) catch mistakes in castling, en passant and promotion.
  it.each([
    ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 3, 8902],
    ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 4, 197281],
    ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', 3, 97862],
    ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', 4, 43238],
    ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', 3, 9467],
    ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', 3, 62379]
  ])('%s to depth %i', (fen, depth, want) => expect(perft(new Board(fen), depth)).toBe(want))
})

describe('chess search', () => {
  it('finds mate in one', () => {
    expect(bestMove('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', { maxDepth: 3, timeMs: 2000 })).toBe('a1a8')
  })
  it('takes a free queen', () => {
    expect(bestMove('rnb1kbnr/pppp1ppp/8/4p3/5q2/3P4/PPP1PPPP/RNBQKBNR w KQkq - 0 3', { maxDepth: 3 })).toBe('c1f4')
  })
  it('always plays a legal move, also when going easy', () => {
    const game = new Chess()
    let i = 0
    for (; i < 30 && !game.isGameOver(); i++) {
      const uci = bestMove(game.fen(), { maxDepth: 2, timeMs: 200, slack: i % 2 ? 80 : 0 })!
      expect(() => game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })).not.toThrow()
    }
    expect(i).toBeGreaterThan(5)
  })
})
