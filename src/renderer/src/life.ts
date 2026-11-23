// Everything that makes the character feel alive on the desktop when you're not
// talking to it: head pats and pokes, being picked up and thrown, sitting on windows,
// idle routines, napping while you're away, hiding during games, playing with the
// mouse pointer, its own little comments, and the friend.
import * as THREE from 'three'
import type { CompanionApi } from '@shared/ipc'
import type { Layout } from '@shared/layout'
import type { Emotion } from '@shared/personas'
import type { Settings } from '@shared/settings'
import { PatDetector, PokeCounter } from '@shared/pet'
import { fallStep, holdStep, newBody, type World } from '@shared/physics'
import { followWindow, surfaceAt, type WinRect } from '@shared/perch'
import { nextRoutineIn, pickRoutine, ROUTINE_SECONDS, type Routine } from '@shared/routines'
import { AWAY_SEC, Chatter, type ChatterEvent, type Presence } from '@shared/chatter'
import { greetingFor, lifeLine, type LifeMoment } from '@shared/lifeLines'
import { EMPTY_PROGRESS, newlyUnlocked, resolveLook, type Progress, type Stat } from '@shared/cosmetics'
import { BANTER, pickBanter } from '@shared/banter'
import type { BodyPose, Character, DanceMove } from './character'
import { createFriend, type Friend } from './friend'

export interface LifeDeps {
  api: CompanionApi | null
  scene: THREE.Scene
  groups: { hang: THREE.Group; hangInner: THREE.Group; pivot: THREE.Group; body: THREE.Group }
  character(): Character | null
  settings(): Settings
  /** The character's height on screen, in pixels. */
  px(): number
  /** Talking, listening, thinking, a question open or the text box showing. */
  busy(): boolean
  /** A speech bubble is up. */
  bubbleShowing(): boolean
  dancing(): boolean
  /** Says a line in the bubble (and out loud if voice is on). */
  say(text: string, emotion: Emotion): Promise<void>
  feel(e: Emotion): void
  hideChat(): void
  summon(): void
  setPassThrough(p: boolean): void
  overChat(x: number, y: number): boolean
  /** The character's box on screen, in window coordinates. */
  screenBox(): THREE.Box2 | null
}

export interface Spot {
  /** Feet position, scene coordinates (y up). */
  x: number
  y: number
  /** Standing on the taskbar (so it can pop up out of it). */
  onFloor: boolean
}

const now = () => performance.now()

