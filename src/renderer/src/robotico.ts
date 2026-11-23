// Placeholder Robotico built from simple shapes, so the app works before the
// real Blender model exists. It follows the character sheet: off-white body,
// teal accents, an LED screen face that shows any expression, an orange antenna light and
// floating hands.
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { Emotion } from '@shared/personas'
import type { BodyPose, Character } from './character'
import type { Look } from '@shared/cosmetics'
import { breath } from './idle'
import { ACTIVITY_POPUPS, drawFace, FACE_H, FACE_W, POPUPS, type Activity } from './robotFace'

const WHITE = 0xf3f1ec
const TEAL = 0x1fb8b5
const ORANGE = 0xff9a3c
const SCREEN = 0x16222b

export function createRobotico(): Character {
  const root = new THREE.Group()
  root.name = 'Robotico'

  const plastic = new THREE.MeshStandardMaterial({ color: WHITE, roughness: 0.45, metalness: 0.05 })
  const trim = new THREE.MeshStandardMaterial({ color: TEAL, roughness: 0.4 })
  const screenMat = new THREE.MeshStandardMaterial({ color: SCREEN, roughness: 0.2, metalness: 0.3 })
  const glowMat = new THREE.MeshBasicMaterial({ color: ORANGE })

  // Everything above the feet bobs gently.
  const body = new THREE.Group()
  root.add(body)

  // Hover base instead of legs.
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.08, 32), trim)
  base.position.y = 0.04
  root.add(base)

  const torso = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.4, 0.34, 6, 0.1), plastic)
  torso.position.y = 0.36
  body.add(torso)

  const belly = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.12, 0.02, 4, 0.01), trim)
  belly.position.set(0, 0.34, 0.17)
  body.add(belly)

  // The neck tilts for yawns, stretches and naps; the head inside it turns to look around.
  const neck = new THREE.Group()
  neck.position.y = 0.78
  body.add(neck)
  const head = new THREE.Group()
  neck.add(head)

  const skull = new THREE.Mesh(new RoundedBoxGeometry(0.6, 0.44, 0.42, 6, 0.12), plastic)
  head.add(skull)

  const face = new THREE.Mesh(new RoundedBoxGeometry(0.48, 0.32, 0.04, 4, 0.03), screenMat)
  face.position.z = 0.2
  head.add(face)

  // The face is a little LED screen drawn on a canvas, so it can show any expression.
  const faceCanvas = document.createElement('canvas')
  faceCanvas.width = FACE_W
  faceCanvas.height = FACE_H
  const faceCtx = faceCanvas.getContext('2d')!
  const faceTex = new THREE.CanvasTexture(faceCanvas)
  faceTex.colorSpace = THREE.SRGBColorSpace
  faceTex.magFilter = THREE.NearestFilter // chunky pixels
  faceTex.minFilter = THREE.LinearFilter
  faceTex.generateMipmaps = false
  const screenFaceMat = new THREE.MeshBasicMaterial({ map: faceTex, toneMapped: false })
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.44 * (FACE_H / FACE_W)), screenFaceMat)
  screen.position.z = 0.2205
  head.add(screen)
  let mouthOpen = 0

  // Emoji that pop up beside his head and float away.
  const popups = createPopups(head)

  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 8), trim)
  antenna.position.y = 0.3
  head.add(antenna)
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 12), glowMat)
  bulb.position.y = 0.4
  head.add(bulb)

  const hands: THREE.Mesh[] = []
  for (const side of [-1, 1]) {
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 14), plastic)
    hand.position.set(side * 0.34, 0.34, 0.04)
    body.add(hand)
    hands.push(hand)
  }

  let emotion: Emotion = 'neutral'
  let emotionAt = 0
  let activity: Activity = 'idle'
  let nextActivityPopup = 0
  let blink = 0

  const headTarget = new THREE.Euler()
  let waveUntil = 0
  let clock = 0
  let pose: BodyPose | null = null
  let poseAt = 0
  let hat: THREE.Object3D | null = null
  let hatId = 'none'

  const neckTarget = new THREE.Euler()
  /** Moves the hands and neck for the current pose, on top of the normal idle motion. */
  function posePass(dt: number, time: number, since: number): void {
    neckTarget.set(0, 0, 0)
    const [l, r] = hands
    const ease = (p: number) => Math.sin(Math.min(1, Math.max(0, p)) * Math.PI)
    switch (pose) {
      case 'yawn': {
        const p = ease(since / 2.2)
        l.position.set(-0.34 + 0.24 * p, 0.34 + 0.34 * p, 0.04 + 0.2 * p)
        neckTarget.x = -0.18 * p
        break
      }
      case 'stretch': {
        const p = ease(since / 2.6)
        l.position.set(-0.34 + 0.1 * p, 0.34 + 0.86 * p, 0.04)
        r.position.set(0.34 - 0.1 * p, 0.34 + 0.86 * p, 0.04)
        body.scale.y = 1 + 0.05 * p
        neckTarget.x = -0.12 * p
        break
      }
      case 'drum': {
        // Tapping on the taskbar in front of him, left and right in turn.
        const beat = time * 4
        const tap = (phase: number) => Math.abs(Math.sin((beat + phase) * Math.PI)) * 0.08
        l.position.set(-0.2, 0.1 + tap(0), 0.24)
        r.position.set(0.2, 0.1 + tap(0.5), 0.24)
        neckTarget.x = 0.12 + Math.sin(beat * Math.PI) * 0.04
        break
      }
      case 'sleep':
        l.position.set(-0.3, 0.2, 0.08)
        r.position.set(0.3, 0.2, 0.08)
        body.position.y -= 0.02
        neckTarget.x = 0.32
        neckTarget.z = 0.12 + Math.sin(time * 0.8) * 0.02
        break
      case 'held':
        // Dangling, waving the arms about.
        l.position.set(-0.44, 0.62 + Math.sin(time * 13) * 0.06, 0.04)
        r.position.set(0.44, 0.62 + Math.sin(time * 13 + 2) * 0.06, 0.04)
        break
      case 'swat': {
        const p = Math.min(1, since / 0.35)
        r.position.set(0.34 + 0.22 * Math.sin(p * Math.PI), 0.34 + 0.4 * Math.sin(p * Math.PI * 0.5), 0.04 + 0.15 * p)
        break
      }
      case 'walk': {
        const s = Math.sin(time * 10)
        l.position.set(-0.36, 0.32, 0.04 + s * 0.08)
        r.position.set(0.36, 0.32, 0.04 - s * 0.08)
        break
      }
      case 'peek':
        l.position.set(-0.3, 0.66, 0.2)
        r.position.set(0.3, 0.66, 0.2)
        break
    }
    if (pose !== 'stretch') body.scale.y += (1 - body.scale.y) * Math.min(1, dt * 10)
    const k = 1 - Math.exp(-dt * 6)
    neck.rotation.x += (neckTarget.x - neck.rotation.x) * k
    neck.rotation.z += (neckTarget.z - neck.rotation.z) * k
  }

  return {
    root,
    height: 1.22,
    lookAt(target) {
      // Convert the target into the head's local direction and turn toward it, within limits.
      const headWorld = new THREE.Vector3()
      head.getWorldPosition(headWorld)
      const dir = target.clone().sub(headWorld)
      headTarget.y = THREE.MathUtils.clamp(Math.atan2(dir.x, Math.max(0.3, dir.z)), -0.6, 0.6)
      headTarget.x = THREE.MathUtils.clamp(-Math.atan2(dir.y, Math.max(0.3, dir.z)), -0.35, 0.35)
    },
    setBlink(amount) {
      blink = amount
    },
    setEmotion(next) {
      if (next === emotion) return
      emotion = next
      emotionAt = clock
      const options = POPUPS[next]
      if (options) popups.show(options[Math.floor(Math.random() * options.length)], clock)
    },
    setActivity(next) {
      if (next === activity) return
      activity = next
      nextActivityPopup = clock + 0.3
    },
    emote(emoji) {
      popups.show(emoji, clock)
    },
    setMouth(open) {
      mouthOpen = open
    },
    setPose(next) {
      if (next === pose) return
      pose = next
      poseAt = clock
    },
    setLook(look: Look) {
      trim.color.setHex(look.trim)
      plastic.color.setHex(look.body)
      if (look.hat === hatId) return
      if (hat) {
        head.remove(hat)
        disposeTree(hat)
      }
      hatId = look.hat
      hat = makeHat(look.hat, look.trim)
      if (hat) head.add(hat)
    },
    update(dt, time) {
      clock = time
      const since = time - poseAt
      // A yawn opens the mouth wide by itself.
      const yawnMouth = pose === 'yawn' ? Math.max(0, Math.sin(Math.min(1, since / 2.2) * Math.PI)) : 0
      drawFace(faceCtx, {
        emotion,
        activity,
        blink,
        mouth: Math.max(mouthOpen, yawnMouth),
        time,
        lookX: head.rotation.y / 0.6,
        lookY: -head.rotation.x / 0.35,
        since: time - emotionAt
      })
      faceTex.needsUpdate = true
      const extra = ACTIVITY_POPUPS[activity]
      if (extra && time >= nextActivityPopup) {
        popups.show(extra[Math.floor(Math.random() * extra.length)], time)
        nextActivityPopup = time + (activity === 'dancing' ? 1.4 : 2.5)
      }
      popups.update(time)
      const b = breath(time)
      body.position.y = 0.02 + b * 0.012
      const k = 1 - Math.exp(-dt * 8)
      head.rotation.x += (headTarget.x - head.rotation.x) * k
      head.rotation.y += (headTarget.y - head.rotation.y) * k
      // The antenna glows softly.
      glowMat.color.setHSL(0.08, 1, 0.55 + 0.1 * Math.sin(time * 2))
      // Hands float, and the right hand waves when asked.
      hands[0].position.y = 0.34 + Math.sin(time * 2.1) * 0.015
      if (time < waveUntil) {
        const p = 1 - (waveUntil - time) / 1.6
        hands[1].position.set(0.4, 0.62 + Math.sin(p * Math.PI) * 0.06, 0.08)
        hands[1].position.x = 0.4 + Math.sin(time * 14) * 0.05
      } else {
        hands[1].position.set(0.34, 0.34 + Math.sin(time * 2.1 + 1) * 0.015, 0.04)
      }
      posePass(dt, time, since)
      if (hat && hatId === 'halo') hat.position.y = 0.5 + Math.sin(time * 2) * 0.015
    },
    wave() {
      waveUntil = clock + 1.6
    },
    dance(move) {
      if (!move) return
      // Arms pump up on the beat, alternating sides; the head bobs.
      const hit = Math.pow(1 - move.phase, 2)
      const beat = move.count + move.phase
      const left = move.count % 2 === 0
      if (move.arms === 'up') {
        // Both arms up, punching on the beat.
        hands[0].position.set(-0.3, 0.78 + 0.06 * hit, 0.06)
        hands[1].position.set(0.3, 0.78 + 0.06 * hit, 0.06)
      } else if (move.arms === 'out') {
        // Arms out wide, gently waving.
        hands[0].position.set(-0.58, 0.5 + Math.sin(beat * Math.PI) * 0.05, 0.02)
        hands[1].position.set(0.58, 0.5 - Math.sin(beat * Math.PI) * 0.05, 0.02)
      } else if (move.arms === 'low') {
        // Slow and low for moody songs.
        hands[0].position.set(-0.34, 0.3 + Math.sin((beat * Math.PI) / 2) * 0.04, 0.06)
        hands[1].position.set(0.34, 0.3 - Math.sin((beat * Math.PI) / 2) * 0.04, 0.06)
      } else {
        const up = (0.2 + 0.22 * move.intensity) * hit
        hands[0].position.set(-0.36, 0.36 + (left ? up : up * 0.25), 0.06)
        hands[1].position.set(0.36, 0.36 + (left ? up * 0.25 : up), 0.06)
      }
      head.rotation.x += (move.arms === 'low' ? 0.04 : 0.12) * hit
      head.rotation.z = Math.sin(beat * Math.PI) * (move.arms === 'low' ? 0.06 : 0.12)
    },
    dispose() {
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose()
      })
      for (const m of [plastic, trim, screenMat, screenFaceMat, glowMat]) m.dispose()
      if (hat) disposeTree(hat)
      faceTex.dispose()
      popups.dispose()
    }
  }
}

