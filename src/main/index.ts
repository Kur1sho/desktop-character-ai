import {
  app,
  BrowserWindow,
  clipboard,
  desktopCapturer,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  powerMonitor,
  screen,
  session,
  shell,
  Tray,
  webContents
} from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { computeLayout } from '../shared/layout'
import { IPC } from '../shared/ipc'
import type { ProviderId, Settings } from '../shared/settings'
import { activityLogPath, runAction } from './actions/runner'
import { conversationLogPath, logConversation } from './conversationLog'
import { chat, clearHistory, lookAtScreen, prepare, record } from './ai/conversation'
import { stopVision } from './brain/vision'
import { cancelReminders, checkReminders, listReminders, startReminders } from './reminders'
import { clockTime, type Reminder } from '../shared/reminders'
import { getPersona } from '../shared/personas'
import { getPublicSettings, getSettings, saveSettings, setApiKey } from './settingsStore'
import { nativeBrainAvailable, stopNativeBrain, warmUpNativeBrain } from './brain/nativeBrain'

let win: BrowserWindow | null = null
let tray: Tray | null = null
let settingsWin: BrowserWindow | null = null
let welcomeWin: BrowserWindow | null = null
let gamesWin: BrowserWindow | null = null

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
  win.webContents.on('did-finish-load', () => {
    sendLayout()
    // Reminders go off in the companion window (it speaks them), so start once it's there.
    startReminders(showReminder)
  })
  win.on('closed', () => (win = null))
}

/** A reminder is due: the character says it, and Windows shows a notification too (in case a game is full screen). */
function showReminder(r: Reminder, late: boolean): void {
  win?.webContents.send(IPC.reminderDue, r, late)
  if (!Notification.isSupported()) return
  const title = r.kind === 'timer' && !r.label ? "Time's up" : r.kind === 'alarm' ? 'Alarm' : 'Reminder'
  const body = r.label ? r.label[0].toUpperCase() + r.label.slice(1) : r.kind === 'alarm' ? `It's ${clockTime(r.at)}.` : 'Your timer is done.'
  new Notification({ title: `${getPersona(getSettings().personaId).name}: ${title}`, body, silent: true }).show()
}

function loadPage(target: BrowserWindow, page: string): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  const [file, hash] = page.split('#')
  if (devUrl) void target.loadURL(`${devUrl}/${page}`)
  else void target.loadFile(join(__dirname, '../renderer', file), hash ? { hash } : undefined)
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

const GAME_IDS = ['chess', 'checkers', 'poker', 'blackjack', 'rps', 'trivia', 'number']

