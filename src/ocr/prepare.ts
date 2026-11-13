// Gets a photo ready for the OCR engine: upright, a sensible size, grey, with the contrast stretched.
// Browser only. The image lives in memory for the duration of one read and is never stored or sent anywhere.

import { estimateTilt, MIN_TILT } from './deskew'
import { boxBlur } from './pixels'

const TARGET_LONG_SIDE = 1600
const MAX_UPSCALE = 3

/** `turns` is how many quarter turns clockwise to rotate the photo first (a card held sideways or upside down). */
export async function prepareImage(file: Blob, mode: PrepMode = 'stretch', level = true, turns = 0): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const scale = Math.min(MAX_UPSCALE, TARGET_LONG_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const sideways = turns % 2 !== 0
    canvas.width = sideways ? h : w
    canvas.height = sideways ? w : h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('canvas unavailable')
    ctx.imageSmoothingQuality = 'high'
    ctx.translate(canvas.width / 2, canvas.height / 2)
    ctx.rotate((turns * Math.PI) / 2)
    ctx.drawImage(bitmap, -w / 2, -h / 2, w, h)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    const tilt = cleanUp(ctx, canvas.width, canvas.height, mode, level)
    return Math.abs(tilt) >= MIN_TILT ? turnLevel(canvas, tilt) : canvas
  } finally {
    bitmap.close()
  }
}

/** 'stretch': grey and stretch the contrast. 'flat': first divide out the local background, for dim or uneven light. */
export type PrepMode = 'stretch' | 'flat'

/** Grey the picture and stretch its contrast in place. Returns the tilt of the text in degrees when `level` is set, else 0. */
function cleanUp(ctx: CanvasRenderingContext2D, w: number, h: number, mode: PrepMode, level: boolean): number {
  const img = ctx.getImageData(0, 0, w, h)
  const px = img.data
  const g = new Float32Array(w * h)
  for (let i = 0; i < g.length; i++) g[i] = 0.299 * px[i * 4]! + 0.587 * px[i * 4 + 1]! + 0.114 * px[i * 4 + 2]!

  // Flat-field: divide by the local background so dim or uneven light stops hiding the text.
  if (mode === 'flat') {
    // Light denoise first, so sensor noise does not turn the background into specks the OCR engine slows down on.
    const smooth = boxBlur(g, w, h, 1)
    const bg = boxBlur(smooth, w, h, Math.max(12, Math.round(w / 20)))
    for (let i = 0; i < g.length; i++) {
      const ratio = smooth[i]! / Math.max(1, bg[i]!)
      // Near the background brightness: pure white. Clearly darker: toward black. In between keeps its grey.
      g[i] = Math.max(0, Math.min(1, (ratio - 0.55) / 0.35)) * 255
    }
  }
  const tilt = level ? estimateTilt(g, w, h) : 0
  // Map the 2nd to 98th percentile of brightness onto the full range.
  const hist = new Uint32Array(256)
  for (let i = 0; i < g.length; i++) hist[Math.max(0, Math.min(255, Math.round(g[i]!)))]!++
  const total = w * h
  let lo = 0
  let hi = 255
  for (let acc = 0; lo < 255 && (acc += hist[lo]!) < total * 0.02; lo++);
  for (let acc = 0; hi > 0 && (acc += hist[hi]!) < total * 0.02; hi--);
  const range = Math.max(1, hi - lo)
  for (let i = 0; i < g.length; i++) {
    const v = Math.max(0, Math.min(255, Math.round(((g[i]! - lo) * 255) / range)))
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v
  }
  ctx.putImageData(img, 0, 0)
  return tilt
}

/** A copy of the canvas turned by -tilt degrees on a white sheet big enough to keep every corner. The original is freed. */
function turnLevel(canvas: HTMLCanvasElement, tilt: number): HTMLCanvasElement {
  const rad = (-tilt * Math.PI) / 180
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  const out = document.createElement('canvas')
  out.width = Math.round(canvas.width * cos + canvas.height * sin)
  out.height = Math.round(canvas.width * sin + canvas.height * cos)
  const ctx = out.getContext('2d', { willReadFrequently: true })
  if (!ctx) return canvas
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.imageSmoothingQuality = 'high'
  ctx.translate(out.width / 2, out.height / 2)
  ctx.rotate(rad)
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2)
  discardCanvas(canvas)
  return out
}

/** Free the pixel memory as soon as the read is done. */
export function discardCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0
  canvas.height = 0
}
