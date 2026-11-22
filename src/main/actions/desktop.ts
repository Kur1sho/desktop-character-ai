// Windows desktop control: windows, Steam games and a few PC settings.
// Same rules as the rest of the runner: scripts are fixed text, and the only
// data passed to them (a window handle, an operation name) is checked first
// and handed over in environment variables, never pasted into a command.
import { app, desktopCapturer, screen, shell } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ActionResult, SystemOp, WindowOp } from '../../shared/actions'
import {
  clearGameMatch,
  parseAppManifest,
  parseLibraryFolders,
  pickGame,
  pickWindow,
  type OpenWindow,
  type SteamGame
} from '../../shared/desktopMatch'

const isWindows = process.platform === 'win32'

function run(file: string, args: string[], timeoutMs = 15000, env?: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const options = { timeout: timeoutMs, windowsHide: true, env: env ? { ...process.env, ...env } : process.env }
    execFile(file, args, options, (err, stdout) => (err ? reject(err) : resolve(String(stdout))))
  })
}

const ps = (script: string, env?: Record<string, string>) =>
  run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], 20000, env)

// --- Windows ------------------------------------------------------------------

const LIST_WINDOWS = `
Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle } |
  ForEach-Object { [pscustomobject]@{ h = [string][int64]$_.MainWindowHandle; p = $_.ProcessName; t = $_.MainWindowTitle; id = $_.Id } } |
  ConvertTo-Json -Compress
`

const WINDOW_OP = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class CompanionWin {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int hh, bool repaint);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint msg, IntPtr wp, IntPtr lp);
  [DllImport("user32.dll")] public static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
}
"@
[CompanionWin]::SetProcessDPIAware() | Out-Null
$h = [IntPtr][int64]$env:WIN_HANDLE
function Front {
  if ([CompanionWin]::IsIconic($h)) { [CompanionWin]::ShowWindow($h, 9) | Out-Null }
  # A tap of Alt lets Windows hand focus to another app.
  [CompanionWin]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)
  [CompanionWin]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
  [CompanionWin]::SetForegroundWindow($h) | Out-Null
}
switch ($env:WIN_OP) {
  'focus' { Front }
  'minimize' { [CompanionWin]::ShowWindow($h, 6) | Out-Null }
  'maximize' { [CompanionWin]::ShowWindow($h, 3) | Out-Null; Front }
  'snap_left' {
    [CompanionWin]::ShowWindow($h, 9) | Out-Null
    $a = [System.Windows.Forms.Screen]::FromHandle($h).WorkingArea
    [CompanionWin]::MoveWindow($h, $a.X, $a.Y, [int]($a.Width / 2), $a.Height, $true) | Out-Null
    Front
  }
  'snap_right' {
    [CompanionWin]::ShowWindow($h, 9) | Out-Null
    $a = [System.Windows.Forms.Screen]::FromHandle($h).WorkingArea
    $w = [int]($a.Width / 2)
    [CompanionWin]::MoveWindow($h, $a.X + $a.Width - $w, $a.Y, $w, $a.Height, $true) | Out-Null
    Front
  }
  'close' { [CompanionWin]::PostMessage($h, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null }
}
`

async function openWindows(): Promise<OpenWindow[]> {
  const out = (await ps(LIST_WINDOWS)).trim()
  const parsed = JSON.parse(out || '[]') as { h: string; p: string; t: string; id: number } | { h: string; p: string; t: string; id: number }[]
  return (Array.isArray(parsed) ? parsed : [parsed])
    .filter((w) => w && /^\d+$/.test(String(w.h)) && w.id !== process.pid && w.p !== 'electron' && w.p !== app.getName())
    .map((w) => ({ handle: String(w.h), process: String(w.p), title: String(w.t) }))
}

const DONE: Record<WindowOp, (name: string) => string> = {
  focus: (n) => `Switched to ${n}.`,
  minimize: (n) => `Minimised ${n}.`,
  maximize: (n) => `Maximised ${n}.`,
  snap_left: (n) => `Moved ${n} to the left.`,
  snap_right: (n) => `Moved ${n} to the right.`,
  close: (n) => `Closed ${n}.`
}

/**
 * Does something to an app's window. If "switch to X" finds no window, X is
 * opened instead, via `openApp`.
 */
export async function windowAction(
  op: WindowOp,
  name: string,
  openApp: (name: string) => Promise<ActionResult>
): Promise<ActionResult> {
  if (!isWindows) return { ok: false, message: 'Window controls only work on Windows for now.' }
  const target = pickWindow(name, await openWindows())
  if (!target) {
    if (op === 'focus') return openApp(name)
    return { ok: false, message: `I can't see a ${name} window open.` }
  }
  await ps(WINDOW_OP, { WIN_HANDLE: target.handle, WIN_OP: op })
  return { ok: true, message: DONE[op](friendly(target, name)) }
}

function friendly(w: OpenWindow, said: string): string {
  return w.process.length > 2 && !/^(?:application|applicationframehost)$/i.test(w.process) ? said : w.title
}

// --- Steam games ----------------------------------------------------------------

let gamesCache: { at: number; games: SteamGame[] } | null = null

