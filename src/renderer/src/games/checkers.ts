// Checkers against the character. You're red (bottom), the character is black.
import {
  applyCheckers,
  checkersMoves,
  checkersResult,
  newCheckers,
  RED,
  type CheckersMove,
  type CheckersState
} from '@shared/checkers'
import { button, el, wait, type GameModule } from './ctx'
import type { Level } from './aiWorker'

export const checkersGame: GameModule = (root, ctx) => {
  let state: CheckersState = newCheckers()
  let level: Level = ctx.load('checkers.level', 'normal')
  let selected: number | null = null
  let last: number[] = []
  let thinking = false
  let alive = true
  let history: CheckersState[] = []

  const boardWrap = el('div', 'board-wrap')
  const board = el('div', 'board')
  boardWrap.append(board)
  const side = el('div', 'side')
  const info = el('div', 'card-panel')
  const status = el('div', 'status')
  const counts = el('div', 'muted')
  info.append(el('h3', '', 'Game'), status, counts)
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
    ctx.save('checkers.level', level)
  })
  const r1 = el('div', 'row')
  r1.append(el('span', 'muted', 'Difficulty'), levelSel)
  const r2 = el('div', 'row')
  r2.append(button('New game', () => restart(), 'primary'), button('Undo', () => undo()))
  const rules = el('div', 'muted', 'Jumps are compulsory, and you keep jumping while you can. Reach the far side to get a king, which moves both ways.')
  rules.style.fontSize = '12.5px'
  controls.append(el('h3', '', 'Options'), r1, r2, rules)
  side.append(info, controls)
  root.append(boardWrap, side)

  function restart(): void {
    state = newCheckers()
    selected = null
    last = []
    history = []
    render()
  }

  function undo(): void {
    if (thinking || !history.length) return
    state = history.pop()!
    selected = null
    last = []
    render()
  }

  function render(): void {
    board.replaceChildren()
    const moves = state.turn === RED && !thinking ? checkersMoves(state) : []
    const mustCapture = moves.length > 0 && moves[0].captured.length > 0
    const movable = new Set(moves.map((m) => m.path[0]))
    const targets = selected === null ? [] : moves.filter((m) => m.path[0] === selected).map((m) => m.path[m.path.length - 1])
    for (let i = 0; i < 64; i++) {
      const r = Math.floor(i / 8)
      const c = i % 8
      const dark = (r + c) % 2 === 1
      const cell = el('div', `sq ${dark ? 'dark' : 'light'}`)
      if (last.includes(i)) cell.classList.add('last')
      if (selected === i) cell.classList.add('sel')
      if (mustCapture && movable.has(i) && selected !== i) cell.classList.add('must')
      if (targets.includes(i)) cell.classList.add('target')
      const p = state.cells[i]
      if (p) cell.append(el('div', `disc ${p > 0 ? 'red' : 'black'}${Math.abs(p) === 2 ? ' king' : ''}`))
      cell.addEventListener('click', () => clicked(i, moves))
      board.append(cell)
    }
    const red = state.cells.filter((p) => p > 0).length
    const black = state.cells.filter((p) => p < 0).length
    counts.textContent = `You: ${red} pieces. ${ctx.name}: ${black} pieces.`
    const result = checkersResult(state)
    status.textContent =
      result === 'red' ? 'You win!' : result === 'black' ? `${ctx.name} wins.` : result === 'draw' ? 'Draw.' :
      thinking ? `${ctx.name} is thinking…` : state.turn === RED ? (mustCapture ? 'Your move. You must jump!' : 'Your move.') : `${ctx.name}'s move.`
  }

  function clicked(i: number, moves: CheckersMove[]): void {
    if (thinking || state.turn !== RED || checkersResult(state)) return
    if (selected !== null) {
      const m = moves.find((x) => x.path[0] === selected && x.path[x.path.length - 1] === i)
      if (m) return play(m)
    }
    selected = moves.some((m) => m.path[0] === i) ? (selected === i ? null : i) : null
    render()
  }

  function play(m: CheckersMove): void {
    history.push(state)
    state = applyCheckers(state, m)
    selected = null
    last = m.path
    render()
    if (m.captured.length >= 2) ctx.react('youCapture')
    else if (m.captured.length) ctx.react('youCapture', 0.4)
    if (!over()) void theirMove()
  }

  function over(): boolean {
    const r = checkersResult(state)
    if (!r) return false
    ctx.react(r === 'red' ? 'youWin' : r === 'black' ? 'iWin' : 'draw')
    return true
  }

  async function theirMove(): Promise<void> {
    thinking = true
    render()
    const started = Date.now()
    const before = state
    const m = await ctx.think<CheckersMove | null>({ kind: 'checkers', state, level })
    await wait(Math.max(0, 500 - (Date.now() - started)))
    thinking = false
    if (!alive || state !== before) return
    const legal = checkersMoves(state)
    const move = (m && legal.find((x) => x.path.join() === m.path.join())) ?? legal[0]
    if (move) {
      state = applyCheckers(state, move)
      last = move.path
      if (move.captured.length >= 2) ctx.react('iCapture')
      else if (move.captured.length) ctx.react('iCapture', 0.4)
    }
    render()
    over()
  }

  restart()
  return () => {
    alive = false
  }
}
