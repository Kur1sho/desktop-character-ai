// Chess against the character. chess.js keeps the rules; the character's own engine picks its moves.
import { Chess, type Move, type Square } from 'chess.js'
import { button, el, wait, type GameModule } from './ctx'
import type { Level } from './aiWorker'

const GLYPH: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
const FILES = 'abcdefgh'

export const chessGame: GameModule = (root, ctx) => {
  let game = new Chess()
  let you: 'w' | 'b' = ctx.load('chess.side', 'w')
  let level: Level = ctx.load('chess.level', 'normal')
  let selected: Square | null = null
  let lastMove: { from: string; to: string } | null = null
  let thinking = false
  let alive = true
  let promoting: { from: Square; to: Square } | null = null

  const boardWrap = el('div', 'board-wrap')
  const board = el('div', 'board')
  boardWrap.append(board)
  const side = el('div', 'side')
  const statusPanel = el('div', 'card-panel')
  const status = el('div', 'status')
  const takenMine = el('div', 'captured')
  const takenYours = el('div', 'captured')
  statusPanel.append(el('h3', '', 'Game'), status, el('div', 'muted', `${ctx.name} took:`), takenMine, el('div', 'muted', 'You took:'), takenYours)
  const controls = el('div', 'card-panel')
  const levelSel = el('select')
  for (const [v, label] of [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']]) {
    const o = el('option', '', label)
    o.value = v
    levelSel.append(o)
  }
  levelSel.value = level
  levelSel.addEventListener('change', () => {
    level = levelSel.value as Level
    ctx.save('chess.level', level)
  })
  const row1 = el('div', 'row')
  row1.append(el('span', 'muted', 'Difficulty'), levelSel)
  const row2 = el('div', 'row')
  row2.append(
    button('New game', () => restart(), 'primary'),
    button('Switch sides', () => {
      you = you === 'w' ? 'b' : 'w'
      ctx.save('chess.side', you)
      restart()
    }),
    button('Undo', () => undo())
  )
  controls.append(el('h3', '', 'Options'), row1, row2)
  const movesPanel = el('div', 'card-panel')
  const moveList = el('div', 'moves')
  movesPanel.append(el('h3', '', 'Moves'), moveList)
  side.append(statusPanel, controls, movesPanel)
  root.append(boardWrap, side)

  function restart(): void {
    game = new Chess()
    selected = null
    lastMove = null
    promoting = null
    render()
    if (game.turn() !== you) void theirMove()
  }

  function undo(): void {
    if (thinking) return
    // Take back your last move (and the reply to it).
    game.undo()
    if (game.turn() !== you) game.undo()
    const h = game.history({ verbose: true })
    lastMove = h.length ? { from: h[h.length - 1].from, to: h[h.length - 1].to } : null
    selected = null
    render()
    if (game.turn() !== you) void theirMove()
  }

  function squareAt(row: number, col: number): Square {
    const file = you === 'w' ? col : 7 - col
    const rank = you === 'w' ? 8 - row : row + 1
    return `${FILES[file]}${rank}` as Square
  }

  function render(): void {
    board.replaceChildren()
    const targets = selected ? game.moves({ square: selected, verbose: true }) : []
    const checkedKing = game.inCheck() ? findKing(game.turn()) : null
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const sq = squareAt(row, col)
        const fileIdx = FILES.indexOf(sq[0])
        const rankNum = Number(sq[1])
        const cell = el('div', `sq ${(fileIdx + rankNum) % 2 === 0 ? 'light' : 'dark'}`)
        if (lastMove && (lastMove.from === sq || lastMove.to === sq)) cell.classList.add('last')
        if (selected === sq) cell.classList.add('sel')
        if (checkedKing === sq) cell.classList.add('checked')
        const piece = game.get(sq)
        if (targets.some((m) => m.to === sq)) cell.classList.add('target', ...(piece ? ['occupied'] : []))
        if (piece) {
          const p = el('div', `piece ${piece.color}`, GLYPH[piece.type] + '︎')
          cell.append(p)
        }
        if (col === 0) cell.append(el('span', 'coord rank', sq[1]))
        if (row === 7) cell.append(el('span', 'coord file', sq[0]))
        cell.addEventListener('click', () => clicked(sq))
        board.append(cell)
      }
    }
    if (promoting) board.append(promoPicker())
    // Captured pieces and the move list
    const taken = { w: [] as string[], b: [] as string[] }
    for (const m of game.history({ verbose: true })) if (m.captured) taken[m.color].push(m.captured)
    const show = (list: string[], color: string) =>
      list.sort((a, b) => VALUE[b] - VALUE[a]).map((t) => GLYPH[t] + '︎').join('') + (color ? '' : '')
    takenMine.textContent = show(taken[you === 'w' ? 'b' : 'w'], '')
    takenYours.textContent = show(taken[you], '')
    const sans = game.history()
    moveList.replaceChildren(...sans.map((s, i) => el('div', '', `${i % 2 === 0 ? `${i / 2 + 1}. ` : '… '}${s}`)))
    moveList.scrollTop = moveList.scrollHeight
    status.textContent = statusText()
  }

  function statusText(): string {
    if (game.isCheckmate()) return game.turn() === you ? `Checkmate. ${ctx.name} wins.` : 'Checkmate! You win!'
    if (game.isDraw() || game.isStalemate()) return 'Draw.'
    if (thinking) return `${ctx.name} is thinking…`
    return game.turn() === you ? (game.inCheck() ? 'Your move. You are in check!' : 'Your move.') : `${ctx.name}'s move.`
  }

  function findKing(color: 'w' | 'b'): Square | null {
    for (const r of game.board()) for (const p of r) if (p && p.type === 'k' && p.color === color) return p.square
    return null
  }

  function promoPicker(): HTMLElement {
    const box = el('div', 'promo')
    const row = el('div', 'row')
    for (const t of ['q', 'r', 'b', 'n']) {
      const b = button(GLYPH[t] + '︎', () => {
        const p = promoting!
        promoting = null
        play(p.from, p.to, t)
      })
      row.append(b)
    }
    box.append(row)
    return box
  }

  function clicked(sq: Square): void {
    if (thinking || game.isGameOver() || game.turn() !== you || promoting) return
    const piece = game.get(sq)
    if (selected) {
      const move = game.moves({ square: selected, verbose: true }).find((m) => m.to === sq)
      if (move) {
        if (move.promotion) {
          promoting = { from: selected, to: sq }
          selected = null
          render()
          return
        }
        play(selected, sq)
        return
      }
    }
    selected = piece && piece.color === you ? (selected === sq ? null : sq) : null
    render()
  }

  function play(from: Square, to: Square, promotion?: string): void {
    let m: Move
    try {
      m = game.move({ from, to, promotion: promotion ?? 'q' })
    } catch {
      return
    }
    selected = null
    lastMove = { from: m.from, to: m.to }
    render()
    if (m.captured && VALUE[m.captured] >= 3) ctx.react('youCapture', VALUE[m.captured] >= 5 ? 1 : 0.5)
    if (game.inCheck() && !game.isCheckmate()) ctx.react('checked', 0.7)
    if (!finished()) void theirMove()
  }

  function finished(): boolean {
    if (game.isCheckmate()) {
      ctx.react(game.turn() === you ? 'iWin' : 'youWin')
      return true
    }
    if (game.isGameOver()) {
      ctx.react('draw')
      return true
    }
    return false
  }

  async function theirMove(): Promise<void> {
    thinking = true
    render()
    const started = Date.now()
    const fen = game.fen()
    const uci = await ctx.think<string | null>({ kind: 'chess', fen, level })
    // A short pause so it doesn't feel instant.
    await wait(Math.max(0, 450 - (Date.now() - started)))
    thinking = false
    if (!alive || game.fen() !== fen) return
    let m: Move | null = null
    try {
      if (uci) m = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
    } catch {
      m = null
    }
    if (!m) {
      // Shouldn't happen, but never get stuck: play any legal move.
      const all = game.moves({ verbose: true })
      if (all.length) m = game.move(all[Math.floor(Math.random() * all.length)])
    }
    if (m) lastMove = { from: m.from, to: m.to }
    render()
    if (m?.captured && VALUE[m.captured] >= 3) ctx.react('iCapture', VALUE[m.captured] >= 5 ? 1 : 0.5)
    if (game.inCheck() && !game.isCheckmate()) ctx.react('check', 0.7)
    finished()
  }

  restart()
  return () => {
    alive = false
  }
}
