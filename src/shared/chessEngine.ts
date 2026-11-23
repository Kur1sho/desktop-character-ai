// The character's own chess brain: a small, fast 0x88 engine with alpha-beta
// search. The rules shown to the player come from chess.js; this only picks
// the character's move (and is checked against chess.js before it's played).
// Written for this app, so there are no licence strings attached.

const EMPTY = 0
const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6
const WHITE = 1, BLACK = -1

const N_DIRS = [33, 31, 18, 14, -33, -31, -18, -14]
const B_DIRS = [17, 15, -17, -15]
const R_DIRS = [16, 1, -16, -1]
const K_DIRS = [...B_DIRS, ...R_DIRS]

const VALUE = [0, 100, 320, 330, 500, 900, 20000]

// Piece-square tables from White's side, rank 8 first (a8..h8, ..., a1..h1).
const PST: Record<number, number[]> = {
  [P]: [
    0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0
  ],
  [N]: [
    -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50
  ],
  [B]: [
    -20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20
  ],
  [R]: [
    0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0
  ],
  [Q]: [
    -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20
  ],
  [K]: [
    -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20
  ]
}
const K_END = [
  -50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50
]

/** 0x88 square -> 0..63 index into the tables (rank 8 first), seen from that colour. */
function pstIndex(sq: number, color: number): number {
  const file = sq & 7
  const rank = sq >> 4 // 0 = rank 1
  return color === WHITE ? (7 - rank) * 8 + file : rank * 8 + file
}

interface Move {
  from: number
  to: number
  promo: number
  /** Captured piece (signed), 0 for none. */
  captured: number
  flag: 0 | 1 | 2 | 3 // 0 normal, 1 en passant, 2 castle, 3 double pawn push
}

interface Undo {
  move: Move
  castling: number
  ep: number
  half: number
  hash: number
}

const sqName = (sq: number) => 'abcdefgh'[sq & 7] + String((sq >> 4) + 1)
const parseSq = (s: string) => ('abcdefgh'.indexOf(s[0]) | ((Number(s[1]) - 1) << 4))

// Zobrist keys for spotting repeated positions in search (32-bit is enough here).
const ZOBRIST = (() => {
  let seed = 0x9e3779b9
  const next = () => {
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    return seed >>> 0
  }
  const pieces = Array.from({ length: 13 }, () => Array.from({ length: 128 }, next))
  return { pieces, side: next(), castle: Array.from({ length: 16 }, next), ep: Array.from({ length: 128 }, next) }
})()

export class Board {
  sq = new Int8Array(128)
  side = WHITE
  /** Bits: 1 white king side, 2 white queen side, 4 black king side, 8 black queen side. */
  castling = 0
  ep = -1
  half = 0
  hash = 0
  private stack: Undo[] = []
  history: number[] = []

  constructor(fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1') {
    this.load(fen)
  }

  load(fen: string): void {
    const [placement, side, castle, ep, half] = fen.trim().split(/\s+/)
    this.sq.fill(EMPTY)
    let rank = 7
    let file = 0
    for (const c of placement) {
      if (c === '/') {
        rank--
        file = 0
      } else if (/\d/.test(c)) file += Number(c)
      else {
        const t = 'pnbrqk'.indexOf(c.toLowerCase()) + 1
        this.sq[(rank << 4) | file] = c === c.toUpperCase() ? t : -t
        file++
      }
    }
    this.side = side === 'b' ? BLACK : WHITE
    this.castling = (castle.includes('K') ? 1 : 0) | (castle.includes('Q') ? 2 : 0) | (castle.includes('k') ? 4 : 0) | (castle.includes('q') ? 8 : 0)
    this.ep = ep && ep !== '-' ? parseSq(ep) : -1
    this.half = Number(half) || 0
    this.stack = []
    this.hash = this.computeHash()
    this.history = [this.hash]
  }

  private computeHash(): number {
    let h = 0
    for (let s = 0; s < 128; s++) if (!(s & 0x88) && this.sq[s]) h ^= ZOBRIST.pieces[this.sq[s] + 6][s]
    if (this.side === BLACK) h ^= ZOBRIST.side
    h ^= ZOBRIST.castle[this.castling]
    if (this.ep >= 0) h ^= ZOBRIST.ep[this.ep]
    return h >>> 0
  }

