import { describe, expect, it } from 'vitest'
import { ACTION_PROMPT, wasRequested } from '../src/shared/actions'

describe('wasRequested', () => {
  it('blocks actions the user never asked for', () => {
    expect(wasRequested({ type: 'open_app', app: 'Spotify' }, 'how are you today?')).toBe(false)
    expect(wasRequested({ type: 'spotify', query: 'lofi' }, 'tell me a joke')).toBe(false)
    expect(wasRequested({ type: 'web_search', query: 'weather' }, 'how are you')).toBe(false)
    expect(wasRequested({ type: 'volume', change: 'up' }, 'whats your favourite colour')).toBe(false)
  })
  it('allows actions the user did ask for', () => {
    expect(wasRequested({ type: 'open_app', app: 'Spotify' }, 'can you open spotify')).toBe(true)
    expect(wasRequested({ type: 'open_app', app: 'Discord' }, 'discord please')).toBe(true)
    expect(wasRequested({ type: 'spotify', query: 'Faint' }, 'play faint')).toBe(true)
    expect(wasRequested({ type: 'timer', seconds: 300, label: 'tea' }, 'set a 5 minute timer for tea')).toBe(true)
    expect(wasRequested({ type: 'web_search', query: 'pancakes' }, 'google pancakes')).toBe(true)
    expect(wasRequested({ type: 'open_url', url: 'https://youtube.com' }, 'take me to youtube')).toBe(true)
    expect(wasRequested({ type: 'media', key: 'next' }, 'skip this song')).toBe(true)
    expect(wasRequested({ type: 'volume', change: 'up' }, 'make it louder')).toBe(true)
  })
  it('tells the AI that most messages need no tag', () => {
    expect(ACTION_PROMPT).toContain('Most messages are just chat')
  })
})
