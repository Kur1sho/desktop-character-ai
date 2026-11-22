// Accounts the companion can connect to. Each is one button on the welcome
// screen: the sign-in happens on the service's own page in your browser, and
// only the access it needs is asked for.

export type ConnectionId = 'spotify' | 'discord' | 'calendar' | 'steam'

export interface ConnectionInfo {
  id: ConnectionId
  name: string
  /** What it lets the character do, in a few words. */
  blurb: string
  available: boolean
  /** Works without signing in (shown as ready, no button). */
  noSignIn?: boolean
  /** Badge colour for the tile. */
  color: string
}

export const CONNECTIONS: ConnectionInfo[] = [
  { id: 'spotify', name: 'Spotify', blurb: 'Play any song, artist or playlist. Uses the Spotify app, no sign-in needed', available: true, noSignIn: true, color: '#1db954' },
  { id: 'discord', name: 'Discord', blurb: 'Read out messages, mute and unmute', available: false, color: '#5865f2' },
  { id: 'calendar', name: 'Google Calendar', blurb: 'Remind you what\'s coming up', available: false, color: '#4285f4' },
  { id: 'steam', name: 'Steam', blurb: 'Launch your games by name', available: false, color: '#1b2838' }
]
