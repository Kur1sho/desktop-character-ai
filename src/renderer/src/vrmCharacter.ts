// Loads a VRM model (from VRoid Studio or Blender) and gives it idle life:
// relaxed arms instead of a T-pose, breathing, blinking and looking at the mouse.
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm'
import type { Emotion } from '@shared/personas'
import type { Character, DanceMove } from './character'
import { breath } from './idle'

export async function loadVrmCharacter(data: ArrayBuffer): Promise<Character> {
  const loader = new GLTFLoader()
  loader.register((parser) => new VRMLoaderPlugin(parser))
  const gltf = await loader.parseAsync(data, '')
  const vrm = gltf.userData.vrm as VRM | undefined
  if (!vrm) throw new Error('That file is not a VRM model.')

  VRMUtils.removeUnnecessaryVertices(gltf.scene)
  VRMUtils.combineSkeletons(gltf.scene)
  VRMUtils.rotateVRM0(vrm) // older VRoid exports face the wrong way
  vrm.scene.traverse((o) => (o.frustumCulled = false))

  const root = new THREE.Group()
  root.add(vrm.scene)

  const box = new THREE.Box3().setFromObject(vrm.scene)
  const height = Math.max(0.5, box.max.y - box.min.y)

  const lookTarget = new THREE.Object3D()
  root.add(lookTarget)
  if (vrm.lookAt) vrm.lookAt.target = lookTarget

  const bone = (name: Parameters<NonNullable<VRM['humanoid']>['getNormalizedBoneNode']>[0]) =>
    vrm.humanoid?.getNormalizedBoneNode(name) ?? null

  const leftUpperArm = bone('leftUpperArm')
  const rightUpperArm = bone('rightUpperArm')
  const leftLowerArm = bone('leftLowerArm')
  const rightLowerArm = bone('rightLowerArm')
  const spine = bone('spine')
  const chest = bone('chest')
  const neck = bone('neck')

  let danceMove: DanceMove | null = null
  /** Arms swing up on the beat, alternating; hips twist; head nods. */
  function applyDance(move: DanceMove): void {
    const hit = Math.pow(1 - move.phase, 2)
    const beat = move.count + move.phase
    const left = move.count % 2 === 0
    // Upper-arm angle from the side: 1.2 = down, 0 = straight out, negative = raised.
    let l = 1.2
    let r = 1.2
    let bend = 0.15
    if (move.arms === 'up') {
      l = r = -0.9 + 0.1 * hit
      bend = 0.3
    } else if (move.arms === 'out') {
      l = 0.05 + Math.sin(beat * Math.PI) * 0.12
      r = 0.05 - Math.sin(beat * Math.PI) * 0.12
    } else if (move.arms === 'low') {
      l = 1.1 + Math.sin((beat * Math.PI) / 2) * 0.08
      r = 1.1 - Math.sin((beat * Math.PI) / 2) * 0.08
    } else {
      const lift = (0.5 + 0.5 * move.intensity) * hit
      l = 1.2 - (left ? 0.9 : 0.3) * lift
      r = 1.2 - (left ? 0.3 : 0.9) * lift
      bend = 0.15 + 0.6 * lift
    }
    if (leftUpperArm) leftUpperArm.rotation.z = -l
    if (rightUpperArm) rightUpperArm.rotation.z = r
    if (leftLowerArm) leftLowerArm.rotation.z = -bend
    if (rightLowerArm) rightLowerArm.rotation.z = bend
    if (spine) spine.rotation.y = Math.sin(beat * Math.PI) * (move.arms === 'low' ? 0.08 : 0.15)
    if (neck) neck.rotation.x = (move.arms === 'low' ? 0.08 : 0.15) * hit
  }

  // VRM preset expressions for each emotion, with weights.
  const EXPRESSIONS: Record<Emotion, Record<string, number>> = {
    neutral: {},
    happy: { happy: 1 },
    laughing: { happy: 1 },
    excited: { happy: 0.9, surprised: 0.3 },
    love: { happy: 0.8, relaxed: 0.3 },
    scared: { surprised: 0.6, sad: 0.5 },
    confused: { surprised: 0.3, sad: 0.2 },
    angry: { angry: 1 },
    sad: { sad: 1 },
    surprised: { surprised: 1 },
    flustered: { happy: 0.4, surprised: 0.3 },
    smug: { relaxed: 0.8, happy: 0.2 },
    sleepy: { relaxed: 1 }
  }
  const NAMES = ['happy', 'angry', 'sad', 'surprised', 'relaxed']
  let emotion: Emotion = 'neutral'
  const weights: Record<string, number> = {}

  let waveUntil = 0
  let clock = 0

  return {
    root,
    height,
    lookAt(target) {
      lookTarget.position.copy(root.worldToLocal(target.clone()))
    },
    setBlink(amount) {
      // Some expressions close the eyes already; avoid a double blink.
      vrm.expressionManager?.setValue('blink', emotion === 'happy' ? 0 : amount)
    },
    setEmotion(next) {
      emotion = next
    },
    setMouth(open) {
      vrm.expressionManager?.setValue('aa', open * 0.8)
    },
    update(dt, time) {
      clock = time
      const b = breath(time)
      // Relaxed arms, gently swaying with breath.
      if (leftUpperArm) leftUpperArm.rotation.z = -1.2 + b * 0.02
      if (leftLowerArm) leftLowerArm.rotation.z = -0.15
      const waving = time < waveUntil
      if (rightUpperArm) {
        rightUpperArm.rotation.z = waving ? -0.5 : 1.2 - b * 0.02
      }
      if (rightLowerArm) {
        rightLowerArm.rotation.z = waving ? -1.3 + Math.sin(time * 12) * 0.35 : 0.15
      }
      if (spine) spine.rotation.x = b * 0.015
      if (chest) chest.rotation.x = b * 0.02
      if (neck) neck.rotation.z = Math.sin(time * 0.7) * 0.03
      const target = EXPRESSIONS[emotion]
      const k = 1 - Math.exp(-dt * 8)
      for (const name of NAMES) {
        weights[name] = (weights[name] ?? 0) + ((target[name] ?? 0) - (weights[name] ?? 0)) * k
        vrm.expressionManager?.setValue(name, weights[name])
      }
      if (danceMove) applyDance(danceMove)
      else if (spine) spine.rotation.y = 0
      vrm.update(dt)
    },
    wave() {
      waveUntil = clock + 1.6
    },
    dance(move) {
      // Applied in update(), before the model's bones are refreshed.
      danceMove = move
    },
    dispose() {
      VRMUtils.deepDispose(vrm.scene)
    }
  }
}
