// PaddleOCR (PP-OCRv4 text detection and recognition models) run with ONNX Runtime, in this browser tab. The models, the
// runtime and its WebAssembly file are served from this site (public/ocr), never from a CDN, and nothing is cached or sent anywhere.
// Detection gives a probability map of text; its blobs become boxes (axis-aligned, since the photo is already levelled).
// Recognition reads each box with a CTC decoder. Browser only: the text-to-fields step is in core/extract.ts.
import * as ort from 'onnxruntime-web/wasm'
import type { OcrLine } from '../core/extract'
import { discardCanvas, prepareImage } from './prepare'

const base = () => new URL('ocr/', document.baseURI).href
const DET_LONG_SIDE = 1280
const DET_THRESH = 0.3
const BOX_SCORE = 0.5
const UNCLIP = 1.5
const REC_HEIGHT = 48
/** A run of this many ink-free columns (in the 48-pixel-high crop) between two characters is read as a word gap: the model often leaves spaces out. */
const GAP_PX = 12
/** Narrow glyphs carry blank space on their sides, so next to them the gap has to be wider to count. */
const NARROW = /[1Il|i!.,:;/\\()]/

interface Models {
  det: ort.InferenceSession
  rec: ort.InferenceSession
  dict: string[]
}
let modelsPromise: Promise<Models> | null = null

function getModels(): Promise<Models> {
  modelsPromise ??= (async () => {
    const dir = base()
    ort.env.wasm.wasmPaths = dir
    ort.env.wasm.numThreads = 1
    const opts = { executionProviders: ['wasm'] }
    const [det, rec, dictText] = await Promise.all([
      ort.InferenceSession.create(`${dir}det.onnx`, opts),
      ort.InferenceSession.create(`${dir}rec.onnx`, opts),
      fetch(`${dir}dict.txt`).then((r) => r.text()),
    ])
    // CTC output: index 0 is "blank", then the dictionary in order, then a space.
    return { det, rec, dict: ['', ...dictText.split(/\r?\n/).filter((l) => l.length > 0), ' '] }
  })().catch((e) => {
    modelsPromise = null
    throw e
  })
  return modelsPromise
}

interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Blobs of the probability map above the threshold, as boxes in map coordinates, grown the way DB expects. */
function findBoxes(prob: Float32Array, w: number, h: number): Box[] {
  const seen = new Uint8Array(w * h)
  const boxes: Box[] = []
  const stack: number[] = []
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || prob[start]! <= DET_THRESH) continue
    let x0 = w
    let y0 = h
    let x1 = 0
    let y1 = 0
    let n = 0
    let sum = 0
    stack.push(start)
    seen[start] = 1
    while (stack.length) {
      const p = stack.pop()!
      const x = p % w
      const y = (p - x) / w
      n++
      sum += prob[p]!
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
      for (const q of [p - 1, p + 1, p - w, p + w]) {
        if (q < 0 || q >= w * h || seen[q] || prob[q]! <= DET_THRESH) continue
        if ((q === p - 1 && x === 0) || (q === p + 1 && x === w - 1)) continue
        seen[q] = 1
        stack.push(q)
      }
    }
    const bw = x1 - x0 + 1
    const bh = y1 - y0 + 1
    if (Math.min(bw, bh) < 3 || sum / n < BOX_SCORE) continue
    const d = (bw * bh * UNCLIP) / (2 * (bw + bh))
    boxes.push({ x0: Math.max(0, x0 - d), y0: Math.max(0, y0 - d), x1: Math.min(w, x1 + 1 + d), y1: Math.min(h, y1 + 1 + d) })
  }
  return boxes
}

async function detect(m: Models, canvas: HTMLCanvasElement): Promise<{ boxes: Box[]; scale: number }> {
  const scale = Math.min(1, DET_LONG_SIDE / Math.max(canvas.width, canvas.height))
  const w = Math.max(32, Math.round((canvas.width * scale) / 32) * 32)
  const h = Math.max(32, Math.round((canvas.height * scale) / 32) * 32)
  const small = document.createElement('canvas')
  small.width = w
  small.height = h
  const ctx = small.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(canvas, 0, 0, w, h)
  const px = ctx.getImageData(0, 0, w, h).data
  const mean = [0.485, 0.456, 0.406]
  const std = [0.229, 0.224, 0.225]
  const input = new Float32Array(3 * w * h)
  for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++) input[c * w * h + i] = (px[i * 4 + c]! / 255 - mean[c]!) / std[c]!
  const out = await m.det.run({ [m.det.inputNames[0]!]: new ort.Tensor('float32', input, [1, 3, h, w]) })
  const prob = out[m.det.outputNames[0]!]!.data as Float32Array
  // Boxes are in the resized map's coordinates; bring them back to the prepared canvas.
  const sx = canvas.width / w
  const sy = canvas.height / h
  return { boxes: findBoxes(prob, w, h).map((b) => ({ x0: b.x0 * sx, y0: b.y0 * sy, x1: b.x1 * sx, y1: b.y1 * sy })), scale }
}