  attacked(s: number, by: number): boolean {
    // Pawns
    const pawnFrom = by === WHITE ? [s - 15, s - 17] : [s + 15, s + 17]
    for (const f of pawnFrom) if (!(f & 0x88) && this.sq[f] === by * P) return true
    for (const d of N_DIRS) {
      const f = s + d
      if (!(f & 0x88) && this.sq[f] === by * N) return true
    }
    for (const d of K_DIRS) {
      const f = s + d
      if (!(f & 0x88) && this.sq[f] === by * K) return true
    }
    for (const d of B_DIRS) {
      for (let f = s + d; !(f & 0x88); f += d) {
        const p = this.sq[f]
        if (p) {
          if (p === by * B || p === by * Q) return true
          break
        }
      }
    }
    for (const d of R_DIRS) {
      for (let f = s + d; !(f & 0x88); f += d) {
        const p = this.sq[f]
        if (p) {
          if (p === by * R || p === by * Q) return true
          break
        }
      }
    }
    return false
  }

  kingSq(color: number): number {
    for (let s = 0; s < 128; s++) if (!(s & 0x88) && this.sq[s] === color * K) return s
    return -1
  }

  inCheck(color = this.side): boolean {
    const k = this.kingSq(color)
    return k >= 0 && this.attacked(k, -color)
  }

