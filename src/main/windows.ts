// Where the other windows on screen are, so the character can sit on top of them.
// Asks Windows UI Automation (the same thing screen readers use) through one small
// PowerShell process that's started when needed and closed when it's not.
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { screen, type Rectangle } from 'electron'
import { parseWindows, type WinRect } from '../shared/perch'

const SETUP = [
  "$ErrorActionPreference = 'SilentlyContinue'",
  'Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes',
  '$A = [System.Windows.Automation.AutomationElement]; $kids = [System.Windows.Automation.TreeScope]::Children',
  '$isWin = New-Object System.Windows.Automation.PropertyCondition($A::ControlTypeProperty, [System.Windows.Automation.ControlType]::Window)',
  // Visible top-level windows, front first: handle,x,y,width,height (physical pixels).
  "function Get-Wins { $out = @(); foreach ($w in $A::RootElement.FindAll($kids, $isWin)) { try { $c = $w.Current; if ($c.IsOffscreen -or $c.ProcessId -eq [int]$env:COMPANION_PID) { continue }; $r = $c.BoundingRectangle; if ($r.Width -lt 160 -or $r.Height -lt 100) { continue }; $out += ('{0},{1},{2},{3},{4}' -f $c.NativeWindowHandle, [int]$r.X, [int]$r.Y, [int]$r.Width, [int]$r.Height) } catch {} }; [Console]::Out.WriteLine('WINS ' + ($out -join ';')); [Console]::Out.Flush() }"
]

let proc: ChildProcessWithoutNullStreams | null = null
let buffer = ''
let waiting: ((line: string) => void)[] = []
let idleTimer: NodeJS.Timeout | null = null
let broken = false

function helper(): ChildProcessWithoutNullStreams | null {
  if (proc) return proc
  if (process.platform !== 'win32' || broken) return null
  const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-NoLogo', '-Command', '-'], {
    windowsHide: true,
    env: { ...process.env, COMPANION_PID: String(process.pid) }
  })
  p.stdout.setEncoding('utf8')
  p.stdout.on('data', (chunk: string) => {
    buffer += chunk
    let nl: number
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (line.startsWith('WINS')) waiting.shift()?.(line.slice(4).trim())
    }
  })
  p.on('error', () => {
    broken = true
    stopWindows()
  })
  p.on('exit', () => {
    if (proc === p) proc = null
    for (const w of waiting) w('')
    waiting = []
  })
  p.stdin.write(SETUP.join('\n') + '\n')
  proc = p
  return p
}

/**
 * Visible windows, front first, relative to the overlay's top left (in the same
 * pixels the overlay uses). Empty if this isn't possible on this PC.
 */
export async function listWindows(overlay: Rectangle): Promise<WinRect[]> {
  const p = helper()
  if (!p) return []
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(stopWindows, 60_000)
  const line = await new Promise<string>((resolve) => {
    const timeout = setTimeout(() => {
      waiting = waiting.filter((w) => w !== done)
      resolve('')
    }, 4000)
    const done = (l: string): void => {
      clearTimeout(timeout)
      resolve(l)
    }
    waiting.push(done)
    p.stdin.write('Get-Wins\n')
  })
  return parseWindows(line).map((w) => {
    const dip = process.platform === 'win32' ? screen.screenToDipRect(null, w) : w
    return { id: w.id, x: dip.x - overlay.x, y: dip.y - overlay.y, width: dip.width, height: dip.height }
  })
}

export function stopWindows(): void {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = null
  if (proc) {
    proc.stdin.end()
    proc.kill()
  }
  proc = null
}
