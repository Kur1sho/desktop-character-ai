// The game window: a menu of games, and the character talking while you play.
import type { CompanionApi } from '@shared/ipc'
import { getPersona } from '@shared/personas'
import type { Emotion } from '@shared/personas'
import { el, lineFor, think, type GameCtx, type GameModule } from './ctx'
import { chessGame } from './chess'
import { checkersGame } from './checkers'
import { blackjackGame } from './blackjack'
import { pokerGame } from './poker'
import { rpsGame, triviaGame, numberGame } from './quick'

const api = (window as unknown as { companion?: CompanionApi }).companion

interface Entry {
  id: string
  name: string
  icon: string
  blurb: string
  mount: GameModule
}

const GAMES: Entry[] = [
  { id: 'chess', name: 'Chess', icon: '♞', blurb: 'The classic. Three difficulty levels.', mount: chessGame },
  { id: 'checkers', name: 'Checkers', icon: '⛀', blurb: 'Jumps are compulsory. Get a king!', mount: checkersGame },
  { id: 'poker', name: "Texas Hold'em", icon: '♠', blurb: 'Heads-up poker, 1000 chips each.', mount: pokerGame },
  { id: 'blackjack', name: 'Blackjack', icon: '♥', blurb: 'Beat the dealer to 21. Blackjack pays 3 to 2.', mount: blackjackGame },
  { id: 'rps', name: 'Rock Paper Scissors', icon: '✊', blurb: 'First to 3 wins.', mount: rpsGame },
  { id: 'trivia', name: 'Trivia', icon: '?', blurb: 'Five questions. How smart are you?', mount: triviaGame },
  { id: 'number', name: 'Higher or Lower', icon: '#', blurb: 'Guess the number from 1 to 100.', mount: numberGame }
]

const mainEl = document.getElementById('main') as HTMLElement
const title = document.getElementById('title') as HTMLElement
const back = document.getElementById('back') as HTMLButtonElement
const sayEl = document.getElementById('say') as HTMLElement
const who = document.getElementById('who') as HTMLElement

let personaId = 'robotico'
let name = 'Robotico'
let cleanup: (() => void) | void = undefined
let lastSpoken = 0

function say(text: string, emotion: Emotion = 'neutral', speak = true): void {
  sayEl.style.opacity = '0'
  setTimeout(() => {
    sayEl.textContent = text
    sayEl.style.opacity = '1'
  }, 120)
  if (speak) {
    lastSpoken = Date.now()
    api?.gameSay(text, emotion)
  }
}

const ctx: GameCtx = {
  get name() {
    return name
  },
  get personaId() {
    return personaId
  },
  say,
  react(moment, chance = 1) {
    if (Math.random() > chance) return
    // Small moments don't talk over each other.
    if (chance < 1 && Date.now() - lastSpoken < 5000) return
    const l = lineFor(personaId, moment)
    say(l.text, l.emotion)
  },
  think,
  load(key, fallback) {
    try {
      const v = localStorage.getItem(`games.${key}`)
      return v === null ? fallback : JSON.parse(v)
    } catch {
      return fallback
    }
  },
  save(key, value) {
    try {
      localStorage.setItem(`games.${key}`, JSON.stringify(value))
    } catch {
      /* private mode or full: not important */
    }
  }
}

function showHub(): void {
  cleanup?.()
  cleanup = undefined
  title.textContent = 'Games'
  back.style.visibility = 'hidden'
  mainEl.replaceChildren()
  const hub = el('div', 'hub')
  for (const g of GAMES) {
    const t = el('button', 'tile')
    t.append(el('div', 'icon', g.icon), el('div', 'name', g.name), el('div', 'blurb', g.blurb))
    t.addEventListener('click', () => open(g.id))
    hub.append(t)
  }
  mainEl.append(hub)
  if (location.hash) history.replaceState(null, '', location.pathname)
}

function open(id: string): void {
  const g = GAMES.find((x) => x.id === id)
  if (!g) return showHub()
  cleanup?.()
  title.textContent = g.name
  back.style.visibility = 'visible'
  mainEl.replaceChildren()
  const root = el('div', 'game')
  mainEl.append(root)
  cleanup = g.mount(root, ctx)
  ctx.react('start')
}

back.addEventListener('click', showHub)
api?.onOpenGame((id) => (id ? open(id) : showHub()))

void (async () => {
  try {
    const s = await api?.getSettings()
    if (s) {
      personaId = s.personaId
      name = getPersona(personaId).name
    }
  } catch {
    /* outside the app */
  }
  who.textContent = name[0]
  document.title = `Games with ${name}`
  say(personaId === 'tsundere' ? "Hmph. Pick a game, then." : 'Pick a game. I\'ll go easy on you. Maybe.', 'happy', false)
  const first = location.hash.slice(1)
  if (first) open(first)
  else showHub()
})()
