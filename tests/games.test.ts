import { describe, expect, it } from 'vitest'
import {
  createGameSession,
  isQuit,
  numberIn,
  optionIn,
  parseGameStart,
  playTurn,
  readJudgement,
  startGame,
  type GameContext,
  type GameState
} from '../src/shared/games'
import { TRIVIA } from '../src/shared/trivia'

/** A repeatable "random" sequence. */
function seq(...values: number[]) {
  let i = 0
  return () => values[i++ % values.length]
}

const ctx = (rng = seq(0.1, 0.5, 0.9), judge?: GameContext['judge']): GameContext => ({ personaId: 'robotico', rng, judge })

describe('starting games', () => {
  it.each([
    ["let's play rock paper scissors", 'rps'],
    ['Hey Robotico, can we play rock, paper, scissors?', 'rps'],
    ['rock paper scissors', 'rps'],
    ['quiz me', 'trivia'],
    ["let's do a trivia quiz", 'trivia'],
    ['play 20 questions', 'twenty'],
    ['do you want to play twenty questions', 'twenty'],
    ['higher or lower', 'number'],
    ["let's play a guessing game", 'number'],
    ["let's play a game", 'menu'],
    ["I'm bored", 'menu']
  ])('"%s"', (text, id) => expect(parseGameStart(text)).toBe(id))

  it('leaves other things alone', () => {
    expect(parseGameStart('play rock music')).toBeNull()
    expect(parseGameStart('launch minecraft')).toBeNull()
    expect(parseGameStart('what games are on steam right now')).toBeNull()
  })

  it('knows when to stop', () => {
    expect(isQuit('stop')).toBe(true)
    expect(isQuit('I give up')).toBe(true)
    expect(isQuit('end the game')).toBe(true)
    expect(isQuit('stop the music')).toBe(false)
  })
})

