import { describe, expect, it } from 'vitest'
import { shortenReply, wantsDetail } from '../src/shared/brevity'

const LONG =
  '[happy] Great question! The weather today is sunny. Temperatures will reach 20 degrees. You might want sunscreen. Also, remember to drink water.'

describe('shortenReply', () => {
  it('keeps casual replies to a couple of sentences', () => {
    expect(shortenReply(LONG, 'whats the weather like')).toBe('[happy] Great question! The weather today is sunny.')
  })
  it('allows more when the user asks for detail', () => {
    const out = shortenReply(LONG, 'explain the weather to me')
    expect(out.split(/[.!?]/).filter((s) => s.trim()).length).toBe(4)
  })
  it('keeps action tags at the end and the emotion tag at the front', () => {
    expect(shortenReply('[excited] Absolutely! Opening Spotify now. Enjoy the tunes, friend! <<open_app Spotify>>', 'open spotify')).toBe(
      '[excited] Absolutely! Opening Spotify now. <<open_app Spotify>>'
    )
  })
  it('never cuts the first sentence, however long', () => {
    const one = '[happy] ' + 'word '.repeat(60).trim() + '.'
    expect(shortenReply(one, 'hi')).toBe(one)
  })
  it('leaves short replies alone', () => {
    expect(shortenReply('[love] Aww, thanks!', 'you rock')).toBe('[love] Aww, thanks!')
  })
  it('spots requests for detail', () => {
    expect(wantsDetail('how do I make pancakes')).toBe(true)
    expect(wantsDetail('hey whats up')).toBe(false)
  })
})
