// Blackjack: the character deals. Chips are kept between games.
import {
  canDouble,
  dealBlackjack,
  doubleDown,
  handTotal,
  hit,
  newBlackjack,
  stand,
  type BlackjackState
} from '@shared/cards'
import { button, el, wait, type GameModule } from './ctx'
import { cardEl } from './cardView'

const CHIPS = [10, 25, 100, 500]

export const blackjackGame: GameModule = (root, ctx) => {
  let state: BlackjackState = newBlackjack(ctx.load('blackjack.chips', 1000))
  let bet = Math.min(ctx.load('blackjack.bet', 25), Math.max(1, state.chips))
  let revealing = false
  let alive = true

  const table = el('div', 'table')
  root.append(table)

  const save = () => ctx.save('blackjack.chips', state.chips)

  function render(): void {
    table.replaceChildren()
    const hideHole = state.phase === 'player' || revealing
    // The dealer's hand
    const dealerTotal = hideHole ? handTotal(state.dealer.slice(0, 1)).total : handTotal(state.dealer).total
    const dLabel = el('div', 'label', `${ctx.name} (dealer)`)
    if (state.dealer.length) dLabel.append(' ', el('span', 'total', hideHole ? `${dealerTotal} + ?` : String(dealerTotal)))
    const dHand = el('div', 'hand')
    state.dealer.forEach((c, i) => dHand.append(cardEl(i === 1 && hideHole ? null : c, i * 120)))
    // Middle: result and pot
    const result = el('div', 'result', resultText())
    const pot = el('div', 'pot', state.bet && state.phase !== 'betting' ? `Bet: ${state.bet}` : 'Place your bet')
    // Your hand
    const pHand = el('div', 'hand')
    state.player.forEach((c, i) => pHand.append(cardEl(c, i * 120 + 60)))
    const pLabel = el('div', 'label', 'You')
    if (state.player.length) pLabel.append(' ', el('span', 'total', String(handTotal(state.player).total)))
    // Chips and buttons
    const chips = el('div', 'chips', `Chips: ${state.chips}`)
    const actions = el('div', 'actions')
    if (state.phase === 'player' && !revealing) {
      actions.append(
        button('Hit', () => go(hit(state)), 'primary'),
        button('Stand', () => go(stand(state))),
        button(`Double (${state.bet})`, () => go(doubleDown(state)))
      )
      ;(actions.lastChild as HTMLButtonElement).disabled = !canDouble(state)
    } else if (!revealing) {
      if (state.chips <= 0) {
        actions.append(
          button(`Borrow 1000 from ${ctx.name}`, () => {
            state = newBlackjack(1000)
            save()
            ctx.say(ctx.personaId === 'tsundere' ? "Fine. Take it. You owe me." : "Here's 1000. I'm adding interest. Lots.", 'smug')
            render()
          }, 'primary')
        )
      } else {
        bet = Math.min(bet, state.chips)
        const betRow = el('div', 'actions')
        for (const v of CHIPS) {
          const b = button(String(v), () => {
            bet = Math.min(state.chips, bet + v)
            render()
          }, `chip c${v}`)
          b.disabled = state.chips < v
          betRow.append(b)
        }
        const betInfo = el('div', 'row')
        betInfo.append(el('span', 'chips', `Bet: ${bet}`), button('Clear', () => ((bet = Math.min(10, state.chips)), render())))
        actions.append(betRow)
        actions.append(betInfo)
        actions.append(button('Deal', () => deal(), 'primary'))
        actions.style.flexDirection = 'column'
        actions.style.alignItems = 'center'
      }
    }
    table.append(dLabel, dHand, result, pot, pHand, pLabel, chips, actions)
  }

  function resultText(): string {
    if (state.phase !== 'done' || revealing) return ''
    return {
      blackjack: `Blackjack! You win ${Math.floor(state.bet * 1.5)}.`,
      win: `You win ${state.bet}!`,
      'dealer-bust': `${ctx.name} busts! You win ${state.bet}.`,
      push: 'Push. Your bet comes back.',
      lose: `${ctx.name} wins.`,
      bust: 'Bust! Over 21.'
    }[state.outcome!]
  }

  function deal(): void {
    if (bet < 1) return
    ctx.save('blackjack.bet', bet)
    go(dealBlackjack(state, bet))
  }

  async function go(next: BlackjackState): Promise<void> {
    const wasPlaying = state.phase === 'player' || state.phase === 'betting'
    state = next
    if (state.phase === 'done' && wasPlaying && handTotal(state.player).total <= 21 && state.dealer.length > 2) {
      // Show the dealer drawing, one card at a time.
      revealing = true
      render()
      await wait(700 + state.dealer.length * 150)
      revealing = false
    }
    if (!alive) return
    render()
    if (state.phase === 'done') {
      save()
      const o = state.outcome
      if (o === 'blackjack') ctx.react('blackjack')
      else if (o === 'bust') ctx.react('bust', 0.8)
      else if (o === 'dealer-bust') ctx.react('dealerBust')
      else if (o === 'win') ctx.react('youWin', 0.6)
      else if (o === 'lose') ctx.react('iWin', 0.6)
    }
  }

  render()
  return () => {
    alive = false
    save()
  }
}