async function steamPath(): Promise<string | null> {
  try {
    const out = await run('reg.exe', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], 5000)
    const m = out.match(/SteamPath\s+REG_SZ\s+(.+)/)
    if (m) return m[1].trim().replace(/\//g, '\\')
  } catch {
    /* not in the registry */
  }
  for (const p of ['C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam']) if (existsSync(p)) return p
  return null
}

/** Games installed through Steam, read from Steam's own files on this PC. */
export async function steamGames(): Promise<SteamGame[]> {
  if (gamesCache && Date.now() - gamesCache.at < 5 * 60 * 1000) return gamesCache.games
  const games: SteamGame[] = []
  const root = isWindows ? await steamPath() : null
  if (root) {
    const vdf = [join(root, 'steamapps', 'libraryfolders.vdf'), join(root, 'config', 'libraryfolders.vdf')].find(existsSync)
    const libraries = new Set([root, ...(vdf ? parseLibraryFolders(readFileSync(vdf, 'utf8')) : [])])
    for (const lib of libraries) {
      const dir = join(lib, 'steamapps')
      let files: string[] = []
      try {
        files = readdirSync(dir).filter((f) => /^appmanifest_\d+\.acf$/.test(f))
      } catch {
        continue
      }
      for (const f of files) {
        try {
          const g = parseAppManifest(readFileSync(join(dir, f), 'utf8'))
          if (g && !games.some((x) => x.appId === g.appId)) games.push(g)
        } catch {
          /* unreadable manifest */
        }
      }
    }
  }
  gamesCache = { at: Date.now(), games }
  return games
}

async function startSteamGame(g: SteamGame): Promise<ActionResult> {
  if (!/^\d+$/.test(g.appId)) return { ok: false, message: "That game doesn't look right." }
  await shell.openExternal(`steam://rungameid/${g.appId}`)
  return { ok: true, message: `Launching ${g.name}.` }
}

/** Launches an installed game: Steam first, then anything in the Start menu. */
export async function launchGame(name: string, openApp: (name: string) => Promise<ActionResult>): Promise<ActionResult> {
  const g = pickGame(name, await steamGames())
  if (g) return startSteamGame(g)
  const opened = await openApp(name)
  return opened.ok ? opened : { ok: false, message: `I couldn't find a game called "${name}" on this PC.` }
}

/** For "play X": a clearly matching installed game, so it launches instead of searching Spotify. */
export async function clearlyAGame(name: string): Promise<SteamGame | null> {
  try {
    return clearGameMatch(name, await steamGames())
  } catch {
    return null
  }
}

export { startSteamGame }

// --- PC settings ----------------------------------------------------------------

const PERSONALIZE = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize'

const BRIGHTNESS = `
$ErrorActionPreference = 'Stop'
$cur = (Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness | Select-Object -First 1).CurrentBrightness
$new = [Math]::Max(0, [Math]::Min(100, $cur + [int]$env:BRIGHT_STEP))
Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods | Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{ Timeout = 1; Brightness = [byte]$new } | Out-Null
Write-Output $new
`

async function setTheme(light: boolean): Promise<void> {
  const value = light ? '1' : '0'
  for (const key of ['AppsUseLightTheme', 'SystemUsesLightTheme']) {
    await run('reg.exe', ['add', PERSONALIZE, '/v', key, '/t', 'REG_DWORD', '/d', value, '/f'], 5000)
  }
}

/** Saves a picture of the screen the mouse is on to Pictures\Screenshots, on this PC only. */
async function screenshot(): Promise<ActionResult> {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const size = { width: Math.round(display.size.width * display.scaleFactor), height: Math.round(display.size.height * display.scaleFactor) }
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size })
  const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0]
  if (!source || source.thumbnail.isEmpty()) return { ok: false, message: "I couldn't capture the screen." }
  const dir = join(app.getPath('pictures'), 'Screenshots')
  mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const file = join(dir, `Screenshot ${stamp}.png`)
  writeFileSync(file, source.thumbnail.toPNG())
  shell.showItemInFolder(file)
  return { ok: true, message: 'Screenshot saved to Pictures, Screenshots.' }
}

export async function systemAction(op: SystemOp): Promise<ActionResult> {
  if (op === 'screenshot') return screenshot()
  if (!isWindows) return { ok: false, message: 'That only works on Windows for now.' }
  switch (op) {
    case 'lock':
      await run('rundll32.exe', ['user32.dll,LockWorkStation'], 5000)
      return { ok: true, message: 'Locked.' }
    case 'dark_mode':
      await setTheme(false)
      return { ok: true, message: 'Dark mode on.' }
    case 'light_mode':
      await setTheme(true)
      return { ok: true, message: 'Light mode on.' }
    case 'brightness_up':
    case 'brightness_down':
      try {
        const level = (await ps(BRIGHTNESS, { BRIGHT_STEP: op === 'brightness_up' ? '20' : '-20' })).trim()
        return { ok: true, message: `Brightness ${level}%.` }
      } catch {
        return { ok: false, message: 'I can only change the brightness of laptop screens.' }
      }
    case 'show_desktop':
      await ps('(New-Object -ComObject Shell.Application).ToggleDesktop()')
      return { ok: true, message: 'There you go.' }
  }
}
