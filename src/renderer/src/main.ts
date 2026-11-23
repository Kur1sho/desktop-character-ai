import * as THREE from 'three'
import type { Layout } from '@shared/layout'
import type { CompanionApi } from '@shared/ipc'
import type { AskOptions, ChatReply } from '@shared/ipc'
import { EMOTIONS, getPersona, parseEmotion, type Emotion } from '@shared/personas'
import { shortenReply } from '@shared/brevity'
import { characterScale, DEFAULT_SETTINGS, modelFor, type Settings } from '@shared/settings'
import { think, warmUp } from './brain/brain'
import { maxTokensFor } from '@shared/brainModels'
import type { Character } from './character'
import { blinkAmount, easeOutBack } from './idle'
import { createChat } from './chat'
import { createActions } from './actions'
import { createLife } from './life'
import { describeCancelled, describeList, parseReminderQuery, pickToCancel } from '@shared/reminders'
import { createGameSession, judgePrompt, parseWindowGame, readJudgement } from '@shared/games'
import { gameLine } from '@shared/gameLines'
import { screenRequest } from '@shared/screen'
import { listenToMusic, type MusicListener } from './dance/music'
import { approachAngle, Choreographer, MoodTracker, type Mood, type Pose } from './dance/choreo'
import { parseDanceCommand, parseIntents } from '@shared/actions'
import { createRobotico } from './robotico'
import { loadVrmCharacter } from './vrmCharacter'
import { listen, type Listening } from './voice/listener'
import { speak, stopSpeaking } from './voice/speaker'
import { preloadStt, transcribe } from './voice/stt'
import { matchWakeWord } from './voice/wakeMatch'
import { startWake, stopWake } from './voice/wake'

declare global {
  interface Window {
    companion?: CompanionApi
  }
}

/** How tall the character is on screen at normal size, in CSS pixels. */
const BASE_PX = 260
/** How tall it is now (the size slider and mini mode change it). */
let px = BASE_PX
const POP_SECONDS = 0.7

const api = window.companion

// --- Scene ---------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: true })
renderer.setClearColor(0x000000, 0)
renderer.setPixelRatio(window.devicePixelRatio)
document.body.appendChild(renderer.domElement)

const scene = new THREE.Scene()
// An orthographic camera in pixel units: x right, y up, origin bottom left.
const camera = new THREE.OrthographicCamera(0, 1, 1, 0, -5000, 5000)
camera.position.z = 1000

scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.6))
const sun = new THREE.DirectionalLight(0xffffff, 2.2)
sun.position.set(-300, 800, 1000)
scene.add(sun)

// The stage holds the character and is positioned at the anchor point.
const stage = new THREE.Group()
/** Swings the character round the point it's held by (when picked up with the mouse). */
const hang = new THREE.Group()
hang.position.y = BASE_PX / 2
stage.add(hang)
const hangInner = new THREE.Group()
hangInner.position.y = -BASE_PX / 2
hang.add(hangInner)
/** Moves the character around when dancing (in pixels from its spot). */
const dancer = new THREE.Group()
hangInner.add(dancer)
/** Turns the character around its middle, for flips and spins. */
const pivot = new THREE.Group()
pivot.position.y = BASE_PX / 2
dancer.add(pivot)
/** Puts the character's feet back at the bottom, under the pivot. */
const body = new THREE.Group()
body.position.y = -BASE_PX / 2
pivot.add(body)
scene.add(stage)

/** Changes the character's size on screen. */
function applySize(next: number): void {
  if (next === px) return
  px = next
  pivot.position.y = px / 2
  body.position.y = -px / 2
  if (character) character.root.scale.setScalar(px / character.height)
}

let character: Character | null = null
/** Shows an emotion; "neutral" means the character's resting face (a smile for cheerful Robotico). */
function feel(e: Emotion): void {
  character?.setEmotion(e === 'neutral' ? (getPersona(settings.personaId).resting ?? 'neutral') : e)
}
let settings: Settings = { ...DEFAULT_SETTINGS }

/**
 * Which engine runs the built-in brain: 'native' is llama.cpp in its own process
 * (bigger, faster brains); 'web' is the in-window fallback for PCs where llama.cpp can't run.
 */