/** The game window: chess, checkers, poker, blackjack and quick games, with the character talking. */
function openGames(game: string): void {
  const id = GAME_IDS.includes(game) ? game : ''
  if (gamesWin) {
    gamesWin.webContents.send(IPC.openGame, id)
    if (gamesWin.isMinimized()) gamesWin.restore()
    gamesWin.focus()
    return
  }
  gamesWin = new BrowserWindow({
    width: 1080,
    height: 780,
    minWidth: 760,
    minHeight: 600,
    title: 'Games',
    backgroundColor: '#14181d',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  loadPage(gamesWin, id ? `games.html#${id}` : 'games.html')
  gamesWin.on('closed', () => (gamesWin = null))
}

/** The welcome screen: one-click account connections and the "don't keep asking" switch. */
function openWelcome(): void {
  if (welcomeWin) {
    welcomeWin.focus()
    return
  }
  welcomeWin = new BrowserWindow({
    width: 620,
    height: 700,
    title: 'Welcome',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  loadPage(welcomeWin, 'welcome.html')
  welcomeWin.on('closed', () => (welcomeWin = null))
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
      { label: 'Play a game', click: () => openGames('') },
      { label: 'Talk (Ctrl+Shift+Space)', click: startListening },
      { label: 'Type (Ctrl+Shift+T)', click: openChat },
      { label: 'Connections…', click: openWelcome },
      { label: 'Settings…', click: openSettings },
      { label: 'What I heard (conversation log)', click: () => openLog(conversationLogPath()) },
      { label: 'Activity log', click: openActivityLog },
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

ipcMain.handle(IPC.chat, (_e, text: string, opts?: { oneOff?: unknown }) =>
  chat(String(text).slice(0, 3000), opts?.oneOff === true)
)
ipcMain.handle(IPC.chatPrepare, (_e, text: string, opts?: { oneOff?: unknown }) =>
  prepare(String(text).slice(0, 3000), opts?.oneOff === true)
)
ipcMain.handle(IPC.chatRecord, (_e, userText: string, reply: string) => record(String(userText), String(reply)))
ipcMain.handle(IPC.getSettings, () => getPublicSettings())
ipcMain.handle(IPC.saveSettings, (_e, next: Settings) => {
  const before = getSettings().personaId
  saveSettings(next)
  win?.webContents.send(IPC.settingsChanged)
  if (next.personaId !== before) win?.webContents.send(IPC.personaChanged, next.personaId)
})
ipcMain.handle(IPC.setApiKey, (_e, provider: ProviderId, key: string | null) => setApiKey(provider, key))
ipcMain.handle(IPC.clearMemory, () => clearHistory(getSettings().personaId))
ipcMain.handle(IPC.readClipboard, async () => String(await clipboard.readText()).slice(0, 4000))
ipcMain.handle(IPC.runAction, (_e, action: unknown, source: unknown) => runAction(action, source === 'ai' ? 'ai' : 'user'))
ipcMain.on(IPC.openActivityLog, () => openActivityLog())
ipcMain.handle(IPC.lookAtScreen, (_e, text: unknown) => {
  const question = String(text).slice(0, 1000)
  logConversation('  -> looked at the screen (the picture is not saved)')
  return lookAtScreen(question, (status) => win?.webContents.send(IPC.visionStatus, status))
})
ipcMain.handle(IPC.brainWarmUp, async () => {
  if (!(await nativeBrainAvailable())) return { mode: 'web' }
  try {
    await warmUpNativeBrain((pct) => win?.webContents.send(IPC.brainProgress, pct))
    return { mode: 'native' }
  } catch (err) {
    return { mode: 'native', error: err instanceof Error ? err.message : String(err) }
  }
})
ipcMain.handle(IPC.listReminders, () => listReminders())
ipcMain.handle(IPC.cancelReminders, (_e, ids: unknown) =>
  cancelReminders(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [])
)
ipcMain.on(IPC.logConversation, (_e, line: unknown) => logConversation(String(line)))
ipcMain.on(IPC.openConversationLog, () => openLog(conversationLogPath()))

/** Opens the plain-text log of every action, so the user can see exactly what happened. */
function openActivityLog(): void {
  openLog(activityLogPath())
}

function openLog(file: string): void {
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, '')
  }
  void shell.openPath(file)
}
ipcMain.on(IPC.openSettings, openSettings)
ipcMain.on(IPC.openGames, (_e, game: unknown) => openGames(String(game ?? '')))
// Lines from the game window are said by the character on the desktop (only text, never actions).
ipcMain.on(IPC.gameSay, (e, text: unknown, emotion: unknown) => {
  if (!gamesWin || e.sender.id !== gamesWin.webContents.id) return
  win?.webContents.send(IPC.gameSay, String(text).slice(0, 300), String(emotion))
})

app.whenReady().then(() => {
  createWindow()
  createTray()
  // First launch (or never seen it): show the one-click connections screen.
  if (!getSettings().autoApproveAsked) openWelcome()
  globalShortcut.register(TALK_HOTKEY, startListening)
  globalShortcut.register(TYPE_HOTKEY, openChat)
  // Only our own pages may use the microphone, and nothing else.
  // The microphone, and the PC's sound for dancing ('display-capture'), are
  // allowed for the companion window only.
  const allowed = (permission: string) => permission === 'media' || permission === 'display-capture'
  const isCompanion = (wc: Electron.WebContents | null) => Boolean(wc && win && wc.id === win.webContents.id)
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    callback(allowed(permission) && isCompanion(wc))
  })
  session.defaultSession.setPermissionCheckHandler((wc, permission) => allowed(permission) && isCompanion(wc))
  // Dancing: give the companion window the PC's sound (Windows loopback), with
  // no picker. Only that window may ask; the screen video it comes with is
  // dropped by the window straight away.
  session.defaultSession.setDisplayMediaRequestHandler(
    (request, callback) => {
      const from = request.frame ? webContents.fromFrame(request.frame) : null
      if (!isCompanion(from ?? null) || process.platform !== 'win32') {
        console.warn('Sound capture refused:', process.platform, from?.getURL())
        return callback({})
      }
      desktopCapturer
        .getSources({ types: ['screen'] })
        .then((sources) => callback(sources[0] ? { video: sources[0], audio: 'loopback' } : {}))
        .catch((err) => {
          console.error('Sound capture failed:', err)
          callback({})
        })
    },
    { useSystemPicker: false }
  )
  // A PC waking from sleep checks for reminders that came due meanwhile.
  powerMonitor.on('resume', checkReminders)
  powerMonitor.on('unlock-screen', checkReminders)
  for (const evt of ['display-metrics-changed', 'display-added', 'display-removed'] as const) {
    screen.on(evt as 'display-added', () => {
      if (!win) return
      win.setBounds(screen.getPrimaryDisplay().bounds)
      sendLayout()
    })
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  stopNativeBrain()
  stopVision()
})
// The overlay is the app; closing the settings window shouldn't quit.
app.on('window-all-closed', () => app.quit())
