// The second character: when "Bring a friend" is on, the other persona stands
// beside the main one, chats with it now and then, and joins in the dancing.
import * as THREE from 'three'
import { getPersona, PERSONAS, type Emotion } from '@shared/personas'
import { resolveLook, type Progress } from '@shared/cosmetics'
import { readingMs } from './chat'
import type { Character, DanceMove } from './character'
import { createRobotico } from './robotico'
import { blinkAmount } from './idle'
import { speak } from './voice/speaker'

export interface Friend {
  readonly personaId: string
  /** Where its feet are (scene x). */
  readonly x: number
  /** near.x is the main character to stand beside, or null to stay put. */
  frame(dt: number, t: number, near: { x: number | null; floor: number; px: number; left: number; right: number }, mouse: THREE.Vector3): void
  say(text: string, emotion: Emotion, aloud: boolean): Promise<void>
  feel(e: Emotion): void
  setAsleep(asleep: boolean): void
  setVisible(v: boolean): void
  dance(move: DanceMove | null): void
  setLook(p: Progress): void
  dispose(): void
}

/** The persona that isn't the main one. */
export function friendFor(personaId: string): string {
  return PERSONAS.find((p) => p.id !== personaId)?.id ?? 'robotico'
}

export function createFriend(scene: THREE.Scene, mainPersonaId: string, progress: Progress): Friend {
  const personaId = friendFor(mainPersonaId)
  const persona = getPersona(personaId)
  const character: Character = createRobotico()
  const stage = new THREE.Group()
  const holder = new THREE.Group()
  stage.add(holder)
  holder.add(character.root)
  scene.add(stage)
  const bubble = document.getElementById('friendBubble') as HTMLDivElement
  let hideTimer = 0
  let x = -1
  let want = -1
  let px = 0
  let asleep = false
  let dancing = false
  let mouth = 0
  const resting = persona.resting ?? 'neutral'
  character.setEmotion(resting)
  character.setLook?.(resolveLook(personaId, 'auto', 'auto', progress))
  character.wave()

  return {
    personaId,
    get x() {
      return x
    },
    frame(dt, t, near, mouse) {
      if (near.px !== px) {
        px = near.px
        character.root.scale.setScalar((px * 0.92) / character.height)
      }
      // Stands beside the main character, on whichever side has room, and walks over when it moves.
      const gap = px * 0.62
      if (near.x !== null) {
        want = near.x + gap > near.right ? near.x - gap : near.x + gap
        if (x < 0) x = want
      } else if (x < 0) x = want = (near.left + near.right) / 2
      const step = 160 * (px / 260) * dt
      const walking = Math.abs(want - x) > 4
      if (walking) x += Math.sign(want - x) * Math.min(step, Math.abs(want - x))
      x = Math.min(near.right, Math.max(near.left, x))
      const bob = walking ? Math.abs(Math.sin(t * 10)) * 3 : 0
      stage.position.set(x, near.floor + bob, 0)
      if (!dancing) character.setPose?.(asleep ? 'sleep' : walking ? 'walk' : null)
      character.lookAt(mouse)
      character.setBlink(asleep ? 1 : blinkAmount(t, 1.7))
      character.setActivity?.(asleep ? 'sleeping' : dancing ? 'dancing' : 'idle')
      character.setMouth(mouth)
      character.update(dt, t)
      const top = window.innerHeight - (near.floor + px * 0.92 + 12)
      bubble.style.left = `${Math.min(window.innerWidth - 130, Math.max(130, x))}px`
      bubble.style.top = `${top}px`
    },
    async say(text, emotion, aloud) {
      character.setEmotion(emotion === 'neutral' ? resting : emotion)
      window.clearTimeout(hideTimer)
      bubble.textContent = text
      bubble.classList.add('show')
      const done = () => {
        hideTimer = window.setTimeout(() => {
          bubble.classList.remove('show')
          character.setEmotion(resting)
        }, 900)
      }
      if (aloud) await speak(text, persona.voice, (open) => (mouth = open))
      else await new Promise((r) => setTimeout(r, readingMs(text)))
      done()
    },
    feel(e) {
      character.setEmotion(e === 'neutral' ? resting : e)
    },
    setAsleep(a) {
      asleep = a
      character.setEmotion(a ? 'sleepy' : resting)
    },
    setVisible(v) {
      stage.visible = v
      if (!v) bubble.classList.remove('show')
    },
    dance(move) {
      dancing = move !== null
      if (dancing) character.setPose?.(null)
      character.dance(move)
      // A little bounce on the beat, half a beat behind for fun.
      holder.position.y = move ? Math.pow(1 - ((move.phase + 0.5) % 1), 2) * 10 * move.intensity : 0
    },
    setLook(p) {
      character.setLook?.(resolveLook(personaId, 'auto', 'auto', p))
    },
    dispose() {
      scene.remove(stage)
      character.dispose()
      bubble.classList.remove('show')
    }
  }
}
