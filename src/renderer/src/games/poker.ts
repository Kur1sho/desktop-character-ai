// Heads-up Texas Hold'em against the character.
import {
  act,
  BIG_BLIND,
  matchWinner,
  newPokerMatch,
  options,
  startHand,
  START_STACK,
  type PokerAction,
  type PokerState
} from '@shared/poker'
import { button, el, wait, type GameModule } from './ctx'
import { cardEl } from './cardView'

export const pokerGame: GameModule = (root, ctx) => {
  const names: [string, string] = ['You', ctx.name]
  let state: PokerState = newPokerMatch()
  let thinking = false
  let alive = true
  let raiseTo = 0

  const table = el('div', 'table compact')
  root.append(table)

  function newHand(): void {
    if (matchWinner(state) !== null) state = { ...newPokerMatch(), stacks: [START_STACK, START_STACK] }
    state = startHand(state, Math.random, names)
    render()
    void maybeTheirTurn()
  }

  function render(): void {
    table.replaceChildren()
    const showdown = Boolean(state.result?.hands)
    const winner = state.result?.winner
    // The character
    const top = el('div', 'label', `${ctx.name}`)
    top.append(' ', el('span', 'total', `${state.stacks[1]} chips`))
    if (state.bets[1]) top.append(' ', el('span', 'pot', `bet ${state.bets[1]}`))
    const theirHand = el('div', 'hand')
    state.hole[1].forEach((c, i) => {
      const card = cardEl(showdown ? c : null, i * 100)
      if (showdown && winner === 1) card.classList.add('win')
      theirHand.append(card)
    })
    // The board
    const boardRow = el('div', 'hand')
    for (let i = 0; i < 5; i++) {
      const c = state.board[i]
      if (c) boardRow.append(cardEl(c, (i % 3) * 100))
      else {
        const slot = el('div', 'card')
        slot.style.background = 'rgba(0,0,0,.18)'
        slot.style.boxShadow = 'inset 0 0 0 2px rgba(255,255,255,.12)'
        slot.style.animation = 'none'
        boardRow.append(slot)
      }
    }
    const total = state.pot + state.bets[0] + state.bets[1]
    const potEl = el('div', 'pot', `Pot: ${state.result ? state.result.amount : total}`)
    const result = el('div', 'result', state.result?.text ?? '')
    if (state.result?.hands && winner !== 'split') {
      const loser = winner === 0 ? 1 : 0
      result.textContent += ` ${loser === 1 ? `${ctx.name} had` : 'You had'} ${state.result.hands[loser].name.toLowerCase()}.`
    }
    // You
    const yourHand = el('div', 'hand')
    state.hole[0].forEach((c, i) => {
      const card = cardEl(c, i * 100 + 50)
      if (showdown && winner === 0) card.classList.add('win')
      yourHand.append(card)
    })
    const bottom = el('div', 'label', 'You')
    bottom.append(' ', el('span', 'total', `${state.stacks[0]} chips`))
    if (state.bets[0]) bottom.append(' ', el('span', 'pot', `bet ${state.bets[0]}`))
    const log = el('div', 'log', state.log.slice(-2).join(' '))
    table.append(top, theirHand, potEl, boardRow, result, log, yourHand, bottom, actions())
  }

  function actions(): HTMLElement {
    const box = el('div', 'actions')
    if (state.result) {
      const champ = matchWinner(state)
      if (champ !== null) {
        box.append(el('div', 'result', champ === 0 ? `You took all of ${ctx.name}'s chips!` : `${ctx.name} took all your chips.`))
        box.append(button('New match', () => newHand(), 'primary'))
      } else box.append(button(state.hole[0].length ? 'Next hand' : 'Deal', () => newHand(), 'primary'))
      return box
    }
    if (state.toAct !== 0 || thinking) {
      box.append(el('div', 'log', `${ctx.name} is thinking…`))
      return box
    }
    const o = options(state, 0)
    box.append(button('Fold', () => mine({ type: 'fold' }), 'danger'))
    box.append(o.canCheck ? button('Check', () => mine({ type: 'check' })) : button(`Call ${o.toCall}`, () => mine({ type: 'call' })))
    if (o.canRaise) {
      const pot = state.pot + state.bets[0] + state.bets[1]
      raiseTo = Math.min(o.maxRaiseTo, Math.max(o.minRaiseTo, raiseTo || o.minRaiseTo))
      const slider = el('input')
      slider.type = 'range'
      slider.min = String(o.minRaiseTo)
      slider.max = String(o.maxRaiseTo)
      slider.step = String(Math.max(1, Math.floor(BIG_BLIND / 2)))
      slider.value = String(raiseTo)
      const raiseBtn = button('', () => mine({ type: 'raise', to: raiseTo }), 'primary')
      const label = () => (raiseBtn.textContent = `${raiseTo >= o.maxRaiseTo ? 'All in' : state.bets[1] ? 'Raise to' : 'Bet'} ${raiseTo}`)
      label()
      slider.addEventListener('input', () => {
        raiseTo = Number(slider.value)
        label()
      })
      const quick = (text: string, to: number) =>
        button(text, () => {
          raiseTo = Math.min(o.maxRaiseTo, Math.max(o.minRaiseTo, Math.round(to)))
          slider.value = String(raiseTo)
          label()
        })
      const row = el('div', 'actions')
      row.append(quick('½ pot', state.bets[1] + pot / 2), quick('Pot', state.bets[1] + pot), quick('All in', o.maxRaiseTo))
      box.append(slider, raiseBtn)
      box.append(row)
    }
    return box
  }

  function mine(a: PokerAction): void {
    const before = state
    state = act(state, a, names)
    raiseTo = 0
    if (a.type === 'fold') ctx.react('youFold', 0.8)
    else if (a.type === 'raise' && state.stacks[0] === 0) ctx.react('allIn', 0.8)
    afterAction(before)
  }

  function afterAction(before: PokerState): void {
    render()
    if (state.result) {
      finishHand(before)
      return
    }
    void maybeTheirTurn()
  }

  function finishHand(before: PokerState): void {
    const r = state.result!
    const champ = matchWinner(state)
    if (champ !== null) ctx.react(champ === 0 ? 'youWin' : 'iWin')
    else if (r.folded === undefined && r.amount >= 400) ctx.react('bigPot')
    else if (r.hands && r.winner === 1) ctx.react('iWin', 0.5)
    else if (r.hands && r.winner === 0) ctx.react('youWin', 0.5)
    void before
  }

  async function maybeTheirTurn(): Promise<void> {
    if (state.result || state.toAct !== 1 || thinking) return
    thinking = true
    render()
    const started = Date.now()
    const snapshot = state
    const a = (await ctx.think<PokerAction | null>({ kind: 'poker', state })) ?? { type: 'call' }
    await wait(Math.max(0, 700 + Math.random() * 600 - (Date.now() - started)))
    thinking = false
    if (!alive || state !== snapshot) return
    state = act(state, a, names)
    if (a.type === 'fold') ctx.react('iFold')
    else if (a.type === 'raise' && state.stacks[1] === 0) ctx.react('allIn')
    afterAction(snapshot)
  }

  render()
  return () => {
    alive = false
  }
}