  /** Moves that may leave the king in check (filtered by legalMoves). */
  pseudoMoves(capturesOnly = false): Move[] {
    const out: Move[] = []
    const us = this.side
    const add = (from: number, to: number, flag: Move['flag'] = 0) => {
      const captured = flag === 1 ? -us * P : this.sq[to]
      const piece = this.sq[from] * us
      if (piece === P && ((to >> 4) === 7 || (to >> 4) === 0)) {
        for (const promo of [Q, N, R, B]) out.push({ from, to, promo, captured, flag })
      } else out.push({ from, to, promo: 0, captured, flag })
    }
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) {
        s += 7
        continue
      }
      const p = this.sq[s] * us
      if (p <= 0) continue
      if (p === P) {
        const fwd = us === WHITE ? 16 : -16
        const startRank = us === WHITE ? 1 : 6
        const one = s + fwd
        if (!capturesOnly && !(one & 0x88) && !this.sq[one]) {
          add(s, one)
          const two = one + fwd
          if ((s >> 4) === startRank && !this.sq[two]) add(s, two, 3)
        } else if (capturesOnly && !(one & 0x88) && !this.sq[one] && ((one >> 4) === 7 || (one >> 4) === 0)) {
          add(s, one) // promotions count as noisy
        }
        for (const d of [fwd - 1, fwd + 1]) {
          const t = s + d
          if (t & 0x88) continue
          if (this.sq[t] * us < 0) add(s, t)
          else if (t === this.ep) add(s, t, 1)
        }
      } else if (p === N || p === K) {
        for (const d of p === N ? N_DIRS : K_DIRS) {
          const t = s + d
          if (t & 0x88) continue
          const q = this.sq[t] * us
          if (q > 0 || (capturesOnly && q === 0)) continue
          add(s, t)
        }
        if (p === K && !capturesOnly) this.castles(s, add)
      } else {
        const dirs = p === B ? B_DIRS : p === R ? R_DIRS : K_DIRS
        for (const d of dirs) {
          for (let t = s + d; !(t & 0x88); t += d) {
            const q = this.sq[t] * us
            if (q > 0) break
            if (q < 0) {
              add(s, t)
              break
            }
            if (!capturesOnly) add(s, t)
          }
        }
      }
    }
    return out
  }

  private castles(s: number, add: (from: number, to: number, flag: Move['flag']) => void): void {
    const us = this.side
    const home = us === WHITE ? 4 : 0x74
    if (s !== home || this.attacked(s, -us)) return
    const [kBit, qBit] = us === WHITE ? [1, 2] : [4, 8]
    if (this.castling & kBit && !this.sq[s + 1] && !this.sq[s + 2] && this.sq[s + 3] === us * R) {
      if (!this.attacked(s + 1, -us) && !this.attacked(s + 2, -us)) add(s, s + 2, 2)
    }
    if (this.castling & qBit && !this.sq[s - 1] && !this.sq[s - 2] && !this.sq[s - 3] && this.sq[s - 4] === us * R) {
      if (!this.attacked(s - 1, -us) && !this.attacked(s - 2, -us)) add(s, s - 2, 2)
    }
  }

  make(m: Move): boolean {
    const us = this.side
    this.stack.push({ move: m, castling: this.castling, ep: this.ep, half: this.half, hash: this.hash })
    let h = this.hash
    const piece = this.sq[m.from]
    h ^= ZOBRIST.pieces[piece + 6][m.from]
    if (m.captured) {
      const capSq = m.flag === 1 ? m.to - (us === WHITE ? 16 : -16) : m.to
      h ^= ZOBRIST.pieces[m.captured + 6][capSq]
      this.sq[capSq] = EMPTY
    }
    const placed = m.promo ? us * m.promo : piece
    this.sq[m.to] = placed
    this.sq[m.from] = EMPTY
    h ^= ZOBRIST.pieces[placed + 6][m.to]
    if (m.flag === 2) {
      const [rf, rt] = m.to > m.from ? [m.from + 3, m.from + 1] : [m.from - 4, m.from - 1]
      const rook = this.sq[rf]
      this.sq[rt] = rook
      this.sq[rf] = EMPTY
      h ^= ZOBRIST.pieces[rook + 6][rf] ^ ZOBRIST.pieces[rook + 6][rt]
    }
    h ^= ZOBRIST.castle[this.castling]
    for (const s of [m.from, m.to]) {
      if (s === 4) this.castling &= ~3
      if (s === 0x74) this.castling &= ~12
      if (s === 0) this.castling &= ~2
      if (s === 7) this.castling &= ~1
      if (s === 0x70) this.castling &= ~8
      if (s === 0x77) this.castling &= ~4
    }
    h ^= ZOBRIST.castle[this.castling]
    if (this.ep >= 0) h ^= ZOBRIST.ep[this.ep]
    this.ep = m.flag === 3 ? (m.from + m.to) >> 1 : -1
    if (this.ep >= 0) h ^= ZOBRIST.ep[this.ep]
    this.half = Math.abs(piece) === P || m.captured ? 0 : this.half + 1
    this.side = -us
    h ^= ZOBRIST.side
    this.hash = h >>> 0
    this.history.push(this.hash)
    if (this.inCheck(us)) {
      this.unmake()
      return false
    }
    return true
  }

  unmake(): void {
    const u = this.stack.pop()
    if (!u) return
    this.history.pop()
    const m = u.move
    this.side = -this.side
    const us = this.side
    const moved = m.promo ? us * P : this.sq[m.to]
    this.sq[m.from] = moved
    this.sq[m.to] = EMPTY
    if (m.captured) {
      const capSq = m.flag === 1 ? m.to - (us === WHITE ? 16 : -16) : m.to
      this.sq[capSq] = m.captured
    }
    if (m.flag === 2) {
      const [rf, rt] = m.to > m.from ? [m.from + 3, m.from + 1] : [m.from - 4, m.from - 1]
      this.sq[rf] = this.sq[rt]
      this.sq[rt] = EMPTY
    }
    this.castling = u.castling
    this.ep = u.ep
    this.half = u.half
    this.hash = u.hash
  }

  legalMoves(): Move[] {
    return this.pseudoMoves().filter((m) => {
      if (!this.make(m)) return false
      this.unmake()
      return true
    })
  }

  /** Times this position came up before (for draws by repetition). */
  repeats(): number {
    let n = 0
    const h = this.hash
    for (let i = this.history.length - 3; i >= Math.max(0, this.history.length - 1 - this.half); i -= 2) if (this.history[i] === h) n++
    return n
  }

  evaluate(): number {
    let score = 0
    let material = 0
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) continue
      const p = this.sq[s]
      if (!p) continue
      const t = Math.abs(p)
      if (t !== K && t !== P) material += VALUE[t]
    }
    const endgame = material <= 2600
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) continue
      const p = this.sq[s]
      if (!p) continue
      const color = p > 0 ? WHITE : BLACK
      const t = Math.abs(p)
      const table = t === K && endgame ? K_END : PST[t]
      score += color * (VALUE[t] + table[pstIndex(s, color)])
    }
    return score * this.side
  }
}

/** Counts move paths to a depth (for checking the move generator against known numbers). */
export function perft(board: Board, depth: number): number {
  if (depth === 0) return 1
  let n = 0
  for (const m of board.pseudoMoves()) {
    if (!board.make(m)) continue
    n += perft(board, depth - 1)
    board.unmake()
  }
  return n
}

