// Plays music through the user's own Spotify account, using Spotify's official
// Web API. Sign-in uses PKCE in the user's browser, so there's no password or
// app secret anywhere: Spotify gives back a token that is stored encrypted on
// this PC. Only playback scopes are requested.
//
// Spotify only allows starting playback for Premium accounts.
import { shell } from 'electron'
import { createHash, randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { getSecret, getSettings, setSecret } from './settingsStore'

export const SPOTIFY_REDIRECT = 'http://127.0.0.1:43821/callback'
const SCOPES = 'user-modify-playback-state user-read-playback-state'
const ACCOUNTS = 'https://accounts.spotify.com'
const API = 'https://api.spotify.com/v1'

let access: { token: string; expires: number } | null = null

const base64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export function isSpotifyConnected(): boolean {
  return Boolean(getSecret('spotifyRefresh'))
}

export function disconnectSpotify(): void {
  access = null
  setSecret('spotifyRefresh', null)
}

async function tokenRequest(body: Record<string, string>): Promise<void> {
  const res = await fetch(`${ACCOUNTS}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body)
  })
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    error_description?: string
  }
  if (!res.ok || !json.access_token) throw new Error(json.error_description || `Spotify sign-in failed (${res.status}).`)
  access = { token: json.access_token, expires: Date.now() + ((json.expires_in ?? 3600) - 60) * 1000 }
  if (json.refresh_token) setSecret('spotifyRefresh', json.refresh_token)
}

/** Opens Spotify's sign-in page in the browser and waits for the user to approve. */
export function connectSpotify(clientId: string): Promise<void> {
  const id = clientId.trim()
  if (!/^[a-zA-Z0-9]{16,64}$/.test(id)) return Promise.reject(new Error('That doesn\'t look like a Spotify Client ID.'))
  const verifier = base64url(randomBytes(64))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  const state = base64url(randomBytes(16))

  return new Promise((resolve, reject) => {
    let server: Server | null = null
    const done = (err?: Error) => {
      clearTimeout(timer)
      server?.close()
      server = null
      if (err) reject(err)
      else resolve()
    }
    const timer = setTimeout(() => done(new Error('Spotify sign-in timed out. Try again.')), 3 * 60 * 1000)

    server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', SPOTIFY_REDIRECT)
      if (url.pathname !== '/callback') {
        res.writeHead(404).end()
        return
      }
      const page = (msg: string) =>
        res
          .writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          .end(`<body style="font:18px system-ui;padding:40px">${msg} You can close this tab.</body>`)
      if (url.searchParams.get('state') !== state) {
        page('Something went wrong (the sign-in didn\'t match).')
        return done(new Error('Spotify sign-in didn\'t match. Try again.'))
      }
      const code = url.searchParams.get('code')
      if (!code) {
        page('Spotify wasn\'t connected.')
        return done(new Error('Spotify sign-in was cancelled.'))
      }
      tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: SPOTIFY_REDIRECT, client_id: id, code_verifier: verifier })
        .then(() => {
          page('Spotify is connected!')
          done()
        })
        .catch((err: Error) => {
          page('Spotify couldn\'t be connected.')
          done(err)
        })
    })
    server.on('error', (err) => done(err))
    server.listen(43821, '127.0.0.1', () => {
      const auth = new URL(`${ACCOUNTS}/authorize`)
      auth.search = new URLSearchParams({
        client_id: id,
        response_type: 'code',
        redirect_uri: SPOTIFY_REDIRECT,
        code_challenge_method: 'S256',
        code_challenge: challenge,
        scope: SCOPES,
        state
      }).toString()
      void shell.openExternal(auth.toString())
    })
  })
}

async function token(): Promise<string> {
  if (access && Date.now() < access.expires) return access.token
  const refresh = getSecret('spotifyRefresh')
  const clientId = getSettings().spotifyClientId
  if (!refresh || !clientId) throw new Error('Spotify isn\'t connected. Connect it in Settings.')
  await tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh, client_id: clientId })
  return access!.token
}

async function api<T>(path: string, init: RequestInit = {}): Promise<{ status: number; data: T | null }> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json', ...init.headers }
  })
  const text = await res.text()
  let data: T | null = null
  try {
    data = text ? (JSON.parse(text) as T) : null
  } catch {
    /* empty or not JSON */
  }
  return { status: res.status, data }
}

interface Device {
  id: string
  is_active: boolean
  name: string
}

async function devices(): Promise<Device[]> {
  const { data } = await api<{ devices: Device[] }>('/me/player/devices')
  return data?.devices ?? []
}

/** Finds a device to play on, opening the Spotify app if nothing is running. */
async function pickDevice(): Promise<Device | null> {
  let list = await devices()
  if (list.length === 0) {
    await shell.openExternal('spotify:').catch(() => undefined)
    for (let i = 0; i < 10 && list.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 1000))
      list = await devices()
    }
  }
  return list.find((d) => d.is_active) ?? list[0] ?? null
}

interface Found {
  label: string
  body: { uris: string[] } | { context_uri: string }
}

/** Works out what "play X" means: a song or artist if it clearly matches, otherwise a playlist (good for "lofi", "jazz"). */
async function find(query: string): Promise<Found | null> {
  const q = encodeURIComponent(query)
  const { data } = await api<{
    tracks?: { items: { uri: string; name: string; artists: { name: string }[] }[] }
    artists?: { items: { uri: string; name: string }[] }
    playlists?: { items: ({ uri: string; name: string } | null)[] }
  }>(`/search?q=${q}&type=track,artist,playlist&limit=3`)
  const words = query.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w) => w && w !== 'by')
  const covers = (s: string) => words.every((w) => s.toLowerCase().includes(w))

  const track = data?.tracks?.items?.[0]
  const artist = data?.artists?.items?.[0]
  const playlist = data?.playlists?.items?.find((p) => p)

  if (track && covers(`${track.name} ${track.artists.map((a) => a.name).join(' ')}`) && words.length > 1) {
    return { label: `"${track.name}" by ${track.artists[0]?.name ?? 'unknown'}`, body: { uris: [track.uri] } }
  }
  if (artist && artist.name.toLowerCase() === query.toLowerCase()) {
    return { label: artist.name, body: { context_uri: artist.uri } }
  }
  if (playlist) return { label: `the "${playlist.name}" playlist`, body: { context_uri: playlist.uri } }
  if (track) return { label: `"${track.name}" by ${track.artists[0]?.name ?? 'unknown'}`, body: { uris: [track.uri] } }
  return null
}

/** Plays the best match for what was asked. Returns a sentence for the speech bubble. */
export async function spotifyPlay(query: string): Promise<string> {
  const found = await find(query)
  if (!found) throw new Error(`I couldn't find "${query}" on Spotify.`)
  const device = await pickDevice()
  if (!device) throw new Error('Open Spotify on this PC first, then ask again.')
  const { status } = await api(`/me/player/play?device_id=${encodeURIComponent(device.id)}`, {
    method: 'PUT',
    body: JSON.stringify(found.body)
  })
  if (status === 403) throw new Error('Spotify only lets apps start music on Premium accounts.')
  if (status === 404) throw new Error('Spotify couldn\'t find a device to play on. Open Spotify and try again.')
  if (status >= 300) throw new Error(`Spotify said no (error ${status}).`)
  return `Playing ${found.label}.`
}
