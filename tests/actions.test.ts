import { describe, expect, it } from 'vitest'
import {
  bestAppMatch,
  describeAction,
  extractActions,
  parseDuration,
  parseIntent,
  parseYesNo,
  safeUrl,
  validateAction
} from '../src/shared/actions'

describe('parseIntent', () => {
  it('opens apps', () => {
    expect(parseIntent('Open Spotify')).toEqual({ type: 'open_app', app: 'Spotify' })
    expect(parseIntent('can you please launch the discord app?')).toEqual({ type: 'open_app', app: 'Discord' })
  })
  it('opens websites', () => {
    expect(parseIntent('open youtube.com')).toEqual({ type: 'open_url', url: 'https://youtube.com/' })
  })
  it('sets timers', () => {
    expect(parseIntent('set a timer for 5 minutes')).toEqual({ type: 'timer', seconds: 300, label: '' })
    expect(parseIntent('10 minute timer')).toEqual({ type: 'timer', seconds: 600, label: '' })
    expect(parseIntent('remind me in an hour to stretch')).toEqual({ type: 'timer', seconds: 3600, label: 'stretch' })
  })
  it('controls music and volume', () => {
    expect(parseIntent('pause the music')).toEqual({ type: 'media', key: 'playpause' })
    expect(parseIntent('skip this song')).toEqual({ type: 'media', key: 'next' })
    expect(parseIntent('turn it up')).toEqual({ type: 'volume', change: 'up' })
    expect(parseIntent('mute')).toEqual({ type: 'volume', change: 'mute' })
  })
  it('searches and plays music', () => {
    expect(parseIntent('search for cheap flights')).toEqual({ type: 'web_search', query: 'cheap flights' })
    expect(parseIntent('play some lofi on spotify')).toEqual({ type: 'spotify', query: 'lofi' })
  })
  it('leaves normal chat to the AI', () => {
    expect(parseIntent('how are you today?')).toBeNull()
    expect(parseIntent('play chess with me')).toBeNull()
    expect(parseIntent('tell me a joke')).toBeNull()
  })
})

describe('parseDuration', () => {
  it('reads numbers and words', () => {
    expect(parseDuration('90 seconds')).toBe(90)
    expect(parseDuration('1 hour 30 minutes')).toBe(5400)
    expect(parseDuration('five minutes')).toBe(300)
    expect(parseDuration('half an hour')).toBe(1800)
    expect(parseDuration('an hour and a half')).toBe(5400)
    expect(parseDuration('soon')).toBeNull()
  })
})

describe('validateAction', () => {
  it('rejects anything not on the list', () => {
    expect(validateAction({ type: 'run_command', cmd: 'format c:' })).toBeNull()
    expect(validateAction({ type: 'media', key: 'shutdown' })).toBeNull()
    expect(validateAction({ type: 'timer', seconds: -5 })).toBeNull()
    expect(validateAction({ type: 'timer', seconds: 1e9 })).toBeNull()
    expect(validateAction(null)).toBeNull()
  })
  it('only allows web links', () => {
    expect(safeUrl('file:///C:/Windows/System32')).toBeNull()
    expect(safeUrl('javascript:alert(1)')).toBeNull()
    expect(safeUrl('ms-settings:')).toBeNull()
    expect(safeUrl('http://localhost:3000')).toBeNull()
    expect(safeUrl('http://192.168.0.1')).toBeNull()
    expect(safeUrl('https://user:pass@example.com')).toBeNull()
    expect(safeUrl('example.com/page')).toBe('https://example.com/page')
  })
})

describe('extractActions', () => {
  it('takes tags out of the reply', () => {
    const r = extractActions('[happy] Opening Spotify for you. <<open_app Spotify>>')
    expect(r.text).toBe('[happy] Opening Spotify for you.')
    expect(r.actions).toEqual([{ type: 'open_app', app: 'Spotify' }])
  })
  it('drops unknown or invalid tags without running them', () => {
    const r = extractActions('Sure <<delete_files C:\\>> <<open_url file:///etc/passwd>> <<timer 60 tea>>')
    expect(r.actions).toEqual([{ type: 'timer', seconds: 60, label: 'tea' }])
    expect(r.text).toBe('Sure')
  })
})

describe('describeAction', () => {
  it('says plainly what will happen', () => {
    expect(describeAction({ type: 'timer', seconds: 330, label: 'tea' })).toBe('Set a timer for 5 minutes 30 seconds (tea)')
    expect(describeAction({ type: 'web_search', query: 'cats' })).toBe('Search the web for "cats"')
  })
})

describe('parseYesNo', () => {
  it('understands spoken answers', () => {
    expect(parseYesNo('Yeah, go ahead.')).toBe('yes')
    expect(parseYesNo('No thanks')).toBe('no')
    expect(parseYesNo('Cancel that')).toBe('no')
    expect(parseYesNo('what was that')).toBeNull()
  })
})

describe('bestAppMatch', () => {
  const apps = [
    { name: 'Spotify', appId: 'a' },
    { name: 'Discord', appId: 'b' },
    { name: 'Google Chrome', appId: 'c' },
    { name: 'Uninstall Discord', appId: 'd' },
    { name: 'Visual Studio Code', appId: 'e' }
  ]
  it('finds apps by name, start, part or a near miss', () => {
    expect(bestAppMatch('spotify', apps)?.appId).toBe('a')
    expect(bestAppMatch('Discord', apps)?.appId).toBe('b')
    expect(bestAppMatch('chrome', apps)?.appId).toBe('c')
    expect(bestAppMatch('visual studio', apps)?.appId).toBe('e')
    expect(bestAppMatch('spotfy', apps)?.appId).toBe('a')
    expect(bestAppMatch('photoshop', apps)).toBeNull()
  })
})

describe('parseIntent with a misheard name', () => {
  it('skips the greeting', () => {
    expect(parseIntent('Hey Robert Tico, search for pancakes.')).toEqual({ type: 'web_search', query: 'pancakes' })
    expect(parseIntent('hey robotico skip this song')).toEqual({ type: 'media', key: 'next' })
    expect(parseIntent('hey robotico how are you')).toBeNull()
  })
})

describe('Spotify playlists', () => {
  it('understands playlist requests', () => {
    expect(parseIntent('Play playlist Runnin In My Head')).toEqual({ type: 'spotify', query: 'Runnin In My Head', playlist: true })
    expect(parseIntent('play my gym playlist')).toEqual({ type: 'spotify', query: 'Gym', playlist: true })
    expect(parseIntent('play the playlist called chill vibes on spotify')).toEqual({ type: 'spotify', query: 'Chill Vibes', playlist: true })
    expect(extractActions('Sure. <<spotify_playlist Road Trip>>').actions).toEqual([{ type: 'spotify', query: 'Road Trip', playlist: true }])
  })
})

describe('parseDanceCommand', () => {
  it('starts and stops dancing', async () => {
    const { parseDanceCommand } = await import('../src/shared/actions')
    expect(parseDanceCommand('Dance to this song!')).toBe('start')
    expect(parseDanceCommand('Hey Robert Tico, dance')).toBe('start')
    expect(parseDanceCommand('stop dancing')).toBe('stop')
    expect(parseDanceCommand('can you dance?')).toBe('start')
    expect(parseDanceCommand('what is a dance')).toBeNull()
  })
})
