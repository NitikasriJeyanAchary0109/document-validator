import { describe, expect, it } from 'vitest'
import { estimateTilt } from './deskew'

/** A light page with rows of dark dashes (like lines of text), the whole thing turned clockwise by `deg`. */
function page(deg: number, w = 480, h = 300, rows = 9): Float32Array {
  const g = new Float32Array(w * h).fill(230)
  const rad = (deg * Math.PI) / 180
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  const cx = w / 2
  const cy = h / 2
  // Walk the level page in small steps, turn each point, and paint it dark.
  for (let r = 0; r < rows; r++) {
    const y0 = 40 + r * 26
    for (let x0 = 60; x0 < w - 60; x0++) {
      // dashes 7 wide with 3 gaps, 6 tall
      if (x0 % 10 > 6) continue
      for (let dy = 0; dy < 6; dy++) {
        const dx = x0 - cx
        const dyy = y0 + dy - cy
        const x = Math.round(cx + dx * c - dyy * s)
        const y = Math.round(cy + dx * s + dyy * c)
        if (x >= 0 && x < w && y >= 0 && y < h) g[y * w + x] = 40
      }
    }
  }
  return g
}

describe('estimateTilt', () => {
  it('finds a clockwise tilt', () => {
    expect(estimateTilt(page(6), 480, 300)).toBeGreaterThan(5)
    expect(estimateTilt(page(6), 480, 300)).toBeLessThan(7)
  })

  it('finds an anticlockwise tilt as a negative number', () => {
    expect(estimateTilt(page(-5), 480, 300)).toBeLessThan(-4)
    expect(estimateTilt(page(-5), 480, 300)).toBeGreaterThan(-6)
  })

  it('reads a level page as about zero', () => {
    expect(Math.abs(estimateTilt(page(0), 480, 300))).toBeLessThan(0.6)
  })

  it('gives no opinion on a blank page', () => {
    expect(estimateTilt(new Float32Array(480 * 300).fill(230), 480, 300)).toBe(0)
  })

  it('gives no opinion on a page that is mostly dark', () => {
    expect(estimateTilt(new Float32Array(480 * 300).fill(20), 480, 300)).toBe(0)
  })
})
