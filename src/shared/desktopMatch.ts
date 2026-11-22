// Pure helpers for desktop actions: matching what was said to open windows and
// installed Steam games. No Electron or Node imports, so they can be tested.
import { bestAppMatch } from './actions'

export interface OpenWindow {
  /** Window handle, as a decimal string. */
  handle: string
  process: string
  title: string
}

export interface SteamGame {
  appId: string
  name: string
}

function squash(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Names people say vs. the process names Windows uses. */
const PROCESS_ALIASES: Record<string, string> = {
  edge: 'msedge',
  microsoftedge: 'msedge',
  vscode: 'code',
  visualstudiocode: 'code',
  word: 'winword',
  microsoftword: 'winword',
  excel: 'excel',
  powerpoint: 'powerpnt',
  teams: 'ms-teams',
  fileexplorer: 'explorer',
  files: 'explorer',
  explorer: 'explorer',
  taskmanager: 'taskmgr',
  calculator: 'calculatorapp',
  settings: 'systemsettings',
  googlechrome: 'chrome',
  firefox: 'firefox',
  steam: 'steamwebhelper'
}

/** The open window that best matches a name like "Discord" or "Chrome". */
export function pickWindow(query: string, windows: OpenWindow[]): OpenWindow | null {
  const q = squash(query)
  if (!q) return null
  const alias = PROCESS_ALIASES[q]
  if (alias) {
    const hit = windows.find((w) => squash(w.process) === squash(alias))
    if (hit) return hit
  }
  const byProcess = bestAppMatch(query, windows.map((w) => ({ name: w.process, w })))
  if (byProcess) return byProcess.w
  if (q.length >= 3) {
    const byTitle = windows.find((w) => squash(w.title).includes(q))
    if (byTitle) return byTitle
  }
  return null
}

/** Library folders listed in Steam's libraryfolders.vdf. */
export function parseLibraryFolders(vdf: string): string[] {
  const out: string[] = []
  for (const m of vdf.matchAll(/"path"\s+"((?:[^"\\]|\\.)*)"/g)) out.push(m[1].replace(/\\\\/g, '\\'))
  return [...new Set(out)]
}

const NOT_GAMES = /steamworks|redistributable|proton|steam linux runtime|steamvr|soundtrack|dedicated server|sdk\b/i

/** The game in an appmanifest_*.acf file, or null for tools and runtimes. */
export function parseAppManifest(acf: string): SteamGame | null {
  const appId = acf.match(/"appid"\s+"(\d+)"/)?.[1]
  const name = acf.match(/"name"\s+"((?:[^"\\]|\\.)*)"/)?.[1]
  if (!appId || !name || NOT_GAMES.test(name)) return null
  return { appId, name: name.replace(/\\(.)/g, '$1') }
}

/** The installed game that matches a name, allowing small mistakes ("elden ring" -> "ELDEN RING"). */
export function pickGame(query: string, games: SteamGame[]): SteamGame | null {
  return bestAppMatch(query, games)
}

/**
 * Only a clear match: the whole name, or the start of it ("minecraft" ->
 * "Minecraft Launcher"). Used to tell "play Minecraft" (a game) from
 * "play Faint" (a song).
 */
export function clearGameMatch(query: string, games: SteamGame[]): SteamGame | null {
  const q = squash(query)
  if (q.length < 3) return null
  return games.find((g) => squash(g.name) === q) ?? games.find((g) => squash(g.name).startsWith(q) && q.length >= 5) ?? null
}
