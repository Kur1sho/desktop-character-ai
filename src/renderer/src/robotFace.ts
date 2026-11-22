// Robotico's face is a little LED screen, so every expression is just a
// drawing. This draws one frame of the face onto a small canvas (shown with
// chunky pixels), and says which emoji should pop up over his head.
import type { Emotion } from '@shared/personas'

/** What he's doing, which can change the face whatever the emotion. */
export type Activity = 'idle' | 'listening' | 'thinking' | 'dancing'

export interface FaceState {
  emotion: Emotion
  activity: Activity
  /** 0 = eyes open, 1 = closed. */
  blink: number
  /** 0 = closed, 1 = wide open (talking). */
  mouth: number
  /** Seconds, for animation. */
  time: number
  /** Where he's looking, -1 to 1 on each axis (screen x right, y up). */
  lookX: number
  lookY: number
  /** Seconds since the emotion last changed, for little entrance animations. */
  since: number
}

/** Screen size in LED pixels. */
export const FACE_W = 120
export const FACE_H = 80

const TEAL = '#2de0dc'
const COLORS: Record<Emotion, string> = {
  neutral: TEAL,
  happy: TEAL,
  laughing: '#ffd44a',
  excited: '#ffd44a',
  love: '#ff6fa8',
  angry: '#ff5a4e',
  sad: '#6aa8ff',
  scared: '#b48cff',
  surprised: TEAL,
  confused: '#ffb347',
  flustered: '#ff8fb8',
  smug: TEAL,
  sleepy: '#7fc8c6'
}
const BG = '#0d171d'

/** The emoji that pops up over his head when he starts feeling this, if any. */
export const POPUPS: Partial<Record<Emotion, string[]>> = {
  angry: ['💢'],
  sad: ['💧'],
  surprised: ['❗'],
  scared: ['💦', '❗'],
  confused: ['❓'],
  flustered: ['💦'],
  love: ['❤️', '💕'],
  excited: ['✨'],
  laughing: ['🤣'],
  sleepy: ['💤']
}

/** Emoji for an activity, shown now and then while it lasts. */
export const ACTIVITY_POPUPS: Partial<Record<Activity, string[]>> = {
  dancing: ['🎵', '🎶'],
  thinking: ['💭']
}

const L = { x: 38, y: 34 }
const R = { x: 82, y: 34 }

export function drawFace(ctx: CanvasRenderingContext2D, s: FaceState): void {
  const color = COLORS[s.emotion]
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, FACE_W, FACE_H)
  ctx.save()
  // A little glow, like a real LED screen.
  ctx.shadowColor = color
  ctx.shadowBlur = 4
  ctx.fillStyle = color
  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // Eyes drift toward where he's looking.
  const dx = Math.round(s.lookX * 4)
  const dy = Math.round(-s.lookY * 3)
  // Scared shivers; laughing bounces.
  const shake = s.emotion === 'scared' ? Math.round(Math.sin(s.time * 60)) : 0
  const bounce = s.emotion === 'laughing' ? Math.round(Math.abs(Math.sin(s.time * 12)) * -3) : 0
  ctx.translate(dx + shake, dy + bounce)
  // Draw a bit bigger than the layout grid so the face fills the screen.
  ctx.translate(60, 47)
  ctx.scale(1.25, 1.25)
  ctx.translate(-60, -47)

  if (s.activity === 'thinking') {
    thinkingFace(ctx, s)
  } else {
    eyes(ctx, s)
    if (s.mouth > 0.06) talkingMouth(ctx, s)
    else if (s.activity === 'listening') listeningMouth(ctx, s)
    else mouth(ctx, s)
    extras(ctx, s, color)
  }
  ctx.restore()
  scanlines(ctx)
}

// --- Eyes ---------------------------------------------------------------