let brainMode: 'native' | 'web' | null = null
let brainProgress: ((pct: number) => void) | null = null
api?.onBrainProgress((pct) => brainProgress?.(pct))

/** Downloads (first time only) and loads the built-in brain. */
async function warmBrain(onProgress?: (pct: number) => void): Promise<void> {
  if (!api) return
  brainProgress = onProgress ?? null
  try {
    const r = await api.brainWarmUp()
    brainMode = r.mode
    if (r.mode === 'web') return warmUp(modelFor(settings), onProgress)
    if (r.error) throw new Error(r.error)
  } finally {
    brainProgress = null
  }
}

/** Sends a message to whichever AI is chosen. */
async function ask(text: string, opts?: AskOptions): Promise<ChatReply> {
  if (!api) throw new Error('No app bridge')
  if (!opts?.oneOff) void life.stat('chats')
  if (settings.provider !== 'builtin') return api.chat(text, opts)
  if (brainMode === null) {
    try {
      await warmBrain((pct) => chat.status(`Downloading my brain (one time only)… ${pct}%`))
    } catch (err) {
      return { emotion: 'sad', text: err instanceof Error ? err.message : String(err), error: true }
    }
  }
  // llama.cpp runs in the main process side, which also keeps the history.
  if (brainMode === 'native') return api.chat(text, opts)
  const { system, history } = await api.chatPrepare(text, opts)
  try {
    const raw = await think(
      modelFor(settings),
      [{ role: 'system', content: system }, ...history],
      (pct) => chat.status(`Downloading my brain (one time only)… ${pct}%`),
      maxTokensFor(text)
    )
    const short = shortenReply(raw, text)
    if (!opts?.oneOff) await api.chatRecord(text, short)
    return parseEmotion(short)
  } catch (err) {
    return { emotion: 'sad', text: err instanceof Error ? err.message : String(err), error: true }
  }
}

/** Says a line out loud if voice output is on. */
function sayAloud(text: string): Promise<void> {
  if (!settings.voiceOutput) return Promise.resolve()
  speaking = true
  return speak(text, getPersona(settings.personaId).voice, (open) => character?.setMouth(open)).finally(() => {
    // A short grace period so the wake word doesn't hear the tail of our own voice.
    setTimeout(() => (speaking = false), 600)
  })
}

const games = createGameSession(
  () => ({
    personaId: settings.personaId,
    rng: Math.random,
    // Twenty questions: the brain answers yes or no about the secret.
    judge: async (secret, question) => {
      const r = await ask(judgePrompt(secret, question), { oneOff: true })
      if (r.error) return null
      const answer = readJudgement(r.text)
      return answer ? { answer, text: r.text } : null
    }
  }),
  (text) => parseIntents(text) !== null || screenRequest(text) || parseReminderQuery(text) !== null
)

const chat = createChat(
  api ? ask : null,
  (emotion) => feel(emotion),
  (text) => {
    // In a game, after asking out loud, listen for the answer straight away (no "Hey <name>" needed).
    const listenAfter = spokenRequest && games.active()
    void sayAloud(text).then(() => {
      if (listenAfter && games.active() && !listening && !chat.isThinking()) void startVoice()
    })
  },
  (list, source, intro) => (actions ? actions.run(list, source, intro) : Promise.resolve()),
  (text) => {
    const cmd = parseDanceCommand(text)
    if (!cmd) return false
    if (cmd === 'start') void startDancing()
    else stopDancing(true)
    return true
  },
  api ? () => api.readClipboard() : undefined,
  (line) => api?.logConversation(line),
  api ? (text) => api.lookAtScreen(text) : null,
  api
    ? async (q) => {
        const list = await api.listReminders()
        const now = new Date()
        if (q.op === 'list') return describeList(list, q.kind, now)
        const gone = await api.cancelReminders(pickToCancel(list, q).map((r) => r.id))
        return describeCancelled(gone, q.kind, now)
      }
    : null,
  api
    ? async (text) => {
        // Board and card games (and the quick ones, with visuals) open in the game window.
        const windowGame = parseWindowGame(text)
        if (windowGame !== null) {
          api.openGames(windowGame)
          const line = gameLine(settings.personaId, 'start')
          return { say: windowGame ? line.text : "Pick a game. I'll wait. Impatiently.", emotion: line.emotion }
        }
        return games.handle(text)
      }
    : null
)
// What the character says about the game in the game window.
api?.onGameSay((text, emotion) => {
  summon()
  feel(EMOTIONS.includes(emotion as Emotion) ? (emotion as Emotion) : 'neutral')
  chat.say(text)
  void sayAloud(text)
})
// "Downloading my eyes… 40%", "Looking…"
api?.onVisionStatus((text) => chat.status(text))
let speaking = false
let thinking = false
/** The request being handled was spoken, so the character can ask "yes or no?" out loud. */
let spokenRequest = false