const MATE = 100000

export interface SearchOptions {
  /** Stop starting new depths after this long. */
  timeMs?: number
  maxDepth?: number
  /** Easier play: picks among moves within this many centipawns of the best. */
  slack?: number
  rng?: () => number
}

/** The best move for the side to move, as UCI ("e2e4", "e7e8q"), or null if there are none. */
export function bestMove(fen: string, opts: SearchOptions = {}): string | null {
  const board = new Board(fen)
  const maxDepth = opts.maxDepth ?? 5
  const deadline = Date.now() + (opts.timeMs ?? 1500)
  const rng = opts.rng ?? Math.random
  let nodes = 0
  let stopped = false
  const killers: Move[][] = []

  const order = (moves: Move[], ply: number, first?: Move | null) => {
    const k = killers[ply] ?? []
    const score = (m: Move) => {
      if (first && m.from === first.from && m.to === first.to && m.promo === first.promo) return 1e9
      if (m.captured) return 1e6 + VALUE[Math.abs(m.captured)] * 10 - VALUE[Math.abs(board.sq[m.from])]
      if (m.promo) return 9e5
      if (k.some((x) => x.from === m.from && x.to === m.to)) return 8e5
      return 0
    }
    return moves.map((m) => [score(m), m] as const).sort((a, b) => b[0] - a[0]).map((x) => x[1])
  }

  const quiesce = (alpha: number, beta: number, depth: number): number => {
    nodes++
    const stand = board.evaluate()
    if (stand >= beta) return beta
    if (stand > alpha) alpha = stand
    if (depth <= -6) return alpha
    for (const m of order(board.pseudoMoves(true), 63)) {
      if (!board.make(m)) continue
      const s = -quiesce(-beta, -alpha, depth - 1)
      board.unmake()
      if (s >= beta) return beta
      if (s > alpha) alpha = s
    }
    return alpha
  }

  const search = (depth: number, alpha: number, beta: number, ply: number): number => {
    if ((++nodes & 1023) === 0 && Date.now() > deadline) stopped = true
    if (stopped) return 0
    if (ply > 0 && (board.half >= 100 || board.repeats() > 0)) return 0
    const check = board.inCheck()
    if (check) depth++
    if (depth <= 0) return quiesce(alpha, beta, 0)
    let legal = 0
    for (const m of order(board.pseudoMoves(), ply)) {
      if (!board.make(m)) continue
      legal++
      const s = -search(depth - 1, -beta, -alpha, ply + 1)
      board.unmake()
      if (stopped) return 0
      if (s >= beta) {
        if (!m.captured) killers[ply] = [m, ...(killers[ply] ?? [])].slice(0, 2)
        return beta
      }
      if (s > alpha) alpha = s
    }
    if (!legal) return check ? -MATE + ply : 0
    return alpha
  }

  const root = board.legalMoves()
  if (!root.length) return null
  let best: { move: Move; score: number }[] = root.map((move) => ({ move, score: 0 }))
  for (let depth = 1; depth <= maxDepth; depth++) {
    const scored: { move: Move; score: number }[] = []
    let alpha = -MATE * 2
    for (const { move } of best) {
      board.make(move)
      // Full window when picking among near-equal moves, so their scores are real.
      const s = -search(depth - 1, -MATE * 2, opts.slack ? MATE * 2 : -alpha, 1)
      board.unmake()
      if (stopped) break
      scored.push({ move, score: s })
      if (s > alpha) alpha = s
    }
    if (stopped) {
      // An unfinished depth: keep the last full result, unless a move searched so far beat the old best.
      const top = scored.sort((a, b) => b.score - a.score)[0]
      if (top && scored.length > 1 && top.move !== best[0].move) best = [top, ...best.filter((b) => b.move !== top.move)]
      break
    }
    best = scored.sort((a, b) => b.score - a.score)
    if (Math.abs(best[0].score) > MATE - 100) break
    if (Date.now() > deadline) break
  }
  let chosen = best[0]
  if (opts.slack) {
    const near = best.filter((b) => b.score >= best[0].score - opts.slack!)
    chosen = near[Math.floor(rng() * near.length)] ?? best[0]
  }
  const m = chosen.move
  return sqName(m.from) + sqName(m.to) + (m.promo ? ' nbrq'[m.promo - 1] : '')
}
