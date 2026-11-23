// Picking the character up, swinging, dropping and throwing it.
// Scene units: pixels, x to the right, y up. The body's x and y are where its feet are.

export interface Body {
  x: number
  y: number
  vx: number
  vy: number
  /** How far it swings round the point it's held by, in radians (anticlockwise is positive). */
  angle: number
  spin: number
}

export interface World {
  left: number
  right: number
  /** The highest the feet may go. */
  top: number
  /** The surface under x that the feet would land on, coming down from fromY. */
  ground(x: number, fromY: number): number
}

export const GRAVITY = 3200
/** Landing faster than this bounces. */
const BOUNCE_SPEED = 420
const BOUNCINESS = 0.38

export function newBody(x: number, y: number): Body {
  return { x, y, vx: 0, vy: 0, angle: 0, spin: 0 }
}

/**
 * Held by the mouse: follows the hand exactly, and swings like a pendulum when moved.
 * @param length how far below the hand its middle hangs, in pixels
 */
export function holdStep(b: Body, x: number, y: number, dt: number, length: number): void {
  if (dt <= 0) return
  const k = Math.min(1, dt * 30)
  const vx = b.vx + ((x - b.x) / dt - b.vx) * k
  const vy = b.vy + ((y - b.y) / dt - b.vy) * k
  const ax = (vx - b.vx) / dt
  b.vx = vx
  b.vy = vy
  b.x = x
  b.y = y
  // A pendulum on a moving hand: g sin(a) pulls it back down, the hand's acceleration swings it.
  const accel = -(GRAVITY * Math.sin(b.angle) + ax * Math.cos(b.angle)) / Math.max(40, length) - b.spin * 3.2
  b.spin += accel * dt
  b.angle = clamp(b.angle + b.spin * dt, -1.2, 1.2)
}

export interface Impact {
  /** How fast it hit, in pixels per second. */
  speed: number
  /** It bounced back up (a hard landing). */
  bounced: boolean
}

/**
 * One step of falling (or resting, or sliding along the ground).
 * Returns the landing when the feet touch down this step.
 */
export function fallStep(b: Body, dt: number, world: World): Impact | null {
  if (dt <= 0) return null
  const fromY = b.y
  const floor = world.ground(b.x, fromY)
  const resting = b.y <= floor + 0.5 && b.vy <= 0
  // Swing back upright: quickly on the ground, gently in the air.
  const stiff = resting ? 120 : 40
  b.spin += (-b.angle * stiff - b.spin * (resting ? 14 : 4)) * dt
  b.angle = clamp(b.angle + b.spin * dt, -1.2, 1.2)

  if (resting) {
    b.y = floor
    b.vy = 0
    b.vx *= Math.exp(-dt * 7)
    if (Math.abs(b.vx) < 6) b.vx = 0
    b.x += b.vx * dt
    bounceOffWalls(b, world)
    // Slid off the edge of a window: start falling again.
    const below = world.ground(b.x, b.y)
    if (below < b.y - 0.5) b.vy = -1
    return null
  }

  b.vy -= GRAVITY * dt
  b.x += b.vx * dt
  b.y += b.vy * dt
  bounceOffWalls(b, world)
  if (b.y > world.top) {
    b.y = world.top
    b.vy = Math.min(0, b.vy)
  }
  const land = world.ground(b.x, fromY)
  if (b.y > land) return null
  const speed = -b.vy
  b.y = land
  if (speed > BOUNCE_SPEED) {
    b.vy = speed * BOUNCINESS
    b.vx *= 0.7
    return { speed, bounced: true }
  }
  b.vy = 0
  return { speed, bounced: false }
}

/** Lying still on the ground. */
export function atRest(b: Body, world: World): boolean {
  return b.vx === 0 && b.vy === 0 && Math.abs(b.y - world.ground(b.x, b.y)) < 0.5 && Math.abs(b.angle) < 0.01
}

function bounceOffWalls(b: Body, world: World): void {
  if (b.x < world.left) {
    b.x = world.left
    b.vx = Math.abs(b.vx) * 0.5
  } else if (b.x > world.right) {
    b.x = world.right
    b.vx = -Math.abs(b.vx) * 0.5
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}
