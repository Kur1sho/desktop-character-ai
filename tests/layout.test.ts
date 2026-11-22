import { describe, expect, it } from 'vitest'
import { computeLayout, findTaskbarEdge } from '../src/shared/layout'

const screen = { x: 0, y: 0, width: 1920, height: 1080 }

describe('findTaskbarEdge', () => {
  it('finds a bottom taskbar', () => {
    expect(findTaskbarEdge(screen, { x: 0, y: 0, width: 1920, height: 1032 })).toBe('bottom')
  })
  it('finds a top taskbar', () => {
    expect(findTaskbarEdge(screen, { x: 0, y: 48, width: 1920, height: 1032 })).toBe('top')
  })
  it('finds a left taskbar', () => {
    expect(findTaskbarEdge(screen, { x: 62, y: 0, width: 1858, height: 1080 })).toBe('left')
  })
  it('finds a right taskbar', () => {
    expect(findTaskbarEdge(screen, { x: 0, y: 0, width: 1858, height: 1080 })).toBe('right')
  })
  it('reports none for an auto-hidden taskbar', () => {
    expect(findTaskbarEdge(screen, screen)).toBe('none')
  })
})

describe('computeLayout', () => {
  it('stands the character on top of a bottom taskbar', () => {
    const layout = computeLayout(screen, { x: 0, y: 0, width: 1920, height: 1032 }, 0.5)
    expect(layout.anchor).toEqual({ x: 960, y: 1032 })
  })
  it('works on a second monitor with an offset', () => {
    const second = { x: 1920, y: -200, width: 2560, height: 1440 }
    const work = { x: 1920, y: -200, width: 2560, height: 1392 }
    const layout = computeLayout(second, work, 0)
    expect(layout.anchor).toEqual({ x: 0, y: 1392 })
    expect(layout.edge).toBe('bottom')
  })
  it('keeps the character on screen for out-of-range positions', () => {
    const layout = computeLayout(screen, { x: 0, y: 0, width: 1920, height: 1032 }, 3)
    expect(layout.anchor.x).toBe(1920)
  })
})
