// Accounts the companion can connect to. Each is one button on the welcome
// screen: the sign-in happens on the service's own page in your browser, and
// only the access it needs is asked for.

/**
 * The app's own Spotify Client ID. It's public (not a secret), so it ships in
 * the app and users never touch developer settings. Set it once from
 * developer.spotify.com/dashboard (Redirect URI http://127.0.0.1:43821/callback).
 */
export const SPOTIFY_CLIENT_ID = ''

export type ConnectionId = 'spotify' | 'discord' | 'calendar' | 'steam'

export interface ConnectionInfo {
  id: ConnectionId
  name: string
  /** What it lets the character do, in a few words. */
  blurb: string
  available: boolean
  /** Badge colour for the tile. */
  color: string
}

export const CONNECTIONS: ConnectionInfo[] = [
  { id: 'spotify', name: 'Spotify', blurb: 'Play any song, artist or playlist', available: true, color: '#1db954' },
  { id: 'discord', name: 'Discord', blurb: 'Read out messages, mute and unmute', available: false, color: '#5865f2' },
  { id: 'calendar', name: 'Google Calendar', blurb: 'Remind you what\'s coming up', available: false, color: '#4285f4' },
  { id: 'steam', name: 'Steam', blurb: 'Launch your games by name', available: false, color: '#1b2838' }
]