async function recognise(m: Models, canvas: HTMLCanvasElement, b: Box): Promise<{ text: string; conf: number }> {
  const bw = Math.max(1, b.x1 - b.x0)
  const bh = Math.max(1, b.y1 - b.y0)
  const w = Math.max(8, Math.min(1280, Math.ceil((REC_HEIGHT * bw) / bh)))
  const crop = document.createElement('canvas')
  crop.width = w
  crop.height = REC_HEIGHT
  const ctx = crop.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(canvas, b.x0, b.y0, bw, bh, 0, 0, w, REC_HEIGHT)
  const px = ctx.getImageData(0, 0, w, REC_HEIGHT).data
  const input = new Float32Array(3 * w * REC_HEIGHT)
  for (let i = 0; i < w * REC_HEIGHT; i++) for (let c = 0; c < 3; c++) input[c * w * REC_HEIGHT + i] = (px[i * 4 + c]! / 255 - 0.5) / 0.5
  const out = await m.rec.run({ [m.rec.inputNames[0]!]: new ort.Tensor('float32', input, [1, 3, REC_HEIGHT, w]) })
  const t = out[m.rec.outputNames[0]!]!
  const [, steps, classes] = t.dims as number[]
  const data = t.data as Float32Array

  // Which columns of the crop hold ink: darker than halfway between the dark and light ends of the crop.
  const grey = new Uint8Array(w * REC_HEIGHT)
  for (let i = 0; i < grey.length; i++) grey[i] = px[i * 4]!
  const sorted = Uint8Array.from(grey).sort()
  const dark = sorted[Math.floor(sorted.length * 0.05)]!
  const light = sorted[Math.floor(sorted.length * 0.95)]!
  const cut = (dark + light) / 2
  const ink = new Uint8Array(w)
  for (let x = 0; x < w; x++) for (let y = 0; y < REC_HEIGHT; y++) if (grey[y * w + x]! < cut) ink[x] = 1
  const blankRun = (from: number, to: number) => {
    let best = 0
    let run = 0
    for (let x = Math.max(0, Math.floor(from)); x <= Math.min(w - 1, Math.ceil(to)); x++) {
      run = ink[x] ? 0 : run + 1
      if (run > best) best = run
    }
    return best
  }

  let text = ''
  let sum = 0
  let kept = 0
  let prev = 0
  let prevX = -1
  let prevCh = ''
  for (let s = 0; s < steps!; s++) {
    let best = 0
    let bestV = -Infinity
    for (let c = 0; c < classes!; c++) {
      const v = data[s * classes! + c]!
      if (v > bestV) {
        bestV = v
        best = c
      }
    }
    if (best !== 0 && best !== prev) {
      const x = ((s + 0.5) * w) / steps!
      const ch = m.dict[best] ?? ''
      if (text && prevX >= 0 && ch !== ' ' && !text.endsWith(' ') && blankRun(prevX, x) >= (NARROW.test(prevCh) || NARROW.test(ch) ? GAP_PX * 1.4 : GAP_PX)) text += ' '
      text += ch
      sum += bestV
      kept++
      prevX = x
      prevCh = ch
    }
    prev = best
  }
  return { text, conf: kept ? (sum / kept) * 100 : 0 }
}

/** Boxes whose vertical centres are close share a reading line, read left to right. */
function toLines(items: { text: string; conf: number; box: Box }[]): OcrLine[] {
  const sorted = items.filter((i) => i.text.trim()).sort((a, b) => a.box.y0 + a.box.y1 - (b.box.y0 + b.box.y1))
  const rows: typeof sorted[] = []
  for (const it of sorted) {
    const cy = (it.box.y0 + it.box.y1) / 2
    const row = rows.find((r) => {
      const r0 = r[0]!.box
      return Math.abs((r0.y0 + r0.y1) / 2 - cy) < 0.5 * Math.max(r0.y1 - r0.y0, it.box.y1 - it.box.y0)
    })
    if (row) row.push(it)
    else rows.push([it])
  }
  return rows.map((r) => {
    r.sort((a, b) => a.box.x0 - b.box.x0)
    return { text: r.map((i) => i.text).join(' '), conf: r.reduce((s, i) => s + i.conf, 0) / r.length }
  })
}

/** One read of the photo with PaddleOCR. `progress` is called with 0 to 1 as the text boxes are read. */
export async function readPaddle(file: Blob, progress: (p: number) => void = () => undefined): Promise<OcrLine[]> {
  const canvas = await prepareImage(file, 'stretch', true)
  try {
    const m = await getModels()
    progress(0.1)
    const { boxes } = await detect(m, canvas)
    progress(0.2)
    const items = []
    for (const [i, box] of boxes.entries()) {
      items.push({ ...(await recognise(m, canvas, box)), box })
      progress(0.2 + (0.8 * (i + 1)) / boxes.length)
    }
    return toLines(items)
  } finally {
    discardCanvas(canvas)
  }
}

/** Free the models' memory. */
export async function disposePaddle() {
  const p = modelsPromise
  modelsPromise = null
  if (p) {
    const m = await p.catch(() => null)
    await m?.det.release().catch(() => undefined)
    await m?.rec.release().catch(() => undefined)
  }
}