describe('rock paper scissors', () => {
  it('scores each round and ends at 3', async () => {
    // rng 0.1 -> rock every time
    const c = ctx(seq(0.1))
    let state: GameState = startGame('rps', c).state
    const r1 = await playTurn(state, 'paper', c)
    expect(r1?.reply.say).toMatch(/^Rock! .* That's you 1, me 0\.$/)
    state = r1!.state
    expect((await playTurn(state, 'rock', c))?.reply.say).toMatch(/^Rock!.*you 1, me 0/)
    expect((await playTurn(state, 'scissors', c))?.reply.say).toMatch(/you 1, me 1/)
    state = { id: 'rps', you: 2, me: 0, target: 3 }
    const end = await playTurn(state, 'I pick paper', c)
    expect(end?.reply.over).toBe(true)
    expect(end?.reply.say).toContain('3 to 0')
  })

  it('ignores things that are not a move', async () => {
    expect(await playTurn({ id: 'rps', you: 0, me: 0, target: 3 }, 'how are you', ctx())).toBeNull()
  })
})

describe('trivia', () => {
  it('has three different options for every question', () => {
    expect(TRIVIA.length).toBeGreaterThanOrEqual(50)
    for (const q of TRIVIA) expect(new Set(q.options.map((o) => o.toLowerCase())).size).toBe(3)
  })

  it('reads the answer by name or position', () => {
    const opts = ['Saturn', 'Jupiter', 'Neptune']
    expect(optionIn('Jupiter', opts)).toBe(1)
    expect(optionIn("I think it's jupiter", opts)).toBe(1)
    expect(optionIn('the first one', opts)).toBe(0)
    expect(optionIn('C', opts)).toBe(2)
    expect(optionIn('pluto', opts)).toBeNull()
    expect(optionIn('whale', ['Blue whale', 'Elephant', 'Giraffe'])).toBe(0)
    expect(optionIn('da vinci', ['Pablo Picasso', 'Leonardo da Vinci', 'Vincent van Gogh'])).toBe(1)
  })

  it('checks answers, keeps score and ends after 5', async () => {
    const c = ctx()
    let { state, reply } = startGame('trivia', c)
    expect(reply.say).toMatch(/Question 1: .+\?$/)
    let score = 0
    for (let i = 0; i < 5; i++) {
      const s = state as Extract<GameState, { id: 'trivia' }>
      const answer = i % 2 === 0 ? s.options[s.answer] : s.options[(s.answer + 1) % 3]
      if (i % 2 === 0) score++
      const r = await playTurn(state, answer, c)
      expect(r).not.toBeNull()
      state = r!.state
      reply = r!.reply
      if (i % 2 === 1) expect(reply.say).toMatch(/^Wrong! It was /)
    }
    expect(reply.over).toBe(true)
    expect(reply.say).toContain(`You got ${score} out of 5`)
  })
})

describe('twenty questions', () => {
  it('asks the brain and counts down', async () => {
    const asked: string[] = []
    const c = ctx(seq(0), async (secret, q) => {
      asked.push(`${secret}: ${q}`)
      return { answer: 'yes', text: '[happy] Yes! It waddles.' }
    })
    const { state } = startGame('twenty', c)
    expect(state).toMatchObject({ id: 'twenty', secret: { name: 'a penguin' } })
    const r = await playTurn(state, 'is it an animal?', c)
    expect(r?.reply.say).toBe('Yes! 19 questions left.')
    expect(asked).toEqual(['a penguin: is it an animal?'])
    const win = await playTurn(r!.state, 'is it a penguin?', c)
    expect(win?.reply.over).toBe(true)
    expect(win?.reply.say).toContain('a penguin')
  })

  it('reveals it after 20', async () => {
    const c = ctx(seq(0), async () => ({ answer: 'no', text: 'No.' }))
    const r = await playTurn({ id: 'twenty', secret: { name: 'a penguin', also: ['penguin'] }, asked: 19 }, 'is it red?', c)
    expect(r?.reply.over).toBe(true)
    expect(r?.reply.say).toMatch(/^No\. .*a penguin/)
  })

  it('reads yes and no from the brain', () => {
    expect(readJudgement('[happy] Yes! It lives in the cold.')).toBe('yes')
    expect(readJudgement('[smug] Nope, not even close.')).toBe('no')
    expect(readJudgement('[confused] Sometimes, it depends.')).toBe('sometimes')
    expect(readJudgement('[happy] What a fun game!')).toBeNull()
  })
})

describe('higher or lower', () => {
  it('reads numbers', () => {
    expect(numberIn('42')).toBe(42)
    expect(numberIn('is it forty-two')).toBe(42)
    expect(numberIn('a hundred')).toBe(100)
    expect(numberIn('seventy five')).toBe(75)
    expect(numberIn('banana')).toBeNull()
  })

  it('says higher or lower and counts guesses', async () => {
    const state: GameState = { id: 'number', secret: 37, guesses: 0 }
    const a = await playTurn(state, '50', ctx())
    expect(a?.reply.say).toBe('Lower!')
    const b = await playTurn(a!.state, '20', ctx())
    expect(b?.reply.say).toBe('Higher!')
    const c = await playTurn(b!.state, 'thirty seven', ctx())
    expect(c?.reply.over).toBe(true)
    expect(c?.reply.say).toContain('in 3 guesses')
  })
})

describe('a game session', () => {
  it('starts, plays, lets commands through, quits and goes again', async () => {
    let t = 0
    const s = createGameSession(() => ctx(seq(0.1)), (text) => /^open /.test(text), () => t)
    expect(await s.handle('how are you')).toBeNull()
    expect((await s.handle("let's play rock paper scissors"))?.say).toContain('first to 3')
    expect(s.active()).toBe(true)
    expect((await s.handle('paper'))?.say).toContain("you 1, me 0")
    expect(await s.handle('open spotify')).toBeNull()
    expect(s.active()).toBe(true)
    expect((await s.handle('stop'))?.over).toBe(true)
    expect(s.active()).toBe(false)
    expect((await s.handle('again'))?.say).toContain('first to 3')
    t += 11 * 60 * 1000
    expect(s.active()).toBe(false)
    expect(await s.handle('paper')).toBeNull()
  })

  it('shows the menu', async () => {
    const s = createGameSession(() => ctx())
    expect((await s.handle("let's play a game"))?.say).toMatch(/rock paper scissors, trivia, twenty questions and higher or lower/)
  })
})