/** Listens for one short answer, like "yes" or "no". */
function hear(): { result: Promise<string | null>; cancel(): void } | null {
  if (listening) return null
  const l = listen(undefined, null, { endSilenceMs: 700, noSpeechTimeoutMs: 6000, maxMs: 5000 })
  listening = l
  const result = l.result
    .then(({ audio }) => (audio ? transcribe(audio, settings.sttSize) : null))
    .catch(() => null)
    .finally(() => {
      if (listening === l) listening = null
    })
  return { result, cancel: () => l.cancel() }
}

const actions = api
  ? createActions({
      api,
      chat,
      settings: () => settings,
      persona: () => getPersona(settings.personaId),
      setEmotion: (e) => feel(e),
      speak: sayAloud,
      summon: () => summon(),
      hear,
      spokenRequest: () => spokenRequest
    })
  : null
// Timers, reminders and alarms are kept by the main process; it tells us when one is due.
api?.onReminderDue((r, late) => actions?.due(r, late))

let greeted = false
async function refreshSettings(): Promise<void> {
  if (!api) return
  settings = await api.getSettings()
  applySize(Math.round(BASE_PX * characterScale(settings)))
  life.settingsChanged()
  if (settings.setupDone && !greeted) {
    greeted = true
    void life.greet()
  }
  // Load everything now (the speech models and the built-in brain), so the
  // first "Hey ..." is as quick as every one after it.
  const progress: number[] = []
  const track = (job: (onProgress: (pct: number) => void) => Promise<void>) => {
    const i = progress.push(0) - 1
    const report = (pct: number) => {
      progress[i] = pct
      if (setupRunning && !listening && !thinking) {
        const avg = Math.round(progress.reduce((a, b) => a + b, 0) / progress.length)
        chat.status(`Getting ready (one time only)… ${avg}%`)
      }
    }
    return job(report).then(() => report(100))
  }
  const jobs = [track((p) => preloadStt(settings.sttSize, 'command', p))]
  if (settings.wakeWord) jobs.push(track((p) => preloadStt('tiny', 'wake', p)))
  if (settings.provider === 'builtin') jobs.push(track((p) => warmBrain(p)))
  if (!settings.setupDone) void runSetup(jobs)
  else for (const j of jobs) j.catch((err: Error) => console.error('Preload failed:', err.message))

  if (settings.wakeWord) {
    void startWake({
      name: () => getPersona(settings.personaId).name,
      // Only ignored while already listening: "Hey <name>" interrupts talking, thinking and questions.
      isBusy: () => listening !== null || setupRunning,
      requireGreeting: () => speaking,
      onWake: (rest, audio) => {
        interrupt()
        if (!audio && rest.split(' ').length >= 2) {
          // "Hey Robotico, how are you?" - the question came with the name.
          api?.logConversation(`Heard (wake word): "${rest}"`)
          summon()
          thinking = true
          spokenRequest = true
          void chat.ask(rest).finally(() => {
            thinking = false
            spokenRequest = false
          })
        } else {
          // Start listening straight away, keeping what was already said.
          void startVoice(audio)
        }
      },
      onError: (err) => console.error('Wake word:', err.message)
    })
  } else {
    stopWake()
  }
}

// --- First-time setup: download and prepare the local models up front -----
let setupRunning = false

