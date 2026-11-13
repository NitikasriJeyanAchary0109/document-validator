// Turns a clean card into a photo-like image: blur, small size, tilt, shear, sensor noise with heavy JPEG, low light, glare, and
// the hazards of real phone photos that the first set left out: a card held sideways or upside down, a camera not parallel to the
// card (perspective), motion blur, a security pattern and holographic stripe over the text, and a shadow with a colour cast.
import type { Rng } from './synth'

export const CONDITIONS = ['clean', 'blur', 'small', 'rotate', 'skew', 'noise', 'lowlight', 'glare', 'sideways', 'upside', 'perspective', 'motion', 'pattern', 'shadow'] as const
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
    case 'sideways': {
      // The card laid across the frame: the whole photo turned a quarter turn, either way.
      const t = onTable(card)
      const c = document.createElement('canvas')
      c.width = t.height
      c.height = t.width
      const x = c.getContext('2d')!
      x.translate(c.width / 2, c.height / 2)
      x.rotate(((r() < 0.5 ? -1 : 1) * Math.PI) / 2)
      x.drawImage(t, -t.width / 2, -t.height / 2)
      return toBlob(c, 0.85)
    }
    case 'upside': {
      const t = onTable(card)
      const c = document.createElement('canvas')
      c.width = t.width
      c.height = t.height
      const x = c.getContext('2d')!
      x.translate(c.width / 2, c.height / 2)
      x.rotate(Math.PI)
      x.drawImage(t, -t.width / 2, -t.height / 2)
      return toBlob(c, 0.85)
    }
    case 'perspective': {
      // Keystone: the far edge of the card is narrower, as when the phone is tilted. Drawn one pixel row at a time.
      const t = onTable(card)
      const c = document.createElement('canvas')
      c.width = t.width
      c.height = t.height
      const x = c.getContext('2d')!
      x.fillStyle = '#6f6254'
      x.fillRect(0, 0, c.width, c.height)
      const k = 0.1 + r() * 0.1
      const flip = r() < 0.5
      for (let y = 0; y < t.height; y++) {
        const f = flip ? 1 - y / t.height : y / t.height
        const w = t.width * (1 - 2 * k + 2 * k * f)
        x.drawImage(t, 0, y, t.width, 1, (t.width - w) / 2, y, w, 1)
      }
      return toBlob(c, 0.85)
    }
    case 'motion': {
      // A few copies of the card shifted along one direction, averaged.
      const t = onTable(card)
      const c = document.createElement('canvas')
      c.width = t.width
      c.height = t.height
      const x = c.getContext('2d')!
      const angle = (r() - 0.5) * 0.9
      const len = 4 + r() * 4
      const n = 9
      for (let i = 0; i < n; i++) {
        const d = (i / (n - 1) - 0.5) * len
        x.globalAlpha = 1 / (i + 1)
        x.drawImage(t, Math.cos(angle) * d, Math.sin(angle) * d)
      }
      return toBlob(c, 0.85)
    }
    case 'pattern': {
      // A tinted card with a fine wavy security pattern and a holographic stripe running over the text.
      const t = onTable(card)
      const x = t.getContext('2d')!
      x.globalCompositeOperation = 'multiply'
      x.fillStyle = '#efe0bd'
      x.fillRect(50, 50, t.width - 100, t.height - 100)
      x.globalCompositeOperation = 'source-over'
      x.strokeStyle = 'rgba(70,50,130,0.22)'
      x.lineWidth = 1.4
      const phase = r() * 6
      for (let row = 0; row < t.height; row += 9) {
        x.beginPath()
        for (let px = 0; px <= t.width; px += 6) {
          const y = row + Math.sin(px / 38 + row / 21 + phase) * 7
          if (px === 0) x.moveTo(px, y)
          else x.lineTo(px, y)
        }
        x.stroke()
      }
      const g = x.createLinearGradient(0, 0, t.width, t.height)
      const at = 0.3 + r() * 0.4
      g.addColorStop(Math.max(0, at - 0.09), 'rgba(255,255,255,0)')
      g.addColorStop(at - 0.04, 'rgba(255,120,200,0.35)')
      g.addColorStop(at, 'rgba(120,255,220,0.4)')
      g.addColorStop(at + 0.04, 'rgba(255,230,120,0.35)')
      g.addColorStop(Math.min(1, at + 0.09), 'rgba(255,255,255,0)')
      x.fillStyle = g
      x.fillRect(0, 0, t.width, t.height)
      return toBlob(t, 0.8)
    }
    case 'shadow': {
      // A hand's shadow across part of the card, and a warm colour cast from indoor light.
      const t = onTable(card)
      const x = t.getContext('2d')!
      const g = x.createLinearGradient(0, 0, t.width, r() * t.height * 0.5)
      g.addColorStop(0, 'rgba(0,0,0,0.6)')
      g.addColorStop(0.45, 'rgba(0,0,0,0.45)')
      g.addColorStop(0.75, 'rgba(0,0,0,0)')
      x.fillStyle = g
      x.fillRect(0, 0, t.width, t.height)
      x.globalCompositeOperation = 'multiply'
      x.fillStyle = '#ffd7a8'
      x.fillRect(0, 0, t.width, t.height)
      return toBlob(t, 0.8)
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
