// Runs actions from the safe list in src/shared/actions.ts. Every action is
// checked again here, in the main process, so nothing the renderer or the AI
// sends can run anything else. No shell commands are built from user text:
// programs are started with fixed arguments, and apps are only started from
// Windows' own list of installed apps.
import { app, shell } from 'electron'
import { execFile } from 'node:child_process'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { bestAppMatch, describeAction, validateAction, type Action, type ActionResult } from '../../shared/actions'

const isWindows = process.platform === 'win32'

function run(file: string, args: string[], timeoutMs = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: timeoutMs, windowsHide: true }, (err, stdout) =>
      err ? reject(err) : resolve(String(stdout))
    )
  })
}

// --- Installed apps -----------------------------------------------------------

interface StartApp {
  name: string
  appId: string
}

let appsCache: { at: number; apps: StartApp[] } | null = null

/** Windows' list of apps in the Start menu, including Store apps. */
async function installedApps(): Promise<StartApp[]> {
  if (appsCache && Date.now() - appsCache.at < 10 * 60 * 1000) return appsCache.apps
  const out = await run('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    'Get-StartApps | Select-Object Name, AppID | ConvertTo-Json -Compress'
  ])
  const parsed = JSON.parse(out || '[]') as { Name: string; AppID: string } | { Name: string; AppID: string }[]
  const apps = (Array.isArray(parsed) ? parsed : [parsed])
    .filter((a) => a && typeof a.Name === 'string' && typeof a.AppID === 'string')
    .map((a) => ({ name: a.Name, appId: a.AppID }))
  appsCache = { at: Date.now(), apps }
  return apps
}

/** Windows built-ins that aren't always in the Start menu list. */
const BUILT_IN: Record<string, () => Promise<unknown>> = {
  calculator: () => shell.openExternal('calculator:'),
  settings: () => shell.openExternal('ms-settings:'),
  'microsoft store': () => shell.openExternal('ms-windows-store:'),
  'file explorer': () => run('explorer.exe', [], 5000).catch(() => undefined),
  explorer: () => run('explorer.exe', [], 5000).catch(() => undefined),
  files: () => run('explorer.exe', [], 5000).catch(() => undefined),
  'task manager': () => run('taskmgr.exe', [], 5000).catch(() => undefined)
}

async function openApp(name: string): Promise<ActionResult> {
  const builtIn = BUILT_IN[name.toLowerCase()]
  if (builtIn) {
    await builtIn()
    return { ok: true, message: `Opened ${name}.` }
  }
  if (!isWindows) return { ok: false, message: 'Opening apps only works on Windows for now.' }
  const found = bestAppMatch(name, await installedApps())
  if (!found) return { ok: false, message: `I couldn't find an app called "${name}".` }
  // The AppID comes from Windows' own list, never from what was said.
  await run('explorer.exe', [`shell:AppsFolder\\${found.appId}`], 5000).catch(() => undefined)
  return { ok: true, message: `Opened ${found.name}.` }
}

// --- Media keys and volume ------------------------------------------------------

/** Windows virtual key codes, sent as fixed key presses. */
const KEYS = { playpause: 179, next: 176, previous: 177, up: 175, down: 174, mute: 173 } as const

async function pressKey(key: keyof typeof KEYS, times = 1): Promise<void> {
  if (!isWindows) throw new Error('Music and volume controls only work on Windows for now.')
  const code = KEYS[key]
  const presses = Array(times).fill(`$s.SendKeys([char]${code})`).join(';')
  await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$s = New-Object -ComObject WScript.Shell; ${presses}`])
}

// --- Activity log -----------------------------------------------------------------

function log(action: Action, result: ActionResult, source: string): void {
  try {
    const dir = join(app.getPath('userData'), 'activity')
    mkdirSync(dir, { recursive: true })
    const line = { time: new Date().toISOString(), source, action: describeAction(action), ok: result.ok, result: result.message }
    appendFileSync(join(dir, 'actions.log'), JSON.stringify(line) + '\n')
  } catch {
    /* logging must never stop an action */
  }
}

export function activityLogPath(): string {
  return join(app.getPath('userData'), 'activity', 'actions.log')
}

/** Runs one action the user has confirmed. Timers run in the companion window, so they're only logged here. */
export async function runAction(raw: unknown, source: 'user' | 'ai'): Promise<ActionResult> {
  const action = validateAction(raw)
  if (!action) return { ok: false, message: "That isn't something I'm allowed to do." }
  let result: ActionResult
  try {
    switch (action.type) {
      case 'open_app':
        result = await openApp(action.app)
        break
      case 'open_url':
        await shell.openExternal(action.url)
        result = { ok: true, message: `Opened ${new URL(action.url).hostname}.` }
        break
      case 'web_search':
        // DuckDuckGo, because it doesn't track searches.
        await shell.openExternal(`https://duckduckgo.com/?q=${encodeURIComponent(action.query)}`)
        result = { ok: true, message: `Searched for "${action.query}".` }
        break
      case 'spotify':
        await shell.openExternal(`spotify:search:${encodeURIComponent(action.query)}`).catch(() =>
          shell.openExternal(`https://open.spotify.com/search/${encodeURIComponent(action.query)}`)
        )
        result = { ok: true, message: `Found "${action.query}" in Spotify.` }
        break
      case 'media':
        await pressKey(action.key)
        result = { ok: true, message: { playpause: 'Done.', next: 'Skipped.', previous: 'Went back a track.' }[action.key] }
        break
      case 'volume':
        await pressKey(action.change, action.change === 'mute' ? 1 : 5)
        result = { ok: true, message: { up: 'Turned it up.', down: 'Turned it down.', mute: 'Done.' }[action.change] }
        break
      case 'timer':
        result = { ok: true, message: 'Timer set.' }
        break
    }
  } catch (err) {
    result = { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
  log(action, result, source)
  return result
}
