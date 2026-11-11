// Finds how far the lines of text in a photo are tilted, so the photo can be turned level before it is read.
// Pure maths on a grey image (no browser needed). Method: mark the ink, then find the angle at which the ink piles up
// into the sharpest rows. Text lines are the strongest such rows.
import { boxBlur } from './pixels'

/** The tilt search covers -MAX..+MAX degrees; anything beyond is more likely a sideways card than a tilted one. */
const MAX_TILT = 15
/** Smaller tilts than this are left alone: the engine copes with them and every turn blurs the text slightly. */
export const MIN_TILT = 1.5
const WORK_WIDTH = 480

/** Shrink by whole-pixel averaging until the image is about WORK_WIDTH wide. */
function shrink(g: Float32Array, w: number, h: number): { g: Float32Array; w: number; h: number } {
  const f = Math.max(1, Math.floor(w / WORK_WIDTH))
  if (f === 1) return { g, w, h }
  const nw = Math.floor(w / f)
  const nh = Math.floor(h / f)
  const out = new Float32Array(nw * nh)
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      let sum = 0
      for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) sum += g[(y * f + dy) * w + x * f + dx]!
      out[y * nw + x] = sum / (f * f)
    }
  }
  return { g: out, w: nw, h: nh }
}

/**
 * Degrees the text is turned clockwise on screen (y runs down), or 0 when no clear tilt was found.
 * To level the photo, turn it by the negative of this.
 */
export function estimateTilt(grey: Float32Array, width: number, height: number): number {
  const { g, w, h } = shrink(grey, width, height)
  if (w < 40 || h < 40) return 0

  // Ink = clearly darker than its surroundings. Even the lighting out first so shadows and the table do not count.
  const bg = boxBlur(g, w, h, Math.max(6, Math.round(w / 40)))
  const xs: number[] = []
  const ys: number[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (g[y * w + x]! < 0.7 * bg[y * w + x]!) {
        xs.push(x)
        ys.push(y)
      }
    }
  }
  // Too little ink, or so much that it is shadow rather than text: no opinion.
  if (xs.length < 200 || xs.length > 0.4 * w * h) return 0

  const bins = new Float64Array(w + h + 4)
  const offset = w + 2
  const score = (deg: number) => {
    const rad = (deg * Math.PI) / 180
    const c = Math.cos(rad)
    const s = Math.sin(rad)
    bins.fill(0)
    for (let i = 0; i < xs.length; i++) bins[Math.round(ys[i]! * c - xs[i]! * s + offset)]!++
    let total = 0
    for (let i = 1; i < bins.length; i++) {
      const d = bins[i]! - bins[i - 1]!
      total += d * d
    }
    return total
  }

  let best = 0
  let bestScore = -1
  const scores: number[] = []
  for (let deg = -MAX_TILT; deg <= MAX_TILT; deg++) {
    const sc = score(deg)
    scores.push(sc)
    if (sc > bestScore) {
      bestScore = sc
      best = deg
    }
  }
  for (let deg = best - 0.9; deg <= best + 0.91; deg += 0.1) {
    const sc = score(deg)
    if (sc > bestScore) {
      bestScore = sc
      best = deg
    }
  }
  // The peak must stand clear of the typical angle, otherwise there is no dominant line direction (a photo of a plain card).
  const sorted = [...scores].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]!
  if (bestScore < 1.15 * median) return 0
  return Math.round(best * 10) / 10
}
