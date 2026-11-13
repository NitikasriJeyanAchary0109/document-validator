// The pure parts of working out how a card photo is turned. No browser needed, so they are tested offline.

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** The box after the canvas it is on is turned a quarter turn clockwise (the canvas was `height` tall before the turn). */
export const turnedBox = (b: Box, height: number): Box => ({ x0: height - b.y1, y0: b.x0, x1: height - b.y0, y1: b.x1 })

/**
 * Are the text boxes mostly tall, so the card lies on its side? Boxes under 6 pixels are noise. At least three tall boxes
 * and twice as many tall as wide, so a card with a few tall things (a photo, a stamp) is not turned.
 */
export function isSideways(boxes: Box[]): boolean {
  const big = boxes.filter((b) => Math.min(b.x1 - b.x0, b.y1 - b.y0) >= 6)
  const wide = big.filter((b) => b.x1 - b.x0 > 1.2 * (b.y1 - b.y0)).length
  const tall = big.filter((b) => b.y1 - b.y0 > 1.2 * (b.x1 - b.x0)).length
  return tall >= 3 && tall > 2 * wide
}

/**
 * Do the line-direction votes say the text is upside down? Turning an upright photo upside down would ruin the read, so a clear
 * majority is needed: real upside-down cards gave 7 to 10 votes against 0 or 1; the one wrong call on normal photos gave 3
 * against 2. With fewer than two clear votes there is no answer (false).
 */
export function isUpsideDown(upright: number, flipped: number): boolean {
  if (upright + flipped < 2) return false
  return flipped >= 4 && flipped >= 3 * upright
}
