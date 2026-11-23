// Draws a playing card.
import { RANK_LABEL, SUIT_SYMBOL, type Card } from '@shared/cards'
import { el } from './ctx'

export function cardEl(card: Card | null, delay = 0): HTMLElement {
  if (!card) {
    const back = el('div', 'card back')
    back.style.animationDelay = `${delay}ms`
    return back
  }
  const red = card.suit === 'h' || card.suit === 'd'
  const c = el('div', `card${red ? ' red' : ''}`)
  c.style.animationDelay = `${delay}ms`
  const sym = SUIT_SYMBOL[card.suit] + '︎'
  const label = RANK_LABEL(card.rank)
  for (const pos of ['tl', 'br']) {
    const corner = el('div', `corner ${pos}`)
    corner.append(el('span', 'r', label), el('span', 's', sym))
    c.append(corner)
  }
  if (card.rank >= 11 && card.rank <= 13) c.append(el('div', 'face', `${label}${sym}`))
  else c.append(el('div', 'pip', sym))
  c.setAttribute('aria-label', `${label} of ${{ s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' }[card.suit]}`)
  return c
}
