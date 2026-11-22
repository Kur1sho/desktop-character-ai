// Loads a VRM model (from VRoid Studio or Blender) and gives it idle life:
// relaxed arms instead of a T-pose, breathing, blinking and looking at the mouse.
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm'
import type { Emotion } from '@shared/personas'
import type { Character } from './character'
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

  // VRM preset expressions for each emotion, with weights.
  const EXPRESSIONS: Record<Emotion, Record<string, number>> = {
    neutral: {},
    happy: { happy: 1 },
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
      vrm.update(dt)
    },
    wave() {
      waveUntil = clock + 1.6
    },
    dispose() {
      VRMUtils.deepDispose(vrm.scene)
    }
  }
}
