import type { Object3D, Vector3 } from 'three'
import type { Emotion } from '@shared/personas'
import type { Look } from '@shared/cosmetics'

/** Things the body does by itself, or while being played with. */
export type BodyPose =
  | 'yawn'
  | 'stretch'
  | 'drum'
  | 'sleep'
  | 'held'
  | 'swat'
  | 'walk'
  | 'peek'
  // With the friend (they need setPartner to know which side it's on):
  | 'hold'
  | 'heart'
  | 'pat'
  | 'lean'
  | 'boop'
  | 'antenna'
  | 'beep'
  | 'glitch'

export interface DanceMove {
  /** 0 on the beat, rising to 1 just before the next. */
  phase: number
  /** Beat number, for alternating moves. */
  count: number
  /** 0 to 1, how loud the music is. */
  intensity: number
  /** Arm style for the current move. */
  arms: 'pump' | 'up' | 'out' | 'low'
}

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
  /** What the character is busy with (listening, thinking, dancing), for faces that can show it. */
  setActivity?(activity: 'idle' | 'listening' | 'thinking' | 'dancing' | 'sleeping'): void
  /** Yawning, stretching, drumming, sleeping, dangling... null to stand normally. */
  setPose?(pose: BodyPose | null): void
  /** Which side the friend is on (-1 left, 1 right), for the poses done together. Characters without it don't do them. */
  setPartner?(side: number): void
  /** Hat and colours, for characters that can change them. */
  setLook?(look: Look): void
  /** Pop up an emoji beside the head, if the character can. */
  emote?(emoji: string): void
  /** 0 = mouth closed, 1 = wide open. Used for lip sync. */
  setMouth(open: number): void
  /** Play a short wave, used when summoned. */
  wave(): void
  /**
   * Dance moves for this frame (arms, head), called after update(). Null when
   * not dancing. The whole-body bounce and sway is done by the app.
   */
  dance(move: DanceMove | null): void
  dispose(): void
}