function eyes(ctx: CanvasRenderingContext2D, s: FaceState): void {
  const open = 1 - s.blink
  for (const [i, c] of [L, R].entries()) {
    const side = i === 0 ? -1 : 1
    switch (s.emotion) {
      case 'happy':
        arc(ctx, c.x, c.y + 4, 7, Math.PI * 1.15, Math.PI * 1.85, 4) // ^ ^
        break
      case 'laughing':
        chevron(ctx, c.x, c.y, 7, side) // > <
        break
      case 'excited':
        star(ctx, c.x, c.y, 10 + Math.sin(s.time * 8) * 1.5, s.time * 1.5)
        break
      case 'love':
        heart(ctx, c.x, c.y, 9 + Math.sin(s.time * 7) * 1.5)
        break
      case 'angry':
        block(ctx, c.x, c.y + 2, 13, 13 * open)
        cutCorner(ctx, c.x, c.y + 2, 13, 13, side, 'inner')
        line(ctx, c.x - 9 * side, c.y - 11, c.x + 5 * side, c.y - 5, 3) // brows down in the middle
        break
      case 'sad':
        block(ctx, c.x, c.y + 3, 12, 14 * open)
        cutCorner(ctx, c.x, c.y + 3, 12, 14, side, 'outer')
        if (i === 1) tear(ctx, c.x + 4, c.y + 10, s.time)
        break
      case 'surprised':
        ring(ctx, c.x, c.y, 10 * Math.max(0.15, open), 3)
        dot(ctx, c.x, c.y, 3)
        break
      case 'scared':
        ring(ctx, c.x, c.y, 8 * Math.max(0.15, open), 2)
        dot(ctx, c.x, c.y + 1, 2)
        break
      case 'confused':
        if (i === 0) block(ctx, c.x, c.y, 12, 18 * open)
        else line(ctx, c.x - 6, c.y + 1, c.x + 6, c.y + 1, 3)
        if (i === 0) line(ctx, c.x - 7, c.y - 14, c.x + 6, c.y - 12, 2)
        break
      case 'flustered':
        swirl(ctx, c.x, c.y, s.time * 6 * side)
        break
      case 'smug':
        block(ctx, c.x, c.y + 4, 13, 7 * open)
        line(ctx, c.x - 7, c.y - 1, c.x + 7, c.y - 1 - side * 1, 2) // heavy lids
        break
      case 'sleepy':
        arc(ctx, c.x, c.y - 2, 7, Math.PI * 0.15, Math.PI * 0.85, 3) // closed, drooping
        break
      default:
        block(ctx, c.x, c.y, 12, 18 * open)
    }
  }
}

function thinkingFace(ctx: CanvasRenderingContext2D, s: FaceState): void {
  // Eyes glance up and to the side, and a loading bar of dots runs below.
  for (const c of [L, R]) block(ctx, c.x + 5, c.y - 5, 10, 12 * (1 - s.blink))
  for (let i = 0; i < 3; i++) {
    const lit = Math.floor(s.time * 4) % 3 === i
    ctx.globalAlpha = lit ? 1 : 0.3
    dot(ctx, 50 + i * 10, 62, lit ? 3.2 : 2.5)
  }
  ctx.globalAlpha = 1
}

// --- Mouths -------------------------------------------------------------

function mouth(ctx: CanvasRenderingContext2D, s: FaceState): void {
  const y = 60
  switch (s.emotion) {
    case 'happy':
    case 'love':
      arc(ctx, 60, y - 6, 8, Math.PI * 0.2, Math.PI * 0.8, 3)
      break
    case 'laughing':
    case 'excited':
      // Big open "D" smile.
      ctx.beginPath()
      ctx.moveTo(48, y - 3)
      ctx.lineTo(72, y - 3)
      ctx.quadraticCurveTo(72, y + 9, 60, y + 9)
      ctx.quadraticCurveTo(48, y + 9, 48, y - 3)
      ctx.fill()
      break
    case 'angry':
    case 'sad':
      arc(ctx, 60, y + 7, 8, Math.PI * 1.2, Math.PI * 1.8, 3)
      break
    case 'surprised':
      ring(ctx, 60, y, 4.5, 2.5)
      break
    case 'sleepy':
      ring(ctx, 60, y, 2.5 + Math.sin(s.time * 1.5) * 0.6, 2)
      break
    case 'scared':
    case 'flustered':
    case 'confused':
      wave(ctx, 50, y, 20, s.emotion === 'scared' ? s.time * 20 : 0)
      break
    case 'smug':
      ctx.beginPath()
      ctx.moveTo(52, y)
      ctx.quadraticCurveTo(62, y + 3, 70, y - 4)
      ctx.lineWidth = 3
      ctx.stroke()
      break
    default:
      line(ctx, 54, y, 66, y, 3)
  }
}

function talkingMouth(ctx: CanvasRenderingContext2D, s: FaceState): void {
  const h = 2 + s.mouth * 11
  const w = 12 + s.mouth * 4
  roundRect(ctx, 60 - w / 2, 60 - h / 2, w, h, Math.min(4, h / 2))
}

function listeningMouth(ctx: CanvasRenderingContext2D, s: FaceState): void {
  // A little sound wave: "I'm hearing you".
  for (let i = 0; i < 7; i++) {
    const h = 2 + Math.abs(Math.sin(s.time * 9 + i * 1.3)) * 8
    ctx.fillRect(45 + i * 5, 60 - h / 2, 3, h)
  }
}

// --- Extras: blush, zzz, sparkles ------------------------------------------

