// Placeholder Robotico built from simple shapes, so the app works before the
// real Blender model exists. It follows the character sheet: off-white body,
// teal accents, a screen face with pixel eyes, an orange antenna light and
// floating hands.
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { Emotion } from '@shared/personas'
import type { Character } from './character'
import { breath } from './idle'

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
  const eyeMat = new THREE.MeshBasicMaterial({ color: TEAL })
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

  const head = new THREE.Group()
  head.position.y = 0.78
  body.add(head)

  const skull = new THREE.Mesh(new RoundedBoxGeometry(0.6, 0.44, 0.42, 6, 0.12), plastic)
  head.add(skull)

  const face = new THREE.Mesh(new RoundedBoxGeometry(0.48, 0.32, 0.04, 4, 0.03), screenMat)
  face.position.z = 0.2
  head.add(face)

  const eyes: THREE.Mesh[] = []
  for (const x of [-0.11, 0.11]) {
    const eye = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.12, 0.01, 2, 0.02), eyeMat)
    eye.position.set(x, 0.02, 0.225)
    head.add(eye)
    eyes.push(eye)
  }

  // Pink cheeks, shown when flustered.
  const blushMat = new THREE.MeshBasicMaterial({ color: 0xff7aa8, transparent: true, opacity: 0 })
  for (const x of [-0.17, 0.17]) {
    const cheek = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.035, 0.01, 2, 0.015), blushMat)
    cheek.position.set(x, -0.07, 0.226)
    head.add(cheek)
  }

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

  // Eye shape per emotion: [scaleY, rotation (inward tilt), y offset, colour].
  const EYE_SHAPES: Record<Emotion, { sy: number; tilt: number; dy: number; color: number; bigger?: boolean }> = {
    neutral: { sy: 1, tilt: 0, dy: 0, color: TEAL },
    happy: { sy: 0.4, tilt: 0, dy: 0.02, color: TEAL },
    angry: { sy: 0.7, tilt: 0.45, dy: 0, color: 0xff5a4e },
    sad: { sy: 0.75, tilt: -0.4, dy: -0.02, color: 0x6aa8ff },
    surprised: { sy: 1.25, tilt: 0, dy: 0.01, color: TEAL, bigger: true },
    flustered: { sy: 0.5, tilt: -0.15, dy: 0, color: 0xff8fb8 },
    smug: { sy: 0.45, tilt: 0.2, dy: 0, color: TEAL },
    sleepy: { sy: 0.25, tilt: 0, dy: -0.02, color: TEAL }
  }
  let emotion: Emotion = 'neutral'
  let blink = 0

  const headTarget = new THREE.Euler()
  let waveUntil = 0
  let clock = 0

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
      emotion = next
    },
    update(dt, time) {
      clock = time
      const shape = EYE_SHAPES[emotion]
      const ek = 1 - Math.exp(-dt * 12)
      eyes.forEach((e, i) => {
        const side = i === 0 ? -1 : 1
        const targetSy = Math.max(0.08, shape.sy * (1 - blink))
        e.scale.y += (targetSy - e.scale.y) * ek
        const s = shape.bigger ? 1.25 : 1
        e.scale.x += (s - e.scale.x) * ek
        e.rotation.z += (side * -shape.tilt - e.rotation.z) * ek
        e.position.y += (0.02 + shape.dy - e.position.y) * ek
      })
      eyeMat.color.lerp(new THREE.Color(shape.color), ek)
      blushMat.opacity += ((emotion === 'flustered' ? 0.9 : 0) - blushMat.opacity) * ek
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
    },
    wave() {
      waveUntil = clock + 1.6
    },
    dispose() {
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose()
      })
      for (const m of [plastic, trim, screenMat, eyeMat, glowMat, blushMat]) m.dispose()
    }
  }
}