async function runSetup(jobs: Promise<void>[]): Promise<void> {
  if (setupRunning || !api) return
  setupRunning = true
  summon()
  feel('happy')
  chat.status('Getting ready (one time only)… 0%')
  const results = await Promise.allSettled(jobs)
  setupRunning = false
  const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (failed) {
    // Not marked as done, so it tries again next launch.
    feel('sad')
    chat.say(failed.reason instanceof Error ? failed.reason.message : String(failed.reason), { error: true })
    return
  }
  const name = getPersona(settings.personaId).name
  await api.saveSettings({ ...settings, setupDone: true })
  chat.say(
    settings.wakeWord
      ? `All set! Just say "Hey ${name}" whenever you need me.`
      : 'All set! Press Ctrl+Shift+Space to talk to me.'
  )
}

// --- Dancing to whatever the PC is playing -----------------------------------
let music: MusicListener | null = null
const moodTracker = new MoodTracker()
const choreographer = new Choreographer()
let lastMood: Mood | null = null
let danceStartedAt = 0

async function startDancing(): Promise<void> {
  if (music) return
  summon()
  const lines = getPersona(settings.personaId).lines
  try {
    music = await listenToMusic()
  } catch (err) {
    console.error('Music listening failed:', err)
    feel('sad')
    const why = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    chat.say(`I can't hear your PC's sound right now. (${why})`, { error: true })
    return
  }
  danceStartedAt = performance.now()
  void life.stat('dances')
  feel('happy')
  chat.say(lines.danceStart)
  void sayAloud(lines.danceStart)
}

function stopDancing(announce: boolean, line?: string): void {
  if (!music) return
  music.stop()
  music = null
  dancer.position.set(0, 0, 0)
  pivot.rotation.set(0, 0, 0)
  character?.dance(null)
  life.dance(null)
  if (announce) {
    const text = line ?? getPersona(settings.personaId).lines.danceStop
    chat.say(text)
    void sayAloud(text)
  }
}

/** One frame of dancing: reads the music, picks moves to match its mood and moves the character. */
function danceFrame(): void {
  if (!music || !character) return
  const now = performance.now()
  const s = music.read(now)
  // Stop by itself when the music stops (or never started).
  if (now - danceStartedAt > 4000 && s.silentForMs > 5000) {
    const lines = getPersona(settings.personaId).lines
    stopDancing(true, s.bpm ? lines.danceStop : lines.noMusic)
    return
  }
  const mood = moodTracker.push(now, s.hit, s.bpm, s.centroid)
  if (mood !== lastMood) {
    lastMood = mood
    feel(mood === 'hype' ? 'happy' : mood === 'chill' ? 'sleepy' : 'neutral')
  }
  let target: Pose
  if (!s.bpm) {
    // Still working out the beat: a gentle sway so it's clearly listening.
    target = { x: 0, y: 0, rotX: 0, rotY: 0, rotZ: Math.sin(now / 400) * 0.04, arms: 'low' }
  } else {
    target = choreographer.pose(s.count + s.phase, mood, px, s.intensity)
  }
  // Ease toward the pose (angles the short way round), so moves blend into each other.
  const k = 0.35
  dancer.position.x += (target.x - dancer.position.x) * k
  dancer.position.y += (target.y - dancer.position.y) * k
  pivot.rotation.x = approachAngle(pivot.rotation.x, target.rotX, k)
  pivot.rotation.y = approachAngle(pivot.rotation.y, target.rotY, k)
  pivot.rotation.z = approachAngle(pivot.rotation.z, target.rotZ, k)
  const move = { phase: s.phase, count: s.count, intensity: s.intensity, arms: target.arms }
  character.dance(move)
  life.dance(move)
}

/** Stops talking and drops anything in progress, so a new request starts cleanly. */
function interrupt(): void {
  stopSpeaking()
  speaking = false
  chat.cancel()
  thinking = false
}

// --- Voice: press the hotkey, talk, and it stops when you go quiet ---------
let listening: Listening | null = null

