// Checkers (English draughts): 8x8, captures are compulsory, multi-jumps,
// kings move both ways. You play red from the bottom; the character plays
// black from the top. Includes the character's own search.

/** 0 empty, 1 red man, 2 red king, -1 black man, -2 black king. Index = row * 8 + col, row 0 at the top. */
export type Cells = number[]
export type Side = 1 | -1

export interface CheckersMove {
  /** The squares visited, starting square first. */
  path: number[]
  /** Squares of the pieces taken. */
  captured: number[]
}

export interface CheckersState {
  cells: Cells
  turn: Side
  /** Moves since the last capture or man move (draw at 80). */
  quiet: number
}

export const RED: Side = 1
export const BLACK: Side = -1

export function newCheckers(): CheckersState {
  const cells: Cells = Array(64).fill(0)
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) {
        if (r < 3) cells[r * 8 + c] = BLACK
        else if (r > 4) cells[r * 8 + c] = RED
      }
    }
  }
  return { cells, turn: RED, quiet: 0 }
}

const owner = (p: number): number => Math.sign(p)
const inside = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8

/** Directions a piece may move: red men go up (row - 1), black men go down, kings both. */
function dirs(p: number): [number, number][] {
  const up: [number, number][] = [[-1, -1], [-1, 1]]
  const down: [number, number][] = [[1, -1], [1, 1]]
  if (Math.abs(p) === 2) return [...up, ...down]
  return p > 0 ? up : down
}

function jumps(cells: Cells, from: number, piece: number, path: number[], taken: number[], out: CheckersMove[]): void {
  const r = Math.floor(from / 8)
  const c = from % 8
  let extended = false
  for (const [dr, dc] of dirs(piece)) {
    const mr = r + dr
    const mc = c + dc
    const tr = r + 2 * dr
    const tc = c + 2 * dc
    if (!inside(tr, tc)) continue
    const mid = mr * 8 + mc
    const to = tr * 8 + tc
    if (owner(cells[mid]) !== -owner(piece) || cells[to] !== 0 || taken.includes(mid)) continue
    extended = true
    // A man reaching the far row is crowned, and that ends the move.
    const crowned = Math.abs(piece) === 1 && (tr === 0 || tr === 7)
    const next = [...cells]
    next[from] = 0
    next[to] = piece
    if (crowned) out.push({ path: [...path, to], captured: [...taken, mid] })
    else jumps(next, to, piece, [...path, to], [...taken, mid], out)
  }
  if (!extended && taken.length) out.push({ path, captured: taken })
}

/** All legal moves for the side to play (captures only, if any capture exists). */
export function checkersMoves(s: CheckersState): CheckersMove[] {
  const caps: CheckersMove[] = []
  const steps: CheckersMove[] = []
  for (let i = 0; i < 64; i++) {
    const p = s.cells[i]
    if (owner(p) !== s.turn) continue
    jumps(s.cells, i, p, [i], [], caps)
    const r = Math.floor(i / 8)
    const c = i % 8
    for (const [dr, dc] of dirs(p)) {
      if (inside(r + dr, c + dc) && s.cells[(r + dr) * 8 + c + dc] === 0) steps.push({ path: [i, (r + dr) * 8 + c + dc], captured: [] })
    }
  }
  return caps.length ? caps : steps
}

export function applyCheckers(s: CheckersState, m: CheckersMove): CheckersState {
  const cells = [...s.cells]
  const from = m.path[0]
  const to = m.path[m.path.length - 1]
  let piece = cells[from]
  cells[from] = 0
  for (const x of m.captured) cells[x] = 0
  const row = Math.floor(to / 8)
  if (Math.abs(piece) === 1 && ((piece > 0 && row === 0) || (piece < 0 && row === 7))) piece *= 2
  cells[to] = piece
  const reset = m.captured.length > 0 || Math.abs(s.cells[from]) === 1
  return { cells, turn: (-s.turn) as Side, quiet: reset ? 0 : s.quiet + 1 }
}

/** 'red' or 'black' won, 'draw', or null while it's still going. */
export function checkersResult(s: CheckersState): 'red' | 'black' | 'draw' | null {
  if (s.quiet >= 80) return 'draw'
  if (checkersMoves(s).length) return null
  return s.turn === RED ? 'black' : 'red'
}

function evaluate(s: CheckersState, me: Side): number {
  let score = 0
  for (let i = 0; i < 64; i++) {
    const p = s.cells[i]
    if (!p) continue
    const row = Math.floor(i / 8)
    const col = i % 8
    let v = Math.abs(p) === 2 ? 175 : 100
    // Men are worth more as they get closer to being crowned; the centre is good.
    if (Math.abs(p) === 1) v += (p > 0 ? 7 - row : row) * 4
    if (col >= 2 && col <= 5 && row >= 2 && row <= 5) v += 6
    // Keeping the back row stops the other side crowning.
    if ((p === RED && row === 7) || (p === BLACK && row === 0)) v += 8
    score += owner(p) * v
  }
  return score * me
}

function search(s: CheckersState, depth: number, alpha: number, beta: number, me: Side, deadline: number): number {
  const moves = checkersMoves(s)
  if (!moves.length) return s.turn === me ? -10000 - depth : 10000 + depth
  if (depth <= 0 && !moves[0].captured.length) return evaluate(s, me)
  if (depth <= -6 || Date.now() > deadline) return evaluate(s, me)
  const maximizing = s.turn === me
  for (const m of moves) {
    const v = search(applyCheckers(s, m), depth - 1, alpha, beta, me, deadline)
    if (maximizing) alpha = Math.max(alpha, v)
    else beta = Math.min(beta, v)
    if (alpha >= beta) break
  }
  return maximizing ? alpha : beta
}

/** The character's move. `slack` makes it play looser (picks among near-best moves). */
export function bestCheckersMove(
  s: CheckersState,
  opts: { depth?: number; timeMs?: number; slack?: number; rng?: () => number } = {}
): CheckersMove | null {
  const moves = checkersMoves(s)
  if (moves.length <= 1) return moves[0] ?? null
  const deadline = Date.now() + (opts.timeMs ?? 1200)
  let scored = moves.map((m) => ({ m, v: 0 }))
  for (let d = 1; d <= (opts.depth ?? 8); d++) {
    const next = scored.map(({ m }) => ({ m, v: search(applyCheckers(s, m), d - 1, -1e9, 1e9, s.turn, deadline) }))
    if (Date.now() > deadline && d > 1) break
    scored = next.sort((a, b) => b.v - a.v)
  }
  const rng = opts.rng ?? Math.random
  const near = scored.filter((x) => x.v >= scored[0].v - (opts.slack ?? 0))
  return near[Math.floor(rng() * near.length)]?.m ?? scored[0].m
}
