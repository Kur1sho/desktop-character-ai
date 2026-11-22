import * as THREE from 'three'
import type { Layout } from '@shared/layout'
import type { CompanionApi } from '@shared/ipc'
import type { ChatReply } from '@shared/ipc'
import { getPersona, parseEmotion } from '@shared/personas'
import { DEFAULT_SETTINGS, modelFor, type Settings } from '@shared/settings'
import { think, warmUp } from './brain/brain'
import type { Character } from './character'
import { blinkAmount, easeOutBack } from './idle'
import { createChat } from './chat'
import { createRobotico } from './robotico'
import { loadVrmCharacter } from './vrmCharacter'
import { listen, type Listening } from './voice/listener'
import { speak, stopSpeaking } from './voice/speaker'
import { transcribe } from './voice/stt'

declare global {
  interface Window {
    companion?: CompanionApi
  }
}

/** How tall the character is on screen, in CSS pixels. */
const CHARACTER_PX = 260
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
scene.add(stage)

let character: Character | null = null
let settings: Settings = { ...DEFAULT_SETTINGS }

/** Sends a message to whichever AI is chosen. The built-in brain runs right here. */
async function ask(text: string): Promise<ChatReply> {
  if (!api) throw new Error('No app bridge')
  if (settings.provider !== 'builtin') return api.chat(text)
  const { system, history } = await api.chatPrepare(text)
  try {
    const raw = await think(modelFor(settings), [{ role: 'system', content: system }, ...history], (pct) =>
      chat.status(`Downloading my brain (one time only)… ${pct}%`)
    )
    await api.chatRecord(text, raw)
    return parseEmotion(raw)
  } catch (err) {
    return { emotion: 'sad', text: err instanceof Error ? err.message : String(err), error: true }
  }
}

const chat = createChat(
  api ? ask : null,
  (emotion) => character?.setEmotion(emotion),
  (text) => {
    if (settings.voiceOutput) {
      void speak(text, getPersona(settings.personaId).voice, (open) => character?.setMouth(open))
    }
  }
)

async function refreshSettings(): Promise<void> {
  if (!api) return
  settings = await api.getSettings()
  // Start fetching the built-in brain in the background so the first chat is quick.
  if (settings.provider === 'builtin') warmUp(modelFor(settings))
}

// --- Voice: press the hotkey, talk, and it stops when you go quiet ---------
let listening: Listening | null = null

async function startVoice(): Promise<void> {
  if (listening) {
    listening.cancel() // pressing again cancels
    return
  }
  stopSpeaking()
  summon()
  character?.setEmotion('neutral')
  chat.status('Listening…')
  listening = listen((_level, state) => {
    if (state === 'speaking') character?.setEmotion('happy')
  })
  try {
    const { audio, reason } = await listening.result
    listening = null
    if (reason === 'cancelled') return chat.hide()
    if (!audio) {
      character?.setEmotion('sad')
      return chat.say("I didn't hear anything.")
    }
    chat.status('…')
    const text = await transcribe(audio, settings.sttSize, (pct) =>
      chat.status(`Downloading my ears (one time only)… ${pct}%`)
    )
    if (!text || /^\[.*\]$/.test(text)) {
      character?.setEmotion('sad')
      return chat.say("Sorry, I didn't catch that.")
    }
    await chat.ask(text)
  } catch (err) {
    listening = null
    character?.setEmotion('sad')
    chat.say(err instanceof Error ? err.message : String(err), { error: true })
  }
}
let layout: Layout | null = null
let anchorX = 0
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
    stage.remove(character.root)
    character.dispose()
  }
  character = next
  const scale = CHARACTER_PX / next.height
  next.root.scale.setScalar(scale)
  stage.add(next.root)
  summon()
}

function summon(): void {
  popStart = clock.getElapsed()
  character?.wave()
}

function floorY(): number {
  // Window y runs top to bottom; the scene's y runs bottom to top.
  return layout ? window.innerHeight - layout.anchor.y : 0
}

// --- Mouse: hover, click-through and dragging ----------------------------
let passThrough = true
let dragging = false
let dragOffset = 0
let dragStartX = 0
let movedWhileDragging = false
const mouse = new THREE.Vector3(window.innerWidth / 2, window.innerHeight / 2, 400)

function characterScreenBox(): THREE.Box2 | null {
  if (!character) return null
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

window.addEventListener('mousemove', (e) => {
  mouse.set(e.clientX, window.innerHeight - e.clientY, 400)
  if (dragging && layout) {
    if (Math.abs(e.clientX - dragStartX) > 4) movedWhileDragging = true
    const min = layout.workArea.x + 40
    const max = layout.workArea.x + layout.workArea.width - 40
    anchorX = THREE.MathUtils.clamp(e.clientX - dragOffset, min, max)
    return
  }
  const box = characterScreenBox()
  const overCharacter = Boolean(box && box.containsPoint(new THREE.Vector2(e.clientX, e.clientY)))
  setPassThrough(!(overCharacter || overChat(e.clientX, e.clientY)))
})

window.addEventListener('mousedown', (e) => {
  if (passThrough || e.button !== 0 || overChat(e.clientX, e.clientY)) return
  dragging = true
  movedWhileDragging = false
  dragStartX = e.clientX
  dragOffset = e.clientX - anchorX
})
window.addEventListener('mouseup', () => {
  if (!dragging) return
  dragging = false
})
// Single click on the character opens the text box; double click waves.
window.addEventListener('click', (e) => {
  if (passThrough || overChat(e.clientX, e.clientY) || movedWhileDragging) return
  openChat()
})
window.addEventListener('dblclick', (e) => {
  if (!passThrough && !overChat(e.clientX, e.clientY)) summon()
})

function openChat(): void {
  setPassThrough(false)
  chat.openInput()
}

// --- Wiring to the main process ------------------------------------------
api?.onLayout((next) => {
  const first = layout === null
  layout = next
  if (first) anchorX = next.anchor.x
})
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
  anchorX = layout.anchor.x
}

// --- Frame loop ----------------------------------------------------------
renderer.setAnimationLoop(() => {
  clock.update()
  const dt = Math.min(clock.getDelta(), 0.1)
  const t = clock.getElapsed()
  const floor = floorY()

  // Pop up out of the taskbar: rise from below the floor with a little overshoot,
  // and clip anything below the floor so it looks like it comes out of the bar.
  let rise = 0
  let clipping = false
  if (popStart >= 0) {
    const p = (t - popStart) / POP_SECONDS
    if (p < 1) {
      rise = (1 - easeOutBack(p)) * -CHARACTER_PX
      clipping = true
    } else {
      popStart = -1
    }
  }
  stage.position.set(anchorX, floor + rise, 0)

  if (character) {
    // Keep the speech bubble just above the character's head.
    const top = floor + rise + CHARACTER_PX + 12
    chat.place(anchorX, window.innerHeight - top)
    character.lookAt(mouse)
    character.setBlink(blinkAmount(t))
    character.update(dt, t)
  }

  if (clipping) {
    renderer.setScissorTest(true)
    renderer.setScissor(0, floor, window.innerWidth, window.innerHeight - floor)
  }
  renderer.render(scene, camera)
  if (clipping) renderer.setScissorTest(false)
})

void start()
