// Quick games with visuals: rock paper scissors, trivia and higher or lower.
import { TRIVIA } from '@shared/trivia'
import { button, el, wait, type GameModule } from './ctx'

type Move = 'rock' | 'paper' | 'scissors'
const HAND: Record<Move, string> = { rock: '✊', paper: '✋', scissors: '✌️' }
const BEATS: Record<Move, Move> = { rock: 'scissors', paper: 'rock', scissors: 'paper' }

export const rpsGame: GameModule = (root, ctx) => {
  let you = 0
  let me = 0
  let busy = false
  const box = el('div', 'quick')
  const score = el('div', 'score')
  const hands = el('div', 'hands')
  const yours = el('span', '', '✊')
  const theirs = el('span', '', '✊')
  hands.append(yours, el('span', 'muted', 'vs'), theirs)
  hands.children[1].setAttribute('style', 'font-size:22px')
  const result = el('div', 'result')
  const buttons = el('div', 'actions')
  for (const m of ['rock', 'paper', 'scissors'] as Move[]) {
    const b = button(HAND[m], () => void throwHand(m), 'throw')
    b.title = m
    buttons.append(b)
  }
  const again = button('Play again', () => reset(), 'primary')
  root.append(box)

  function paintScore(): void {
    score.replaceChildren()
    const a = el('div', '', 'You')
    a.prepend(el('span', 'n', String(you)))
    const b = el('div', '', ctx.name)
    b.prepend(el('span', 'n', String(me)))
    score.append(a, b)
  }

  function reset(): void {
    you = 0
    me = 0
    yours.textContent = '✊'
    theirs.textContent = '✊'
    result.textContent = 'First to 3. Pick one!'
    box.replaceChildren(el('div', 'muted', 'First to 3 wins'), score, hands, result, buttons)
    paintScore()
  }

  async function throwHand(m: Move): Promise<void> {
    if (busy) return
    busy = true
    yours.textContent = '✊'
    theirs.textContent = '✊'
    yours.className = 'shake'
    theirs.className = 'shake'
    result.textContent = 'Rock… paper… scissors…'
    await wait(780)
    yours.className = ''
    theirs.className = ''
    const mine = (['rock', 'paper', 'scissors'] as Move[])[Math.floor(Math.random() * 3)]
    yours.textContent = HAND[m]
    theirs.textContent = HAND[mine]
    if (m === mine) {
      result.textContent = 'Draw!'
      ctx.react('draw', 0.4)
    } else if (BEATS[m] === mine) {
      you++
      result.textContent = `${m[0].toUpperCase()}${m.slice(1)} beats ${mine}. Point to you!`
      ctx.react('youCapture', 0.5)
    } else {
      me++
      result.textContent = `${mine[0].toUpperCase()}${mine.slice(1)} beats ${m}. Point to ${ctx.name}!`
      ctx.react('iCapture', 0.5)
    }
    paintScore()
    if (you >= 3 || me >= 3) {
      result.textContent = you >= 3 ? `You win ${you} to ${me}!` : `${ctx.name} wins ${me} to ${you}!`
      ctx.react(you >= 3 ? 'youWin' : 'iWin')
      buttons.replaceWith(again)
    }
    busy = false
  }

  reset()
}

export const triviaGame: GameModule = (root, ctx) => {
  const box = el('div', 'quick')
  root.append(box)
  let order: number[] = []
  let round = 0
  let marks: ('right' | 'wrong')[] = []

  function start(): void {
    order = TRIVIA.map((_q, i) => i).sort(() => Math.random() - 0.5).slice(0, 5)
    round = 0
    marks = []
    ask()
  }

  function dots(): HTMLElement {
    const d = el('div', 'dots')
    for (let i = 0; i < 5; i++) d.append(el('span', marks[i] ?? (i === round ? 'now' : '')))
    return d
  }

  function ask(): void {
    const q = TRIVIA[order[round]]
    const options = [0, 1, 2].sort(() => Math.random() - 0.5)
    const answers = el('div', 'answers')
    const feedback = el('div', 'result')
    let answered = false
    for (const i of options) {
      const b = button(q.options[i], () => {
        if (answered) return
        answered = true
        const right = i === 0
        marks.push(right ? 'right' : 'wrong')
        b.classList.add(right ? 'right' : 'wrong')
        if (!right) [...answers.children].find((x) => x.textContent === q.options[0])?.classList.add('right')
        feedback.textContent = right ? 'Correct!' : `Nope. It's ${q.options[0]}.`
        ctx.react(right ? 'youCapture' : 'iCapture', 0.35)
        setTimeout(() => {
          round++
          if (round >= 5) finish()
          else ask()
        }, 1400)
      })
      answers.append(b)
    }
    box.replaceChildren(dots(), el('div', 'muted', `Question ${round + 1} of 5`), el('div', 'question', q.q), answers, feedback)
  }

  function finish(): void {
    const score = marks.filter((m) => m === 'right').length
    box.replaceChildren(
      dots(),
      el('div', 'big', `${score} / 5`),
      el('div', 'result', score === 5 ? 'Perfect score!' : score >= 3 ? 'Nice work.' : 'Ouch. Study time.'),
      button('Play again', () => start(), 'primary')
    )
    ctx.react(score >= 3 ? 'youWin' : 'iWin')
  }

  start()
}

export const numberGame: GameModule = (root, ctx) => {
  const box = el('div', 'quick')
  root.append(box)
  let secret = 0
  let low = 1
  let high = 100
  let guesses: number[] = []

  function start(): void {
    secret = 1 + Math.floor(Math.random() * 100)
    low = 1
    high = 100
    guesses = []
    paint('I picked a number from 1 to 100.')
  }

  function paint(message: string, done = false): void {
    const range = el('div', 'range')
    const live = el('div', 'live')
    live.style.left = `${low - 1}%`
    live.style.width = `${high - low + 1}%`
    range.append(live)
    const labels = el('div', 'range-labels')
    labels.append(el('span', '', String(low)), el('span', '', 'It\'s somewhere in here'), el('span', '', String(high)))
    const input = el('input')
    input.type = 'number'
    input.min = '1'
    input.max = '100'
    input.placeholder = '?'
    const go = () => {
      const n = Math.round(Number(input.value))
      if (!n || n < 1 || n > 100) return
      guess(n)
    }
    input.addEventListener('keydown', (e) => e.key === 'Enter' && go())
    const row = el('div', 'guess')
    row.append(input, button('Guess', go, 'primary'))
    const parts: HTMLElement[] = [el('div', 'big', message), range, labels]
    if (done) parts.push(button('Play again', () => start(), 'primary'))
    else parts.push(row)
    parts.push(el('div', 'history', guesses.length ? `Your guesses: ${guesses.join(', ')}` : ''))
    box.replaceChildren(...parts)
    ;(parts[0] as HTMLElement).style.fontSize = '26px'
    if (!done) setTimeout(() => input.focus(), 0)
  }

  function guess(n: number): void {
    guesses.push(n)
    if (n === secret) {
      low = high = n
      paint(`${n}! You got it in ${guesses.length} guess${guesses.length === 1 ? '' : 'es'}.`, true)
      ctx.react(guesses.length <= 7 ? 'youWin' : 'iWin')
      return
    }
    if (n < secret) low = Math.max(low, n + 1)
    else high = Math.min(high, n - 1)
    paint(n < secret ? `Higher than ${n}!` : `Lower than ${n}!`)
    if (guesses.length === 8) ctx.react('thinking', 0.6)
  }

  start()
}
