// Runs the OCR engine on a photo, in this browser tab. The engine, its WebAssembly core and the English language data
// are served from this site (public/ocr), never from a CDN, and nothing is cached or sent anywhere.
// Browser only: the text-to-fields step is in core/extract.ts and is tested without a browser.
import type { Worker } from 'tesseract.js'
import type { OcrLine } from '../core/extract'
import { discardCanvas, prepareImage, type PrepMode } from './prepare'

let workerPromise: Promise<Worker> | null = null
let onProgress: ((p: number) => void) | null = null

function getWorker(): Promise<Worker> {
  workerPromise ??= (async () => {
    const { createWorker } = await import('tesseract.js')
    const base = new URL('ocr/', document.baseURI).href
    return createWorker('eng', 1, {
      workerPath: `${base}worker.min.js`,
      corePath: base,
      langPath: base,
      workerBlobURL: false,
      cacheMethod: 'none',
      gzip: true,
      // Only the progress fraction is used; the engine's messages are never logged.
      logger: (m) => {
        if (m.status === 'recognizing text') onProgress?.(m.progress)
      },
    })
  })().catch((e) => {
    workerPromise = null
    throw e
  })
  return workerPromise
}

/** One read with one kind of image preparation. */
export async function readOnce(file: Blob, progress: (p: number) => void, mode: PrepMode = 'stretch', level = true): Promise<OcrLine[]> {
  onProgress = progress
  const canvas = await prepareImage(file, mode, level)
  try {
    const worker = await getWorker()
    const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true })
    const lines = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines)).map((l) => ({ text: l.text, conf: l.confidence }))
    if (lines.length > 0) return lines
    return data.text.split(/\r?\n/).map((text) => ({ text, conf: 0 }))
  } finally {
    discardCanvas(canvas)
    onProgress = null
  }
}

/** Average confidence over the lines that have real text in them, weighted by length. 0 when nothing was read. */
export function readQuality(lines: OcrLine[]): number {
  let sum = 0
  let weight = 0
  for (const l of lines) {
    const n = (l.text.match(/[A-Za-z0-9]/g) ?? []).length
    if (n < 3) continue
    sum += l.conf * n
    weight += n
  }
  return weight === 0 ? 0 : sum / weight
}

/** Below this quality the photo is read a second time with the dim-light clean-up. Tuned by `eval/` (docs/photo-accuracy.md). */
export const retry = { below: 60 }

/** The better of: a normal read, and (only if that looked poor) a read that corrects dim or uneven light. */
export async function readPhoto(file: Blob, progress: (p: number) => void): Promise<OcrLine[]> {
  const first = await readOnce(file, progress, 'stretch')
  if (readQuality(first) >= retry.below) return first
  const second = await readOnce(file, progress, 'flat')
  return readQuality(second) > readQuality(first) ? second : first
}

/** Stop the engine and free its memory. */
export async function disposeOcr() {
  const p = workerPromise
  workerPromise = null
  if (p) await (await p).terminate().catch(() => undefined)
}