async function startVoice(preRoll: Float32Array | null = null): Promise<void> {
  if (listening) {
    listening.cancel() // pressing again cancels
    return
  }
  interrupt()
  summon()
  feel('neutral')
  chat.status('Listening…')
  let lastBars = -1
  listening = listen((level, state, threshold) => {
    if (state === 'speaking') feel('happy')
    // A little level meter so it's obvious the mic is hearing you.
    const bars = Math.min(5, Math.round((level / threshold) * 1.5))
    if (bars !== lastBars) {
      lastBars = bars
      chat.status(`Listening… ${'▮'.repeat(bars)}${'▯'.repeat(5 - bars)}`)
    }
  }, preRoll)
  try {
    const { audio, reason } = await listening.result
    listening = null
    if (reason === 'cancelled') return chat.hide()
    if (!audio) {
      feel('sad')
      return chat.say("I didn't hear anything. Is the right microphone set as default in Windows sound settings?")
    }
    chat.status('…')
    const heard = await transcribe(audio, settings.sttSize, (pct) =>
      chat.status(`Downloading my ears (one time only)… ${pct}%`)
    )
    // If this started from the wake word, drop the "Hey <name>" part.
    const wake = preRoll ? matchWakeWord(heard, getPersona(settings.personaId).name) : null
    const text = wake?.matched && wake.rest ? wake.rest : heard
    api?.logConversation(`Heard (voice): "${heard}"${text !== heard ? ` -> using "${text}"` : ''}`)
    if (!text || /^\[.*\]$/.test(text)) {
      feel('sad')
      return chat.say("Sorry, I didn't catch that.")
    }
    thinking = true
    spokenRequest = true
    await chat.ask(text).finally(() => {
      thinking = false
      spokenRequest = false
    })
  } catch (err) {
    listening = null
    feel('sad')
    chat.say(err instanceof Error ? err.message : String(err), { error: true })
  }
}
let layout: Layout | null = null
let popStart = -1
const clock = new THREE.Timer()

function resize(): void {
  const w = window.innerWidth
  const h = window.innerHeight
  renderer.setSize(w, h)
  camera.left = 0
  camera.right = w
  camera.top = h
  camera.bottom = 0
  camera.updateProjectionMatrix()
}
window.addEventListener('resize', resize)
resize()

function setCharacter(next: Character): void {
  if (character) {
    body.remove(character.root)
    character.dispose()
  }
  character = next
  feel('neutral')
  next.root.scale.setScalar(px / next.height)
  body.add(next.root)
  life.characterChanged()
  summon()
}

function summon(): void {
  life.summoned()
  popStart = clock.getElapsed()
  character?.wave()
}

// --- Mouse: hover, click-through, pats, pokes and picking up ----------------
let passThrough = true
const mouse = new THREE.Vector3(window.innerWidth / 2, window.innerHeight / 2, 400)

function characterScreenBox(): THREE.Box2 | null {
  if (!character || !stage.visible) return null
  const box = new THREE.Box3().setFromObject(character.root)
  return new THREE.Box2(
    new THREE.Vector2(box.min.x, window.innerHeight - box.max.y),
    new THREE.Vector2(box.max.x, window.innerHeight - box.min.y)
  )
}

function overChat(x: number, y: number): boolean {
  if (!chat.isActive()) return false
  const r = chat.el.getBoundingClientRect()
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
}

function setPassThrough(next: boolean): void {
  if (next === passThrough) return
  passThrough = next
  api?.setClickThrough(next)
}

const life = createLife({
  api: api ?? null,
  scene,
  groups: { hang, hangInner, pivot, body },
  character: () => character,
  settings: () => settings,
  px: () => px,
  busy: () => chat.isEngaged() || listening !== null || thinking || setupRunning,
  bubbleShowing: () => chat.isActive() || speaking,
  dancing: () => music !== null,
  say: (text, emotion) => {
    feel(emotion)
    chat.say(text)
    return sayAloud(text)
  },
  feel: (e) => feel(e),
  hideChat: () => {
    chat.hide()
    chat.closeInput()
  },
  summon: () => summon(),
  setPassThrough,
  overChat,
  screenBox: characterScreenBox
})

