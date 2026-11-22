import * as THREE from 'three'
import type { Layout } from '@shared/layout'
import type { CompanionApi } from '@shared/ipc'
import type { Character } from './character'
import { blinkAmount, easeOutBack } from './idle'
import { createRobotico } from './robotico'
import { loadVrmCharacter } from './vrmCharacter'

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
const mouse = new THREE.Vector3(window.innerWidth / 2, window.innerHeight / 2, 400)

function characterScreenBox(): THREE.Box2 | null {
  if (!character) return null
  const box = new THREE.Box3().setFromObject(character.root)
  return new THREE.Box2(
    new THREE.Vector2(box.min.x, window.innerHeight - box.max.y),
    new THREE.Vector2(box.max.x, window.innerHeight - box.min.y)
  )
}

function setPassThrough(next: boolean): void {
  if (next === passThrough) return
  passThrough = next
  api?.setClickThrough(next)
}

window.addEventListener('mousemove', (e) => {
  mouse.set(e.clientX, window.innerHeight - e.clientY, 400)
  if (dragging && layout) {
    const min = layout.workArea.x + 40
    const max = layout.workArea.x + layout.workArea.width - 40
    anchorX = THREE.MathUtils.clamp(e.clientX - dragOffset, min, max)
    return
  }
  const box = characterScreenBox()
  setPassThrough(!(box && box.containsPoint(new THREE.Vector2(e.clientX, e.clientY))))
})

window.addEventListener('mousedown', (e) => {
  if (passThrough || e.button !== 0) return
  dragging = true
  dragOffset = e.clientX - anchorX
})
window.addEventListener('mouseup', () => {
  if (!dragging) return
  dragging = false
})
window.addEventListener('dblclick', () => {
  if (!passThrough) summon()
})

// --- Wiring to the main process ------------------------------------------
api?.onLayout((next) => {
  const first = layout === null
  layout = next
  if (first) anchorX = next.anchor.x
})
api?.onSummon(summon)
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
