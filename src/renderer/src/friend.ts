// The second character: when "Bring a friend" is on, the other persona stands
// beside the main one, chats with it now and then, and joins in the dancing.
import * as THREE from 'three'
import { getPersona, PERSONAS, type Emotion } from '@shared/personas'
import { resolveLook, type Progress } from '@shared/cosmetics'
import { readingMs } from './chat'
import { restingFor } from '@shared/duo'
import type { BodyPose, Character, DanceMove } from './character'
import { createRobotico } from './robotico'
import { blinkAmount } from './idle'
import { speak } from './voice/speaker'
import { besideOn, crossesMain, hopAt, hopSeconds, JUMP_REACH, laneLook, type Ledge } from '@shared/walkLane'

export interface Friend {
  readonly personaId: string
  /** Where its feet are (scene x). */
  readonly x: number
  frame(dt: number, t: number, near: Near, mouse: THREE.Vector3): void
  say(text: string, emotion: Emotion, aloud: boolean): Promise<void>
  feel(e: Emotion): void
  setAsleep(asleep: boolean): void
  setVisible(v: boolean): void
  dance(move: DanceMove | null): void
  /** Standing still on the same ledge as the main character, right beside it. */
  readonly settled: boolean
  /** A pose for doing something together (null when done). */
  act(pose: BodyPose | null): void
  emote(emoji: string): void
  setLook(p: Progress): void
  dispose(): void
}

/** Where the main character is, for the friend to follow. */
export interface Near {
  /** The main character to stand beside, or null to stay put (it's being held, falling, peeking...). */
  x: number | null
  /** What it's standing on (when x isn't null). */
  ledge: Ledge | null
  /** Where the main character is now, whatever it's doing. */
  main: number
  /** The taskbar. */
  floor: Ledge
  px: number
  /** How close to stand, as a share of the usual gap (closer for holding hands). */
  close: number
  /** Where to look (the main character, now and then), or null for the mouse. */
  gaze: THREE.Vector3 | null
  /** A window ledge as it is now, or null once it's gone or no longer has room to stand. */
  ledgeOf(id: number): Ledge | null
  /** Whether there's room to stand at x on that ledge (not covered by another window). */
  stands(x: number, id: number | null): boolean
}

interface Hop {
  from: { x: number; y: number }
  to: { x: number; y: number }
  ledge: Ledge
  start: number
  seconds: number
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
  /** -1 behind the main character, 1 in front, 0 level with it. */
  let depth = 0
  let lane = 0
  let y = 0
  /** What it's standing on. */
  let on: Ledge | null = null
  let hop: Hop | null = null
  let landedAt = -1
  let settled = false
  let acting: BodyPose | null = null
  function hopTo(ledge: Ledge, toX: number, t: number, from = { x, y }): void {
    const to = { x: Math.min(ledge.right, Math.max(ledge.left, toX)), y: ledge.y }
    hop = { from, to, ledge, start: t, seconds: hopSeconds(from, to, px) }
    lane = 0
  }
  const resting = restingFor(personaId, persona.resting ?? 'neutral', true)
  character.setEmotion(resting)
  character.setLook?.(resolveLook(personaId, 'auto', 'auto', progress))
  character.wave()

  return {
    personaId,
    get x() {
      return x
    },
    get settled() {
      return settled
    },
    act(pose) {
      acting = pose
    },
    emote(emoji) {
      character.emote?.(emoji)
    },
    frame(dt, t, near, mouse) {
      if (near.px !== px) px = near.px
      const gap = px * 0.62 * near.close
      if (!on) {
        on = near.floor
        y = on.y
        x = want = besideOn(on, near.main, gap)
      }
      // Its own window moved, or closed under it.
      if (!hop && on.id !== null) {
        const now = near.ledgeOf(on.id)
        if (!now) hopTo(near.floor, x, t)
        else {
          x += now.left - on.left
          want += now.left - on.left
          y = now.y
          on = now
        }
      }
      // Follows the main character: walks over on the same ledge, or jumps up (or down) to it.
      if (!hop && near.x !== null && near.ledge) {
        const dest = near.ledge
        const spot = besideOn(dest, near.x, gap, (sx) => near.stands(sx, dest.id), dest.id === on.id ? x - near.x : 1)
        if (dest.id === on.id) {
          on = dest
          y = dest.y
          want = spot
        } else {
          const closest = Math.min(on.right, Math.max(on.left, spot))
          const down = dest.y < y - 1
          if (down || Math.abs(spot - x) <= px * JUMP_REACH || Math.abs(closest - x) < 4) hopTo(dest, spot, t)
          else want = closest
        }
      }
      let walking = false
      let crossing = false
      if (hop) {
        const p = Math.min(1, (t - hop.start) / hop.seconds)
        const at = hopAt(hop.from, hop.to, p, px)
        x = at.x
        y = at.y
        if (p >= 1) {
          // Lands, if the window's still there; otherwise it keeps going down to the taskbar.
          const still = hop.ledge.id === null ? near.floor : near.ledgeOf(hop.ledge.id)
          const done = hop
          hop = null
          if (still) {
            on = still
            y = still.y
            want = x
            landedAt = t
          } else hopTo(near.floor, x, t, done.to)
        }
      } else {
        walking = Math.abs(want - x) > 4
        // Passing the main character: step in front of it or behind it (picked each time), not through it.
        // (Also when the main character walks past, or is dropped, where this one is standing.)
        const sameLedge = near.x !== null && near.ledge?.id === on.id
        crossing = sameLedge && (crossesMain(x, want, near.main, px) || Math.abs(x - near.main) < px * 0.45)
      }
      if (crossing && lane === 0) lane = Math.random() < 0.5 ? -1 : 1
      if (!crossing) lane = 0
      depth += Math.sign(lane - depth) * Math.min(Math.abs(lane - depth), dt * 3.5)
      // Slows down to step aside first.
      const aside = crossing && Math.abs(lane - depth) > 0.4 ? 0.3 : 1
      const step = 160 * (px / 260) * dt * aside
      if (walking) x += Math.sign(want - x) * Math.min(step, Math.abs(want - x))
      if (!hop) x = Math.min(on.right, Math.max(on.left, x))
      const bob = walking ? Math.abs(Math.sin(t * 10)) * 3 : 0
      const look = laneLook(depth, px)
      character.root.scale.setScalar((px * 0.92 * look.scale) / character.height)
      // A little squash on take-off and landing.
      const squash = hop ? Math.max(0, 1 - (t - hop.start) / 0.12) : Math.max(0, 1 - (t - landedAt) / 0.18)
      holder.scale.set(1 + squash * 0.12, 1 - squash * 0.16, 1 + squash * 0.12)
      stage.position.set(x, y + bob + look.lift, look.z)
      settled = !hop && !walking && near.x !== null && near.ledge?.id === on.id && Math.abs(Math.abs(x - near.main) - gap) < 6
      character.setPartner?.(near.main < x ? -1 : 1)
      if (!dancing) character.setPose?.(asleep ? 'sleep' : walking || hop ? 'walk' : acting)
      character.lookAt(near.gaze ?? mouse)
      character.setBlink(asleep ? 1 : blinkAmount(t, 1.7))
      character.setActivity?.(asleep ? 'sleeping' : dancing ? 'dancing' : 'idle')
      character.setMouth(mouth)
      character.update(dt, t)
      const top = window.innerHeight - (y + look.lift + px * 0.92 * look.scale + 12)
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