function disposeTree(o: THREE.Object3D): void {
  o.traverse((x) => {
    if (x instanceof THREE.Mesh) {
      x.geometry.dispose()
      ;(x.material as THREE.Material).dispose()
    }
  })
}

/** Builds a hat to sit on his head (head coordinates: the top of the head is at y 0.22). */
export function makeHat(id: string, trimColor: number): THREE.Object3D | null {
  const g = new THREE.Group()
  const mat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...extra })
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z = 0) => {
    const mesh = new THREE.Mesh(geo, m)
    mesh.position.set(x, y, z)
    g.add(mesh)
    return mesh
  }
  switch (id) {
    case 'party': {
      add(new THREE.ConeGeometry(0.1, 0.24, 24), mat(0xff6fa8), 0, 0.12)
      add(new THREE.SphereGeometry(0.035, 12, 8), mat(0xffffff), 0, 0.25)
      add(new THREE.TorusGeometry(0.085, 0.012, 6, 24), mat(0xffd44a), 0, 0.03).rotation.x = Math.PI / 2
      g.position.set(-0.15, 0.21, 0)
      g.rotation.z = 0.28
      break
    }
    case 'bow': {
      const red = mat(0xff4f8b)
      for (const side of [-1, 1]) {
        const loop = add(new THREE.ConeGeometry(0.06, 0.13, 16), red, side * 0.07, 0)
        loop.rotation.z = side * Math.PI / 2
      }
      add(new THREE.SphereGeometry(0.035, 12, 8), red, 0, 0)
      g.position.set(-0.19, 0.24, 0.08)
      g.rotation.z = 0.25
      break
    }
    case 'beanie': {
      const wool = mat(0x3f6fd8, { roughness: 0.9 })
      const dome = add(new THREE.SphereGeometry(0.3, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), wool, 0, 0.12)
      dome.scale.set(1.04, 0.62, 0.76)
      add(new THREE.CylinderGeometry(0.315, 0.315, 0.07, 24, 1, true), mat(0x2f57b0, { roughness: 0.9, side: THREE.DoubleSide }), 0, 0.14).scale.z = 0.76
      add(new THREE.SphereGeometry(0.05, 12, 8), mat(0xffffff, { roughness: 1 }), 0.13, 0.31)
      break
    }
    case 'flower': {
      const petal = mat(0xffa6c9)
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2
        add(new THREE.SphereGeometry(0.035, 10, 8), petal, Math.cos(a) * 0.045, Math.sin(a) * 0.045)
      }
      add(new THREE.SphereGeometry(0.03, 10, 8), mat(0xffd44a), 0, 0, 0.01)
      g.position.set(0.21, 0.22, 0.16)
      break
    }
    case 'headphones': {
      const dark = mat(0x2b2f36)
      add(new THREE.TorusGeometry(0.33, 0.022, 8, 32, Math.PI), dark, 0, 0)
      for (const side of [-1, 1]) {
        const cup = add(new THREE.CylinderGeometry(0.09, 0.09, 0.07, 24), mat(trimColor), side * 0.33, 0)
        cup.rotation.z = Math.PI / 2
      }
      break
    }
    case 'tophat': {
      const black = mat(0x1d1f24, { roughness: 0.35 })
      add(new THREE.CylinderGeometry(0.115, 0.12, 0.2, 24), black, 0, 0.11)
      add(new THREE.CylinderGeometry(0.19, 0.19, 0.02, 32), black, 0, 0.01)
      add(new THREE.CylinderGeometry(0.122, 0.122, 0.04, 24), mat(trimColor), 0, 0.04)
      g.position.set(-0.14, 0.215, 0)
      g.rotation.z = 0.16
      break
    }
    case 'halo': {
      const ring = add(new THREE.TorusGeometry(0.16, 0.018, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffe58a }), 0, 0)
      ring.rotation.x = Math.PI / 2
      g.position.set(0, 0.5, 0)
      break
    }
    case 'crown': {
      const gold = mat(0xf2c230, { metalness: 0.6, roughness: 0.3 })
      add(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 24, 1, true), mat(0xf2c230, { metalness: 0.6, roughness: 0.3, side: THREE.DoubleSide }), 0, 0.04)
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        add(new THREE.ConeGeometry(0.03, 0.07, 8), gold, Math.cos(a) * 0.12, 0.11, Math.sin(a) * 0.12)
      }
      add(new THREE.SphereGeometry(0.022, 10, 8), mat(0xff4f6b), 0, 0.04, 0.13)
      g.position.set(-0.14, 0.215, 0)
      g.rotation.z = 0.18
      break
    }
    default:
      return null
  }
  return g
}

