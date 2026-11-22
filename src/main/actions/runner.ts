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

function run(file: string, args: string[], timeoutMs = 15000, env?: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const options = { timeout: timeoutMs, windowsHide: true, env: env ? { ...process.env, ...env } : process.env }
    execFile(file, args, options, (err, stdout) =>
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

// --- Spotify -----------------------------------------------------------------

async function showInSpotify(query: string): Promise<void> {
  await shell.openExternal(`spotify:search:${encodeURIComponent(query)}`).catch(() =>
    shell.openExternal(`https://open.spotify.com/search/${encodeURIComponent(query)}`)
  )
}

/**
 * Presses play on the top search result in the Spotify app, using Windows'
 * accessibility interface (the same one screen readers use). No sign-in, so it
 * works for every user, free or Premium. The script is fixed text: the search
 * itself is opened separately, so nothing said ever ends up in a command.
 */
const PRESS_TOP_RESULT = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$A = [System.Windows.Automation.AutomationElement]
$scope = [System.Windows.Automation.TreeScope]::Descendants
$isButton = New-Object System.Windows.Automation.PropertyCondition($A::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)
Start-Sleep -Milliseconds 1200
$deadline = (Get-Date).AddSeconds(10)
while ((Get-Date) -lt $deadline) {
  $p = Get-Process Spotify -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if ($p) {
    $root = $A::FromHandle($p.MainWindowHandle)
    $top = $root.FindFirst($scope, (New-Object System.Windows.Automation.PropertyCondition($A::NameProperty, 'Top result')))
    $area = if ($top) { $top } else { $root }
    foreach ($b in $area.FindAll($scope, $isButton)) {
      $n = $b.Current.Name
      if ($n -like 'Play *' -and $b.Current.IsEnabled -and -not $b.Current.IsOffscreen) {
        $b.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
        Write-Output $n.Substring(5)
        exit 0
      }
    }
  }
  Start-Sleep -Milliseconds 400
}
exit 3
`

/**
 * Presses play on a playlist by name. With SPOTIFY_MODE=library it looks in
 * Your Library (the user's own playlists); with SPOTIFY_MODE=search it looks
 * at the search results. The name is passed in an environment variable, so
 * it's only ever data, never part of the command.
 */
const PRESS_PLAYLIST = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$A = [System.Windows.Automation.AutomationElement]
$scope = [System.Windows.Automation.TreeScope]::Descendants
$isButton = New-Object System.Windows.Automation.PropertyCondition($A::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)
function Norm([string]$s) { (($s.ToLower() -replace '[^a-z0-9 ]', '') -replace 'ing\\b', 'in') -replace ' ', '' }
$want = Norm $env:SPOTIFY_TARGET
if (-not $want) { exit 3 }
$wait = if ($env:SPOTIFY_MODE -eq 'search') { 1200 } else { 300 }
Start-Sleep -Milliseconds $wait
$deadline = (Get-Date).AddSeconds(10)
while ((Get-Date) -lt $deadline) {
  $p = Get-Process Spotify -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if ($p) {
    $root = $A::FromHandle($p.MainWindowHandle)
    $best = $null
    foreach ($b in $root.FindAll($scope, $isButton)) {
      $n = $b.Current.Name
      if ($n -notlike 'Play *') { continue }
      $name = Norm $n.Substring(5)
      if ($name -eq $want) { $best = $b; break }
      if (-not $best -and $name.Contains($want)) { $best = $b }
    }
    if ($best) {
      $best.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
      Write-Output $best.Current.Name.Substring(5)
      exit 0
    }
    if ($env:SPOTIFY_MODE -ne 'search') { exit 4 }
  }
  Start-Sleep -Milliseconds 400
}
exit 3
`

/** Plays a playlist: the user's own first (Your Library), then search results. */
async function playPlaylist(name: string): Promise<ActionResult> {
  const press = (mode: 'library' | 'search') =>
    run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PRESS_PLAYLIST], 20000, {
      SPOTIFY_TARGET: name,
      SPOTIFY_MODE: mode
    }).then((out) => out.trim())
  if (!isWindows) {
    await showInSpotify(name)
    return { ok: true, message: `Opened "${name}" in Spotify.` }
  }
  await shell.openExternal('spotify:').catch(() => undefined)
  try {
    return { ok: true, message: `Playing your playlist ${await press('library')}.` }
  } catch {
    /* not in their library: search for it */
  }
  await showInSpotify(name)
  try {
    return { ok: true, message: `Playing the playlist ${await press('search')}.` }
  } catch {
    return { ok: true, message: `I couldn't find a playlist called "${name}", so I opened the search in Spotify.` }
  }
}

/** Opens the search in Spotify and presses play on the top result. Falls back to just showing the search. */
async function playOnSpotify(query: string): Promise<ActionResult> {
  await showInSpotify(query)
  if (!isWindows) return { ok: true, message: `Opened "${query}" in Spotify.` }
  try {
    const played = (await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PRESS_TOP_RESULT], 20000)).trim()
    return { ok: true, message: played ? `Playing ${played}.` : `Playing "${query}".` }
  } catch {
    return { ok: true, message: `I opened "${query}" in Spotify, but couldn't press play. Click the top result.` }
  }
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
        result = action.playlist ? await playPlaylist(action.query) : await playOnSpotify(action.query)
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