export function createLife(d: LifeDeps) {
  const body = newBody(0, 0)
  let layout: Layout | null = null
  let placed = false
  let home = 0
  let wins: WinRect[] = []
  /** The window it's sitting on, as it was last seen. */
  let perch: WinRect | null = null
  let perchCheck = 0

  // Holding and throwing.
  let press: { x: number; y: number; grabX: number; grabY: number } | null = null
  let held = false
  let wasHeld = false
  let falling = false
  let fallImpact = 0
  let lastGrabLine = -Infinity
  let lastDropLine = -Infinity

  // Pats and pokes.
  const pats = new PatDetector()
  const pokes = new PokeCounter()
  let patStarted = 0
  let lastHeart = 0
  let patLineAt = -Infinity
  let patMoreSaid = false
  let squashAt = -Infinity

  // Routines, walking and peeking.
  let routine: { name: Routine; until: number; data?: number } | null = null
  let nextRoutine = now() + nextRoutineIn() * 1000
  let walkTo: number | null = null
  let walkThen: (() => void) | null = null
  let peekSide = 0
  let lookOverride: THREE.Vector3 | null = null

  // Sleep, games and chatter.
  let presence: Presence = { idleSec: 0, game: null }
  let activeSince = now()
  let asleep = false
  let hiddenForGame = false
  let hideAt = 0
  let shownUntil = 0
  const chatter = new Chatter('rare')
  let progress: Progress = { ...EMPTY_PROGRESS }
  let progressCheck = 0
  let progressLoaded = false

  // Playing with the mouse pointer.
  const mouse = { x: -1, y: -1, movedAt: 0 }
  let nextCursorPlay = now() + 90_000

  // The friend.
  let friend: Friend | null = null
  let lastBanter = -1
  let bantering = false

  const scale = () => d.px() / 260
  const H = () => window.innerHeight
  const floorWinY = () => (layout ? layout.anchor.y : H() - 20)
  const minTop = () => d.px() * 0.85

  function world(): World {
    const wa = layout?.workArea ?? { x: 0, y: 0, width: window.innerWidth, height: H() }
    const margin = d.px() * 0.22
    const peekRoom = routine?.name === 'peek' ? d.px() * 0.5 : 0
    let left = wa.x + margin - peekRoom
    let right = wa.x + wa.width - margin + peekRoom
    // Standing just past the edge after peeking: it walks back rather than jumping.
    if (!falling && !held) {
      left = Math.min(left, body.x)
      right = Math.max(right, body.x)
    }
    return {
      left,
      right,
      top: H() - d.px() * 0.9,
      ground: (x, fromY) => H() - surfaceAt(x, H() - fromY, wins, floorWinY(), minTop()).y
    }
  }

  const onFloor = () => !held && !falling && perch === null && Math.abs(body.y - (H() - floorWinY())) < 1

  function line(moment: LifeMoment, fill?: Record<string, string>): Promise<void> {
    const l = lifeLine(d.settings().personaId, moment, fill)
    return d.say(l.text, l.emotion)
  }

  function setPose(p: BodyPose | null): void {
    d.character()?.setPose?.(p)
  }

  function stopRoutine(): void {
    if (!routine) return
    if (routine.name === 'yawn') d.feel('neutral')
    const peeking = routine.name === 'peek'
    routine = null
    walkTo = null
    walkThen = null
    lookOverride = null
    peekSide = 0
    setPose(null)
    // Interrupted while peeking off the edge: come back on screen.
    if (peeking) walk(home)
  }

  function wake(): void {
    if (!asleep) return
    asleep = false
    friend?.setAsleep(false)
    setPose(null)
    d.feel('surprised')
    setTimeout(() => d.feel('neutral'), 1200)
  }

  async function stat(s: Stat): Promise<void> {
    if (!d.api) return
    const next = await d.api.recordStat(s)
    gotProgress(next)
  }

  function gotProgress(next: Progress): void {
    const fresh = progressLoaded ? newlyUnlocked(progress, next) : []
    progressLoaded = true
    progress = next
    applyLook()
    if (fresh.length) void line('unlocked', { item: fresh.join(' and ') })
  }

  function applyLook(): void {
    const s = d.settings()
    d.character()?.setLook?.(resolveLook(s.personaId, s.hat, s.color, progress))
    friend?.setLook(progress)
  }

  // --- Mouse --------------------------------------------------------------

  function overCharacter(x: number, y: number): boolean {
    const box = d.screenBox()
    return Boolean(box && box.containsPoint(new THREE.Vector2(x, y)))
  }

  function overHead(x: number, y: number): boolean {
    const box = d.screenBox()
    if (!box || !box.containsPoint(new THREE.Vector2(x, y))) return false
    return y < box.min.y + (box.max.y - box.min.y) * 0.4
  }

  function mouseMove(e: MouseEvent): void {
    const t = now()
    if (Math.abs(e.clientX - mouse.x) + Math.abs(e.clientY - mouse.y) > 2) mouse.movedAt = t
    mouse.x = e.clientX
    mouse.y = e.clientY
    if (press) {
      if (!held && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) pickUp()
      return
    }
    if (hiddenForGame) return d.setPassThrough(true)
    d.setPassThrough(!(overCharacter(e.clientX, e.clientY) || d.overChat(e.clientX, e.clientY)))
    // Rubbing the head (no buttons pressed) is a pat.
    if (e.buttons === 0 && overHead(e.clientX, e.clientY) && !d.dancing()) {
      const p = pats.move(e.clientX, t)
      if (p) patting(p, t)
    } else pats.reset()
  }

  function patting(p: 'start' | 'more', t: number): void {
    wake()
    stopRoutine()
    const c = d.character()
    if (p === 'start') {
      patStarted = t
      patMoreSaid = false
      const l = lifeLine(d.settings().personaId, 'pat')
      d.feel(l.emotion)
      friend?.feel('angry')
      void stat('pats')
      if (t - patLineAt > 25_000 && !d.busy()) {
        patLineAt = t
        void d.say(l.text, l.emotion)
      }
    } else if (!patMoreSaid && t - patStarted > 4000 && !d.busy()) {
      patMoreSaid = true
      void line('patMore')
    }
    if (t - lastHeart > 450) {
      lastHeart = t
      c?.emote?.(Math.random() < 0.7 ? '❤️' : '💕')
    }
  }

  function mouseDown(e: MouseEvent): void {
    if (hiddenForGame || e.button !== 0 || d.overChat(e.clientX, e.clientY)) return
    if (!overCharacter(e.clientX, e.clientY)) return
    pats.reset()
    // Where it was grabbed, relative to its feet (scene units).
    press = { x: e.clientX, y: e.clientY, grabX: e.clientX - body.x, grabY: H() - e.clientY - body.y }
  }

  function pickUp(): void {
    if (!press) return
    held = true
    wasHeld = true
    falling = false
    perch = null
    wake()
    stopRoutine()
    walkTo = null
    d.setPassThrough(false)
    const { hang, hangInner } = d.groups
    hang.position.set(press.grabX, press.grabY, 0)
    hangInner.position.set(-press.grabX, -press.grabY, 0)
    setPose('held')
    d.hideChat()
    d.feel('surprised')
    const t = now()
    if (t - lastGrabLine > 30_000 && !d.busy()) {
      lastGrabLine = t
      void line('grabbed')
    }
    // Find out where the windows are while it's held, ready for the drop.
    if (d.settings().sitOnWindows && d.api) void d.api.listWindows().then((w) => (wins = w))
  }

  function mouseUp(): void {
    press = null
    if (!held) return
    held = false
    falling = true
    fallImpact = 0
    // Throw speed is capped so it can't fly off at silly speeds.
    const cap = 4200 * Math.max(0.6, scale())
    body.vx = THREE.MathUtils.clamp(body.vx, -cap, cap)
    body.vy = THREE.MathUtils.clamp(body.vy, -cap, cap)
    setPose(null)
  }

  /** Double click waves, unless it's part of a flurry of pokes. */
  function dblclick(e: MouseEvent): boolean {
    if (hiddenForGame || d.overChat(e.clientX, e.clientY) || !overCharacter(e.clientX, e.clientY)) return false
    return pokes.count(now()) <= 2
  }

  /** A click that wasn't a drag. Returns true when it was poking (so the text box shouldn't open). */
  function click(e: MouseEvent): boolean {
    if (wasHeld) {
      wasHeld = false
      return true
    }
    if (hiddenForGame || d.overChat(e.clientX, e.clientY) || !overCharacter(e.clientX, e.clientY)) return true
    wake()
    const n = pokes.click(now())
    if (n < 3) return false
    // Poking.
    squashAt = now()
    stopRoutine()
    d.hideChat()
    friend?.feel('laughing')
    if (n === 3) void stat('pokes')
    if (n === 3 || n === 6) void line(n >= 6 ? 'pokeMany' : 'poke')
    else d.feel('angry')
    return true
  }

  // --- Settings, layout, presence ----------------------------------------------

  function layoutChanged(next: Layout): void {
    layout = next
    if (!placed) {
      placed = true
      home = next.anchor.x
      body.x = home
      body.y = H() - next.anchor.y
    } else {
      // The screen changed: drop back onto the taskbar.
      perch = null
      body.x = THREE.MathUtils.clamp(body.x, next.workArea.x, next.workArea.x + next.workArea.width)
      body.y = Math.max(body.y, H() - next.anchor.y)
      falling = true
    }
  }

  function settingsChanged(): void {
    const s = d.settings()
    chatter.level = s.chatter
    if (!s.sitOnWindows && perch) {
      perch = null
      wins = []
      falling = true
    }
    if (s.friend && (!friend || friend.personaId === s.personaId)) {
      friend?.dispose()
      friend = createFriend(d.scene, s.personaId, progress)
    } else if (!s.friend && friend) {
      friend.dispose()
      friend = null
    }
    applyLook()
  }

  function presenceChanged(p: Presence): void {
    const t = now()
    if (p.idleSec > 3) activeSince = t
    presence = p
    const s = d.settings()
    // Hide while a Steam game runs (after a word of good luck).
    const gaming = p.game !== null && s.hideInGames
    if (gaming && !hiddenForGame && !hideAt) hideAt = t + 5000
    if (!gaming) {
      hideAt = 0
      if (hiddenForGame) {
        hiddenForGame = false
        d.summon()
      }
    }
    if (hideAt && t >= hideAt && t >= shownUntil && !d.busy()) {
      hideAt = 0
      hiddenForGame = true
      stopRoutine()
      d.hideChat()
      d.setPassThrough(true)
    }
    // Napping while you're away.
    if (!asleep && p.idleSec >= AWAY_SEC && !d.busy() && !d.dancing() && !held) {
      asleep = true
      stopRoutine()
      setPose('sleep')
      d.feel('sleepy')
      friend?.setAsleep(true)
    } else if (asleep && p.idleSec < 3) wake()

    const event = chatter.tick(Date.now(), p, new Date().getHours(), {
      busy: d.busy() || d.bubbleShowing() || held || falling || bantering,
      friend: Boolean(friend) && !hiddenForGame
    })
    if (event) void speakUp(event)
    if (d.api && t > progressCheck) {
      progressCheck = t + 60_000
      void d.api.getProgress().then(gotProgress)
    }
  }

  async function speakUp(e: ChatterEvent): Promise<void> {
    if ('banter' in e) return banter()
    wake()
    await line(e.moment, e.fill)
  }

  async function banter(): Promise<void> {
    if (!friend || bantering) return
    bantering = true
    lastBanter = pickBanter(lastBanter)
    try {
      for (const l of BANTER[lastBanter]) {
        if (!friend || d.busy()) break
        // Wait for the bubble from the last line to go.
        if (l !== BANTER[lastBanter][0]) while (d.bubbleShowing() && !d.busy()) await new Promise((r) => setTimeout(r, 200))
        // Each character says its own lines, whichever one is the main one.
        if (l.who === friend.personaId) await friend.say(l.text, l.emotion, d.settings().voiceOutput)
        else await d.say(l.text, l.emotion)
        await new Promise((r) => setTimeout(r, 350))
      }
    } finally {
      bantering = false
    }
  }

  /** The first time today: a hello for the time of day. */
  async function greet(): Promise<void> {
    if (!d.api || d.settings().chatter === 'off') return
    if (!(await d.api.firstToday())) return
    setTimeout(() => {
      if (!d.busy() && !d.bubbleShowing()) void line(greetingFor(new Date().getHours()))
    }, 2500)
  }

  function summoned(): void {
    wake()
    stopRoutine()
    if (hiddenForGame) {
      hiddenForGame = false
      shownUntil = now() + 60_000
      hideAt = now() + 60_000
    }
  }

  // --- Routines -----------------------------------------------------------------

  function startRoutine(name: Routine): void {
    stopRoutine()
    const t = now()
    routine = { name, until: t + ROUTINE_SECONDS[name] * 1000 }
    const wa = layout?.workArea
    switch (name) {
      case 'lookAround':
        routine.data = Math.random() < 0.5 ? -1 : 1
        break
      case 'yawn':
        setPose('yawn')
        d.feel('sleepy')
        break
      case 'stretch':
        setPose('stretch')
        d.feel('happy')
        break
      case 'drum':
        setPose('drum')
        d.character()?.emote?.('🥁')
        break
      case 'wander': {
        const out = home + (Math.random() < 0.5 ? -1 : 1) * (80 + Math.random() * 140) * scale()
        walk(out, () => setTimeout(() => routine?.name === 'wander' && walk(home, () => stopRoutine()), 1500))
        routine.until = t + 20_000
        break
      }
      case 'peek': {
        if (!wa) return stopRoutine()
        const left = body.x - wa.x < wa.x + wa.width - body.x
        peekSide = left ? -1 : 1
        const edge = left ? wa.x - d.px() * 0.12 : wa.x + wa.width + d.px() * 0.12
        routine.until = t + 40_000
        walk(edge, () => {
          if (!routine) return
          routine.until = now() + ROUTINE_SECONDS.peek * 1000
          setPose('peek')
          if (d.settings().chatter !== 'off' && Math.random() < 0.35) void line('peek')
        })
        break
      }
    }
  }

  function walk(x: number, then?: () => void): void {
    const w = world()
    walkTo = THREE.MathUtils.clamp(x, w.left, w.right)
    walkThen = then ?? null
  }

  function routineFrame(t: number): void {
    if (asleep || held || falling || hiddenForGame || d.dancing()) return
    if (d.busy()) {
      if (routine && routine.name !== 'peek') stopRoutine()
      return
    }
    if (routine) {
      if (routine.name === 'peek' && walkTo === null && routine.data !== 1) {
        // Pops back out when the mouse comes near.
        if (Math.abs(mouse.x - body.x) < 160 * scale() && H() - mouse.y < body.y + d.px() * 1.4) routine.until = 0
      }
      if (t >= routine.until) {
        nextRoutine = t + nextRoutineIn() * 1000
        if (routine.name === 'peek' && routine.data !== 1) {
          // Walks back out (still allowed past the edge until it's back on screen).
          routine.data = 1
          routine.until = t + 30_000
          setPose(null)
          peekSide = 0
          walk(home, () => stopRoutine())
        } else stopRoutine()
      }
      return
    }
    if (walkTo !== null) return
    if (t >= nextRoutine) {
      nextRoutine = t + nextRoutineIn() * 1000
      const pick = pickRoutine({
        onFloor: onFloor(),
        userActive: presence.idleSec < 3,
        activeForSec: (t - activeSince) / 1000,
        hour: new Date().getHours(),
        mouseMoving: t - mouse.movedAt < 2000
      })
      if (pick) startRoutine(pick)
      return
    }
    cursorPlay(t)
  }

  /** Now and then (if turned on), creeps up on a resting mouse pointer near the taskbar and swats it. */
  function cursorPlay(t: number): void {
    if (!d.settings().cursorPlay || t < nextCursorPlay || !onFloor() || mouse.x < 0) return
    const restingFor = t - mouse.movedAt
    const dx = mouse.x - body.x
    const aboveFloor = floorWinY() - mouse.y
    if (restingFor < 1500 || Math.abs(dx) < 50 || Math.abs(dx) > 500 * Math.max(0.6, scale()) || aboveFloor < 0 || aboveFloor > d.px() * 1.2) return
    nextCursorPlay = t + (120 + Math.random() * 120) * 1000
    const stopAt = mouse.x - Math.sign(dx) * d.px() * 0.3
    const startedAt = mouse.movedAt
    routine = { name: 'wander', until: t + 15_000 }
    walk(stopAt, () => {
      if (mouse.movedAt !== startedAt) return stopRoutine()
      setPose('swat')
      d.character()?.emote?.('✨')
      if (d.settings().chatter !== 'off') void line('catchCursor')
      else d.feel('laughing')
      setTimeout(() => {
        stopRoutine()
        setTimeout(() => !routine && walk(home), 1200)
      }, 900)
    })
  }

  // --- Each frame ----------------------------------------------------------------

  function frame(dt: number, t: number): Spot {
    const ms = now()
    const { hang, hangInner, pivot, body: bodyGroup } = d.groups
    const w = world()

    if (held && press) {
      holdStep(body, mouse.x - press.grabX, H() - mouse.y - press.grabY, dt, Math.max(40, press.grabY - d.px() * 0.45))
    } else {
      if (walkTo !== null && !falling && !held && !asleep) {
        const step = 120 * scale() * dt
        const diff = walkTo - body.x
        setPose('walk')
        if (Math.abs(diff) <= step) {
          body.x = walkTo
          walkTo = null
          setPose(null)
          const then = walkThen
          walkThen = null
          then?.()
        } else body.x += Math.sign(diff) * step
      }
      const hit = fallStep(body, dt, w)
      if (hit) landed(hit.speed)
      if (falling && body.vy === 0 && Math.abs(body.vx) < 1) {
        falling = false
        settle()
      }
    }

    // Following the window it's sitting on.
    if (perch && !held && d.api && ms > perchCheck) {
      perchCheck = ms + 700
      const sitting = perch
      void d.api.listWindows().then((list) => {
        if (perch !== sitting || held) return
        wins = list
        const next = followWindow(sitting.id, body.x, sitting, list, floorWinY(), minTop())
        const win = list.find((x) => x.id === sitting.id)
        if (next && win) {
          body.x = next.x
          body.y = H() - next.y
          perch = win
        } else {
          perch = null
          falling = true
        }
      })
    }

    // Swing round the grab point; once it's upright again, swing round the middle.
    hang.rotation.z = body.angle
    if (!held && Math.abs(body.angle) < 0.002 && hang.position.y !== d.px() / 2) {
      hang.position.set(0, d.px() / 2, 0)
      hangInner.position.set(0, -d.px() / 2, 0)
    }
    // Walking bob, peeking lean, and the squish when poked.
    hangInner.position.y = -hang.position.y + (walkTo !== null ? Math.abs(Math.sin(t * 10)) * 4 * scale() : 0)
    if (!d.dancing()) {
      const lean = routine?.name === 'peek' && walkTo === null ? -peekSide * 0.28 : 0
      pivot.rotation.z += (lean - pivot.rotation.z) * Math.min(1, dt * 6)
    }
    const sq = (ms - squashAt) / 260
    const s = sq < 1 ? 1 - 0.14 * Math.sin(sq * Math.PI) : 1
    bodyGroup.scale.set(1 + (1 - s) * 0.6, s, 1 + (1 - s) * 0.6)

    // Look around during the routine, otherwise at the mouse.
    if (routine?.name === 'lookAround') {
      const p = 1 - (routine.until - ms) / (ROUTINE_SECONDS.lookAround * 1000)
      lookOverride = new THREE.Vector3(body.x + Math.sin(p * Math.PI * 2) * 500 * (routine.data ?? 1), H() * 0.55, 400)
    } else if (routine?.name === 'peek' && walkTo === null) {
      lookOverride = new THREE.Vector3(body.x - peekSide * 600, body.y + d.px() * 0.7, 400)
    } else lookOverride = null

    routineFrame(ms)
    if (pats.patting(ms) === false && patStarted && ms - patStarted > 1600) {
      patStarted = 0
      if (!d.busy()) d.feel('neutral')
    }

    if (friend) {
      const wa = layout?.workArea ?? { x: 0, width: window.innerWidth }
      friend.setVisible(!hiddenForGame)
      friend.frame(dt, t, {
        x: onFloor() && routine?.name !== 'peek' ? body.x : null,
        main: body.x,
        floor: H() - floorWinY(),
        px: d.px(),
        left: wa.x + d.px() * 0.25,
        right: wa.x + wa.width - d.px() * 0.25
      }, new THREE.Vector3(mouse.x, H() - mouse.y, 400))
    }
    return { x: body.x, y: body.y, onFloor: onFloor() }
  }

  function landed(speed: number): void {
    if (!falling) return
    const first = fallImpact === 0
    fallImpact = Math.max(fallImpact, speed)
    if (!first) return
    squashAt = now()
    const t = now()
    if (speed > 2300) {
      d.character()?.emote?.('💫')
      void line('thrown')
      lastDropLine = t
    } else if (speed > 900 && t - lastDropLine > 20_000 && !d.busy()) {
      lastDropLine = t
      void line('dropped')
    }
  }

  /** Came to rest after a drop: on the taskbar, or on a window. */
  function settle(): void {
    const s = surfaceAt(body.x, H() - body.y, wins, floorWinY(), minTop())
    if (s.id === null) {
      perch = null
      home = body.x
      if (fallImpact < 900) d.feel('neutral')
    } else {
      perch = wins.find((w) => w.id === s.id) ?? null
      if (perch && fallImpact <= 2300 && Math.random() < 0.5 && !d.busy()) void line('sitWindow')
    }
  }

  return {
    frame,
    mouseMove,
    mouseDown,
    mouseUp,
    click,
    dblclick,
    layoutChanged,
    settingsChanged,
    presenceChanged,
    summoned,
    greet,
    stat,
    /** The hat and colours being worn now. */
    look() {
      const s = d.settings()
      return resolveLook(s.personaId, s.hat, s.color, progress)
    },
    /** Where to look instead of the mouse (looking around, peeking), or null. */
    lookTarget(mouseVec: THREE.Vector3): THREE.Vector3 {
      return lookOverride ?? mouseVec
    },
    get asleep() {
      return asleep
    },
    get hidden() {
      return hiddenForGame
    },
    get held() {
      return held
    },
    dance(move: DanceMove | null) {
      friend?.dance(move)
    },
    /** Starts a routine now (for trying them out from the developer tools). */
    tryRoutine(name: Routine) {
      startRoutine(name)
    },
    /** For dancing: the friend's sleepy state etc. are reset when the character changes. */
    characterChanged() {
      applyLook()
      if (asleep) setPose('sleep')
    }
  }
}

export type Life = ReturnType<typeof createLife>
