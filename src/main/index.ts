import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, screen, session, Tray } from 'electron'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { computeLayout } from '../shared/layout'
import { IPC } from '../shared/ipc'
import type { ProviderId, Settings } from '../shared/settings'
import { chat, clearHistory } from './ai/conversation'
import { getPublicSettings, getSettings, saveSettings, setApiKey } from './settingsStore'

let win: BrowserWindow | null = null
let tray: Tray | null = null
let settingsWin: BrowserWindow | null = null

const TALK_HOTKEY = 'CommandOrControl+Shift+Space'
const TYPE_HOTKEY = 'CommandOrControl+Shift+T'

// Only one copy of the companion should ever run.
if (!app.requestSingleInstanceLock()) app.quit()

function sendLayout(): void {
  if (!win) return
  const display = screen.getDisplayMatching(win.getBounds())
  win.webContents.send(IPC.layout, computeLayout(display.bounds, display.workArea))
}

function createWindow(): void {
  const display = screen.getPrimaryDisplay()
  win = new BrowserWindow({
    ...display.bounds,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    hasShadow: false,
    skipTaskbar: true,
    focusable: true,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  // 'screen-saver' keeps the character above the taskbar on Windows.
  win.setAlwaysOnTop(true, 'screen-saver')
  // Start fully click-through. The renderer turns this off while the mouse is
  // over the character, so the rest of the desktop works as normal.
  win.setIgnoreMouseEvents(true, { forward: true })

  loadPage(win, 'index.html')
  win.webContents.on('did-finish-load', sendLayout)
  win.on('closed', () => (win = null))
}

function loadPage(target: BrowserWindow, page: string): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) void target.loadURL(`${devUrl}/${page}`)
  else void target.loadFile(join(__dirname, '../renderer', page))
}

function openSettings(): void {
  if (settingsWin) {
    settingsWin.focus()
    return
  }
  settingsWin = new BrowserWindow({
    width: 520,
    height: 640,
    title: 'Desktop Companion Settings',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  loadPage(settingsWin, 'settings.html')
  settingsWin.on('closed', () => (settingsWin = null))
}

function startListening(): void {
  if (!win) return
  win.webContents.send(IPC.listen)
}

function openChat(): void {
  if (!win) return
  win.focus()
  win.webContents.send(IPC.openChat)
}

function findDefaultModel(): string | null {
  const dirs = [join(app.getAppPath(), 'assets/characters'), join(process.resourcesPath, 'characters')]
  for (const dir of dirs) {
    if (!existsSync(dir)) continue
    const vrm = readdirSync(dir).find((f) => f.toLowerCase().endsWith('.vrm'))
    if (vrm) return join(dir, vrm)
  }
  return null
}

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

async function pickModel(): Promise<void> {
  const result = await dialog.showOpenDialog({
    title: 'Load a VRM character',
    filters: [{ name: 'VRM model', extensions: ['vrm'] }],
    properties: ['openFile']
  })
  if (result.canceled || !result.filePaths[0] || !win) return
  const path = result.filePaths[0]
  win.webContents.send(IPC.loadModel, toArrayBuffer(readFileSync(path)), basename(path))
}

/** Draws a small teal dot as a placeholder tray icon (BGRA pixels). */
function makeTrayIcon(): Electron.NativeImage {
  const size = 32
  const buf = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - size / 2 + 0.5, y - size / 2 + 0.5)
      const i = (y * size + x) * 4
      const alpha = Math.max(0, Math.min(1, size / 2 - 1 - d))
      buf[i] = 0xb5 // B
      buf[i + 1] = 0xb8 // G
      buf[i + 2] = 0x1f // R
      buf[i + 3] = Math.round(alpha * 255)
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size })
}

function createTray(): void {
  tray = new Tray(makeTrayIcon())
  tray.setToolTip('Desktop Companion')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Summon', click: () => win?.webContents.send(IPC.summon) },
      { label: 'Talk (Ctrl+Shift+Space)', click: startListening },
      { label: 'Type (Ctrl+Shift+T)', click: openChat },
      { label: 'Settings…', click: openSettings },
      { label: 'Load VRM character…', click: () => void pickModel() },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ])
  )
  tray.on('click', () => win?.webContents.send(IPC.summon))
}

ipcMain.on(IPC.setClickThrough, (_e, passThrough: boolean) => {
  win?.setIgnoreMouseEvents(passThrough, { forward: true })
})

ipcMain.handle(IPC.getInitialModel, () => {
  const path = findDefaultModel()
  return path ? { data: toArrayBuffer(readFileSync(path)), name: basename(path) } : null
})

ipcMain.handle(IPC.chat, (_e, text: string) => chat(String(text).slice(0, 2000)))
ipcMain.handle(IPC.getSettings, () => getPublicSettings())
ipcMain.handle(IPC.saveSettings, (_e, next: Settings) => {
  const before = getSettings().personaId
  saveSettings(next)
  win?.webContents.send(IPC.settingsChanged)
  if (next.personaId !== before) win?.webContents.send(IPC.personaChanged, next.personaId)
})
ipcMain.handle(IPC.setApiKey, (_e, provider: ProviderId, key: string | null) => setApiKey(provider, key))
ipcMain.handle(IPC.clearMemory, () => clearHistory(getSettings().personaId))
ipcMain.on(IPC.openSettings, openSettings)

app.whenReady().then(() => {
  createWindow()
  createTray()
  globalShortcut.register(TALK_HOTKEY, startListening)
  globalShortcut.register(TYPE_HOTKEY, openChat)
  // Only our own pages may use the microphone, and nothing else.
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    callback(permission === 'media' && wc === win?.webContents)
  })
  session.defaultSession.setPermissionCheckHandler((wc, permission) => permission === 'media' && wc === win?.webContents)
  for (const evt of ['display-metrics-changed', 'display-added', 'display-removed'] as const) {
    screen.on(evt as 'display-added', () => {
      if (!win) return
      win.setBounds(screen.getPrimaryDisplay().bounds)
      sendLayout()
    })
  }
})

app.on('will-quit', () => globalShortcut.unregisterAll())
// The overlay is the app; closing the settings window shouldn't quit.
app.on('window-all-closed', () => app.quit())