// For trying the routines out from the developer tools: __companionLife.tryRoutine('peek')
;(window as unknown as { __companionLife: unknown }).__companionLife = { tryRoutine: life.tryRoutine }

window.addEventListener('mousemove', (e) => {
  mouse.set(e.clientX, window.innerHeight - e.clientY, 400)
  life.mouseMove(e)
})
window.addEventListener('mousedown', (e) => {
  if (!passThrough) life.mouseDown(e)
})
window.addEventListener('mouseup', () => life.mouseUp())
// Single click on the character opens the text box, double click waves, and lots of clicks are poking.
window.addEventListener('click', (e) => {
  if (passThrough) return
  if (!life.click(e)) openChat()
})
window.addEventListener('dblclick', (e) => {
  if (!passThrough && life.dblclick(e)) summon()
})

function openChat(): void {
  setPassThrough(false)
  chat.openInput()
}

// --- Wiring to the main process ------------------------------------------
api?.onLayout((next) => {
  layout = next
  life.layoutChanged(next)
})
// Whether you're at the PC (so it can nap while you're away) and any Steam game running.
api?.onPresence((p) => life.presenceChanged(p))
api?.onSummon(summon)
api?.onOpenChat(() => {
  summon()
  openChat()
})
api?.onListen(() => void startVoice())
api?.onPersonaChanged(async () => {
  await refreshSettings()
  chat.say('…Hello? I feel different.')
})
api?.onSettingsChanged(() => void refreshSettings())
void refreshSettings()
api?.onLoadModel(async (data, name) => {
  try {
    setCharacter(await loadVrmCharacter(data))
  } catch (err) {
    console.error(`Could not load ${name}:`, err)
  }
})

async function start(): Promise<void> {
  const initial = await api?.getInitialModel().catch(() => null)
  if (initial) {
    try {
      setCharacter(await loadVrmCharacter(initial.data))
      return
    } catch (err) {
      console.error(`Could not load ${initial.name}, using Robotico instead:`, err)
    }
  }
  setCharacter(createRobotico())
}

// Without the Electron bridge (opened in a normal browser), stand on the bottom edge.
if (!api) {
  layout = {
    edge: 'none',
    anchor: { x: Math.round(window.innerWidth * 0.5), y: window.innerHeight - 20 },
    workArea: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight - 20 }
  }
  life.layoutChanged(layout)
}

// --- Frame loop ----------------------------------------------------------
renderer.setAnimationLoop(() => {
  clock.update()
  const dt = Math.min(clock.getDelta(), 0.1)
  const t = clock.getElapsed()
  const spot = life.frame(dt, t)

  // Pop up out of the taskbar: rise from below the floor with a little overshoot,
  // and clip anything below the floor so it looks like it comes out of the bar.
  // (Sitting on a window, it just waves.)
  let rise = 0
  let clipping = false
  if (popStart >= 0) {
    const p = (t - popStart) / POP_SECONDS
    if (p < 1 && spot.onFloor) {
      rise = (1 - easeOutBack(p)) * -px
      clipping = true
    } else if (p >= 1) {
      popStart = -1
    }
  }
  const floor = spot.y
  stage.position.set(spot.x, spot.y + rise, 0)
  stage.visible = !life.hidden

  if (character) {
    // Keep the speech bubble just above the character's head.
    const top = spot.y + rise + px + 12
    // (kept on screen when it's right by the edge)
    chat.place(THREE.MathUtils.clamp(spot.x, 150, window.innerWidth - 150), Math.max(70, window.innerHeight - top))
    character.lookAt(life.lookTarget(mouse))
    character.setBlink(life.asleep ? 1 : blinkAmount(t))
    character.setActivity?.(
      music ? 'dancing' : listening ? 'listening' : chat.isThinking() ? 'thinking' : life.asleep ? 'sleeping' : 'idle'
    )
    character.update(dt, t)
    danceFrame()
  }

  if (clipping) {
    renderer.setScissorTest(true)
    renderer.setScissor(0, floor, window.innerWidth, window.innerHeight - floor)
  }
  renderer.render(scene, camera)
  if (clipping) renderer.setScissorTest(false)
})

void start()
