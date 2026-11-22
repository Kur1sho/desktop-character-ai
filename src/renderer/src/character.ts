import type { Object3D, Vector3 } from 'three'
import type { Emotion } from '@shared/personas'

/** Anything the app can put on the desktop: the built-in robot or a VRM model. */
export interface Character {
  /** Root object. Its origin is at the character's feet. */
  readonly root: Object3D
  /** Height of the model in its own units, used to scale it to screen pixels. */
  readonly height: number
  /** Turn the head and eyes toward a point in world space. */
  lookAt(target: Vector3): void
  /** 0 = eyes open, 1 = closed. */
  setBlink(amount: number): void
  /** Called every frame with time since the last frame and total time, in seconds. */
  update(dt: number, time: number): void
  /** Show an emotion on the face until the next one. */
  setEmotion(emotion: Emotion): void
  /** 0 = mouth closed, 1 = wide open. Used for lip sync. */
  setMouth(open: number): void
  /** Play a short wave, used when summoned. */
  wave(): void
  dispose(): void
}
