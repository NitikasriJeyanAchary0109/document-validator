import { describe, expect, it } from 'vitest'
import { isSideways, isUpsideDown, turnedBox } from './orientation'

const wide = { x0: 10, y0: 10, x1: 110, y1: 30 }
const tall = { x0: 10, y0: 10, x1: 30, y1: 110 }

describe('turning boxes with the canvas', () => {
  it('moves a box on the left edge of a 200 tall canvas to the top, after a quarter turn clockwise', () => {
    expect(turnedBox({ x0: 0, y0: 50, x1: 20, y1: 150 }, 200)).toEqual({ x0: 50, y0: 0, x1: 150, y1: 20 })
  })
  it('makes a tall box wide', () => {
    const t = turnedBox(tall, 400)
    expect(t.x1 - t.x0).toBe(100)
    expect(t.y1 - t.y0).toBe(20)
  })
})

describe('is the card on its side', () => {
  it('says no for lines of text that run across', () => {
    expect(isSideways([wide, wide, wide, wide])).toBe(false)
  })
  it('says yes when the boxes are mostly tall', () => {
    expect(isSideways([tall, tall, tall, tall, wide])).toBe(true)
  })
  it('does not turn a card for a few tall things among many lines', () => {
    expect(isSideways([tall, tall, wide, wide, wide, wide])).toBe(false)
  })
  it('ignores tiny boxes', () => {
    const speck = { x0: 0, y0: 0, x1: 3, y1: 20 }
    expect(isSideways([speck, speck, speck, speck])).toBe(false)
  })
})

describe('is the text upside down', () => {
  it('needs a clear majority of line votes', () => {
    expect(isUpsideDown(1, 8)).toBe(true)
    expect(isUpsideDown(0, 4)).toBe(true)
    expect(isUpsideDown(2, 3)).toBe(false)
    expect(isUpsideDown(6, 2)).toBe(false)
    expect(isUpsideDown(3, 9)).toBe(true)
    expect(isUpsideDown(4, 9)).toBe(false)
  })
  it('says no with almost no votes', () => {
    expect(isUpsideDown(0, 1)).toBe(false)
    expect(isUpsideDown(0, 0)).toBe(false)
  })
})
