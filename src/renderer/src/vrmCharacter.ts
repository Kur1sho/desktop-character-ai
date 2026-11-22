// Loads a VRM model (from VRoid Studio or Blender) and gives it idle life:
// relaxed arms instead of a T-pose, breathing, blinking and looking at the mouse.
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm'
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

  let waveUntil = 0
  let clock = 0

  return {
    root,
    height,
    lookAt(target) {
      lookTarget.position.copy(root.worldToLocal(target.clone()))
    },
    setBlink(amount) {
      vrm.expressionManager?.setValue('blink', amount)
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