function extras(ctx: CanvasRenderingContext2D, s: FaceState, color: string): void {
  if (s.emotion === 'flustered' || s.emotion === 'love') {
    ctx.save()
    ctx.shadowBlur = 0
    ctx.strokeStyle = '#ff7aa8'
    for (const x of [18, 94]) for (let k = 0; k < 3; k++) line(ctx, x + k * 4, 54, x + k * 4 + 3, 49, 1.5)
    ctx.restore()
  }
  if (s.emotion === 'sleepy') {
    ctx.save()
    ctx.font = 'bold 9px monospace'
    for (let k = 0; k < 2; k++) {
      const p = (s.time * 0.5 + k * 0.5) % 1
      ctx.globalAlpha = 1 - p
      ctx.fillText('z', 92 + p * 10, 26 - p * 18)
    }
    ctx.restore()
  }
  if (s.emotion === 'excited') {
    ctx.save()
    for (const [x, y, ph] of [[14, 14, 0], [104, 18, 2], [100, 64, 4]] as const) {
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(s.time * 6 + ph)
      star(ctx, x, y, 4, 0)
    }
    ctx.restore()
  }
  if (s.emotion === 'confused') {
    ctx.save()
    ctx.font = 'bold 14px monospace'
    ctx.fillStyle = color
    ctx.fillText('?', 100, 22 + Math.sin(s.time * 3) * 2)
    ctx.restore()
  }
}

function scanlines(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  for (let y = 0; y < FACE_H; y += 2) ctx.fillRect(0, y, FACE_W, 1)
}

// --- Shapes -------------------------------------------------------------

function block(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const hh = Math.max(2, h)
  roundRect(ctx, x - w / 2, y - hh / 2, w, hh, Math.min(3, hh / 2))
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
}

/** Cuts a slanted corner off an eye (angry: inner top, sad: outer top). */
function cutCorner(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  side: number,
  which: 'inner' | 'outer'
): void {
  const top = y - h / 2 - 1
  const inner = x - (side * w) / 2 - side
  const outer = x + (side * w) / 2 + side
  const near = which === 'inner' ? inner : outer
  const far = which === 'inner' ? outer : inner
  ctx.save()
  ctx.shadowBlur = 0
  ctx.fillStyle = BG
  ctx.beginPath()
  ctx.moveTo(near, top)
  ctx.lineTo(far, top)
  ctx.lineTo(near, top + h * 0.6)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, w: number): void {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.lineWidth = w
  ctx.stroke()
}

function arc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, a: number, b: number, w: number): void {
  ctx.beginPath()
  ctx.arc(x, y, r, a, b)
  ctx.lineWidth = w
  ctx.stroke()
}

function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, w: number): void {
  arc(ctx, x, y, r, 0, Math.PI * 2, w)
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

function chevron(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, side: number): void {
  // Left eye ">", right eye "<": tightly shut with laughter.
  ctx.beginPath()
  ctx.moveTo(x - side * r * 0.6, y - r)
  ctx.lineTo(x + side * r * 0.6, y)
  ctx.lineTo(x - side * r * 0.6, y + r)
  ctx.lineWidth = 3.5
  ctx.stroke()
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number): void {
  ctx.beginPath()
  for (let k = 0; k < 10; k++) {
    const a = rot - Math.PI / 2 + (k * Math.PI) / 5
    const rr = k % 2 === 0 ? r : r * 0.45
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
  }
  ctx.closePath()
  ctx.fill()
}

function heart(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x, y + r * 0.9)
  ctx.bezierCurveTo(x - r * 1.4, y - r * 0.1, x - r * 0.7, y - r * 1.1, x, y - r * 0.35)
  ctx.bezierCurveTo(x + r * 0.7, y - r * 1.1, x + r * 1.4, y - r * 0.1, x, y + r * 0.9)
  ctx.fill()
}

function swirl(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number): void {
  ctx.beginPath()
  for (let k = 0; k <= 40; k++) {
    const a = rot + k * 0.42
    const r = 1 + k * 0.2
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
  }
  ctx.lineWidth = 2
  ctx.stroke()
}

function wave(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, phase: number): void {
  ctx.beginPath()
  for (let k = 0; k <= w; k++) ctx.lineTo(x + k, y + Math.sin(k * 0.8 + phase) * 2)
  ctx.lineWidth = 2.5
  ctx.stroke()
}

function tear(ctx: CanvasRenderingContext2D, x: number, y: number, time: number): void {
  // A tear that wells up, runs down the cheek, and starts again.
  const p = (time * 0.6) % 1
  ctx.save()
  ctx.shadowBlur = 0
  ctx.fillStyle = '#9fd0ff'
  ctx.globalAlpha = p < 0.85 ? 1 : (1 - p) / 0.15
  const ty = y + p * 22
  ctx.beginPath()
  ctx.moveTo(x, ty - 4)
  ctx.quadraticCurveTo(x + 3, ty, x, ty + 2)
  ctx.quadraticCurveTo(x - 3, ty, x, ty - 4)
  ctx.fill()
  ctx.restore()
}