/** Emoji sprites that pop in beside the head, float up and fade. */
function createPopups(parent: THREE.Object3D) {
  const textures = new Map<string, THREE.CanvasTexture>()
  const live: { sprite: THREE.Sprite; born: number; x: number }[] = []
  const LIFE = 1.8
  let side = 1

  function texture(emoji: string): THREE.CanvasTexture {
    let tex = textures.get(emoji)
    if (!tex) {
      const c = document.createElement('canvas')
      c.width = c.height = 128
      const ctx = c.getContext('2d')!
      ctx.font = '100px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(emoji, 64, 70)
      tex = new THREE.CanvasTexture(c)
      tex.colorSpace = THREE.SRGBColorSpace
      textures.set(emoji, tex)
    }
    return tex
  }

  return {
    show(emoji: string, now: number) {
      // Never more than a few at once.
      while (live.length >= 3) {
        const old = live.shift()!
        parent.remove(old.sprite)
        old.sprite.material.dispose()
      }
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture(emoji), transparent: true, depthTest: false }))
      sprite.renderOrder = 10
      side = -side
      const x = side * (0.36 + Math.random() * 0.06)
      sprite.position.set(x, 0.22, 0.15)
      sprite.scale.setScalar(0.001)
      parent.add(sprite)
      live.push({ sprite, born: now, x })
    },
    update(now: number) {
      for (let i = live.length - 1; i >= 0; i--) {
        const p = live[i]
        const t = (now - p.born) / LIFE
        if (t >= 1) {
          parent.remove(p.sprite)
          p.sprite.material.dispose()
          live.splice(i, 1)
          continue
        }
        // Pop in with a little overshoot, drift up and sway, then fade out.
        const pop = t < 0.15 ? Math.sin((t / 0.15) * Math.PI * 0.75) / Math.sin(Math.PI * 0.75) : 1
        p.sprite.scale.setScalar(0.2 * Math.max(0.001, pop))
        p.sprite.position.y = 0.22 + t * 0.25
        p.sprite.position.x = p.x + Math.sin(t * Math.PI * 3) * 0.02
        p.sprite.material.opacity = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3
      }
    },
    dispose() {
      for (const p of live) {
        parent.remove(p.sprite)
        p.sprite.material.dispose()
      }
      live.length = 0
      for (const t of textures.values()) t.dispose()
    }
  }
}
