// Whether the user is at the PC, and whether a Steam game is running.
// Uses only how long since the mouse or keyboard was last touched (from Windows),
// never which keys, and Steam's own "running game" entry in the registry.
import { execFile } from 'node:child_process'
import { powerMonitor } from 'electron'
import { parseRunningAppId, type Presence } from '../shared/chatter'

let timer: NodeJS.Timeout | null = null
let game: string | null = null
let gameCheck = 0
const names = new Map<number, string>()

/** Calls back every 2 seconds with how idle the user is and what game is running. */
export function startPresence(onPresence: (p: Presence) => void): void {
  stopPresence()
  const tick = (): void => {
    if (Date.now() - gameCheck > 10_000) {
      gameCheck = Date.now()
      void runningSteamGame().then((g) => (game = g))
    }
    onPresence({ idleSec: powerMonitor.getSystemIdleTime(), game })
  }
  tick()
  timer = setInterval(tick, 2000)
}

export function stopPresence(): void {
  if (timer) clearInterval(timer)
  timer = null
}

function reg(args: string[]): Promise<string> {
  return new Promise((resolve) =>
    execFile('reg.exe', args, { windowsHide: true, timeout: 4000 }, (err, out) => resolve(err ? '' : String(out)))
  )
}

/** The game Steam says is running ('' if its name isn't known), or null. Our own app doesn't count. */
async function runningSteamGame(): Promise<string | null> {
  if (process.platform !== 'win32') return null
  const out = await reg(['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'RunningAppID'])
  const id = parseRunningAppId(out)
  if (!id || String(id) === process.env['SteamAppId']) return null
  if (!names.has(id)) {
    const info = await reg(['query', `HKCU\\Software\\Valve\\Steam\\Apps\\${id}`, '/v', 'Name'])
    names.set(id, /Name\s+REG_SZ\s+(.+)/.exec(info)?.[1]?.trim() ?? '')
  }
  return names.get(id) ?? ''
}
