// Turns a clean card into a photo-like image: blur, small size, tilt, shear, sensor noise with heavy JPEG, low light, glare.
import type { Rng } from './synth'

export const CONDITIONS = ['clean', 'blur', 'small', 'rotate', 'skew', 'noise', 'lowlight', 'glare'] as const
export type Condition = (typeof CONDITIONS)[number]

const toBlob = (c: HTMLCanvasElement, q: number) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/jpeg', q))

/** Put the card on a darker "table" with some margin, optionally transformed. */
function onTable(card: HTMLCanvasElement, transform?: (x: CanvasRenderingContext2D, w: number, h: number) => void, filter?: string) {
  const m = 50
  const c = document.createElement('canvas')
  c.width = card.width + m * 2
  c.height = card.height + m * 2
  const x = c.getContext('2d')!
  x.fillStyle = '#6f6254'
  x.fillRect(0, 0, c.width, c.height)
  x.save()
  if (transform) transform(x, c.width, c.height)
  if (filter) x.filter = filter
  x.drawImage(card, m, m)
  x.restore()
  return c
}

function addNoise(c: HTMLCanvasElement, r: Rng, sigma: number) {
  const x = c.getContext('2d')!
  const img = x.getImageData(0, 0, c.width, c.height)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    // Box-Muller
    const g = Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()) * sigma
    d[i] = Math.max(0, Math.min(255, d[i]! + g))
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1]! + g))
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2]! + g))
  }
  x.putImageData(img, 0, 0)
}

export async function degrade(card: HTMLCanvasElement, cond: Condition, r: Rng): Promise<Blob> {
  switch (cond) {
    case 'clean':
      return toBlob(card, 0.92)
    case 'blur':
      return toBlob(onTable(card, undefined, 'blur(1.8px)'), 0.85)
    case 'small': {
      const t = onTable(card)
      const s = document.createElement('canvas')
      s.width = 520
      s.height = Math.round((t.height * 520) / t.width)
      s.getContext('2d')!.drawImage(t, 0, 0, s.width, s.height)
      return toBlob(s, 0.8)
    }
    case 'rotate': {
      const deg = (r() < 0.5 ? -1 : 1) * (4 + r() * 4)
      return toBlob(onTable(card, (x, w, h) => { x.translate(w / 2, h / 2); x.rotate((deg * Math.PI) / 180); x.translate(-w / 2, -h / 2) }), 0.85)
    }
    case 'skew':
      return toBlob(onTable(card, (x) => x.transform(1, 0.04, -0.14, 1, 40, 0)), 0.85)
    case 'noise': {
      const t = onTable(card)
      addNoise(t, r, 26)
      return toBlob(t, 0.35)
    }
    case 'lowlight': {
      const t = onTable(card, undefined, 'brightness(0.5) contrast(0.55)')
      addNoise(t, r, 8)
      return toBlob(t, 0.7)
    }
    case 'glare': {
      const t = onTable(card)
      const x = t.getContext('2d')!
      const cx = 200 + r() * (t.width - 400)
      const cy = 120 + r() * (t.height - 240)
      const g = x.createRadialGradient(cx, cy, 10, cx, cy, 190)
      g.addColorStop(0, 'rgba(255,255,255,0.97)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      x.fillStyle = g
      x.fillRect(0, 0, t.width, t.height)
      return toBlob(t, 0.85)
    }
  }
}
