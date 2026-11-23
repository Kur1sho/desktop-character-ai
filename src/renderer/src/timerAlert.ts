// When a timer runs out: Robotico's head pops into the top right corner with its
// screen gone red and a yellow warning sign flashing, says "Timer over!" and beeps
// like an alarm until you click it (or it gives up after a while).
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { Look } from '@shared/cosmetics'

const W = 120
const H = 80
/** Head width on screen, in pixels. */
const HEAD_PX = 190
const BEEP_EVERY_MS = 3000
const GIVE_UP_MS = 45_000

export interface TimerAlert {
  show(text: string, look: Look | null): void
  dismiss(): void
  readonly showing: boolean
  /** Over the head or its bubble (so clicks go to it). */
  hit(x: number, y: number): boolean
  frame(t: number): void
}

/** Draws the alarm face: red screen, yellow warning triangle with a "!" that flashes. */
export function drawAlarmFace(ctx: CanvasRenderingContext2D, t: number): void {
  const on = Math.floor(t * 2.5) % 2 === 0
  ctx.fillStyle = on ? '#d0191b' : '#8e0d10'
  ctx.fillRect(0, 0, W, H)
  // Scanlines, like the normal face's LEDs.
  ctx.fillStyle = 'rgba(0,0,0,0.12)'
  for (let y = 0; y < H; y += 2) ctx.fillRect(0, y, W, 1)
  if (!on) return
  const cx = W / 2
  ctx.fillStyle = '#ffd400'
  ctx.beginPath()
  ctx.moveTo(cx, 10)
  ctx.lineTo(cx + 34, 70)
  ctx.lineTo(cx - 34, 70)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#d0191b'
  ctx.fillRect(cx - 4, 30, 8, 24)
  ctx.fillRect(cx - 4, 58, 8, 7)
}

/** Alarm beeps: four quick high-low pairs, made on the fly. */
export function alarmBeep(): void {
  try {
    const ctx = new AudioContext()
    for (let i = 0; i < 8; i++) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'square'
      osc.frequency.value = i % 2 === 0 ? 1046 : 880
      gain.gain.value = 0.08
      osc.connect(gain).connect(ctx.destination)
      const at = ctx.currentTime + i * 0.16 + Math.floor(i / 2) * 0.12
      osc.start(at)
      osc.stop(at + 0.12)
    }
    window.setTimeout(() => void ctx.close(), 2500)
  } catch {
    /* no audio device */
  }
}

export function createTimerAlert(scene: THREE.Scene, onDismiss: () => void = () => {}): TimerAlert {
  const group = new THREE.Group()
  group.visible = false
  scene.add(group)
  const head = new THREE.Group()
  group.add(head)
  const plastic = new THREE.MeshStandardMaterial({ color: 0xf3f1ec, roughness: 0.45, metalness: 0.05 })
  const trim = new THREE.MeshStandardMaterial({ color: 0x1fb8b5, roughness: 0.4 })
  const screenMat = new THREE.MeshStandardMaterial({ color: 0x16222b, roughness: 0.2, metalness: 0.3 })
  // The same shapes as Robotico's head, in head units (0.6 wide).
  head.add(new THREE.Mesh(new RoundedBoxGeometry(0.6, 0.44, 0.42, 6, 0.12), plastic))
  const bezel = new THREE.Mesh(new RoundedBoxGeometry(0.48, 0.32, 0.04, 4, 0.03), screenMat)
  bezel.position.z = 0.2
  head.add(bezel)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = THREE.NearestFilter
  const faceMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.44 * (H / W)), faceMat)
  face.position.z = 0.2205
  head.add(face)
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 8), trim)
  antenna.position.y = 0.3
  head.add(antenna)
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 })
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 12), bulbMat)
  bulb.position.y = 0.4
  head.add(bulb)
  head.scale.setScalar(HEAD_PX / 0.6)

  const bubble = document.createElement('div')
  bubble.id = 'alertBubble'
  document.body.append(bubble)

  let showing = false
  let shownAt = 0
  let lastBeep = 0
  let clock = 0
  let leaving = -1

  const spot = () => {
    // Top right of the screen, clear of the edge.
    return { x: window.innerWidth - HEAD_PX * 0.75, y: window.innerHeight - HEAD_PX * 0.62 }
  }

  function dismiss(): void {
    if (!showing) return
    showing = false
    leaving = clock
    bubble.classList.remove('show')
    onDismiss()
  }

  return {
    get showing() {
      return showing
    },
    show(text, look) {
      if (look) {
        plastic.color.setHex(look.body)
        trim.color.setHex(look.trim)
      }
      showing = true
      leaving = -1
      shownAt = clock
      lastBeep = performance.now()
      group.visible = true
      bubble.textContent = text
      bubble.classList.add('show')
      alarmBeep()
    },
    dismiss,
    hit(x, y) {
      if (!showing) return false
      const s = spot()
      const top = window.innerHeight - s.y
      const inHead = Math.abs(x - s.x) < HEAD_PX * 0.55 && Math.abs(y - top) < HEAD_PX * 0.5
      const r = bubble.getBoundingClientRect()
      return inHead || (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)
    },
    frame(t) {
      clock = t
      if (!group.visible) return
      const s = spot()
      // Drops in from above the top of the screen with a bounce, shakes now and then, and rises away when done.
      const inP = Math.min(1, (t - shownAt) / 0.55)
      const drop = 1 + 2.70158 * Math.pow(inP - 1, 3) + 1.70158 * Math.pow(inP - 1, 2)
      const out = leaving >= 0 ? Math.min(1, (t - leaving) / 0.35) : 0
      const offY = (1 - drop) * HEAD_PX * 1.4 + out * out * HEAD_PX * 1.6
      group.position.set(s.x, s.y + offY, 300)
      const shake = showing ? Math.sin(t * 40) * 0.08 * Math.max(0, Math.sin(t * 2.5)) : 0
      head.rotation.set(0.1, -0.35, shake)
      drawAlarmFace(ctx, t)
      tex.needsUpdate = true
      bulbMat.color.setHex(Math.floor(t * 5) % 2 ? 0xff3b30 : 0xffd400)
      const top = window.innerHeight - (s.y + offY)
      bubble.style.left = `${s.x - HEAD_PX * 0.62}px`
      bubble.style.top = `${top}px`
      // Keeps beeping until it's clicked, like an alarm clock.
      if (showing && performance.now() - lastBeep > BEEP_EVERY_MS) {
        lastBeep = performance.now()
        alarmBeep()
      }
      if (showing && t - shownAt > GIVE_UP_MS / 1000) dismiss()
      if (leaving >= 0 && out >= 1) group.visible = false
    }
  }
}
