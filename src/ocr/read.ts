// Runs the OCR engine on a photo, in this browser tab. The engine, its WebAssembly core and the English language data
// are served from this site (public/ocr), never from a CDN, and nothing is cached or sent anywhere.
// Browser only: the text-to-fields step is in core/extract.ts and is tested without a browser.
import type { Worker } from 'tesseract.js'
import { combineReads } from '../core/combine'
import { extractFields, type Extraction, type OcrLine } from '../core/extract'
import type { DocTypeId } from '../rules/types'
import { discardCanvas, prepareImage, type PrepMode } from './prepare'

/** PaddleOCR and ONNX Runtime are loaded the first time a photo is read, not with the page. */
let paddleModule: Promise<typeof import('./paddle')> | null = null
const paddle = () => (paddleModule ??= import('./paddle'))

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

/** Tesseract page segmentation: automatic (the default), or sparse text, which finds scattered small lines the automatic mode skips. */
export type PageMode = 'auto' | 'sparse'
const PSM: Record<PageMode, string> = { auto: '3', sparse: '11' }
let appliedPsm = PSM.auto

/** One read with one kind of image preparation. */
export async function readOnce(file: Blob, progress: (p: number) => void, mode: PrepMode = 'stretch', level = true, page: PageMode = 'auto', turns = 0): Promise<OcrLine[]> {
  onProgress = progress
  const canvas = await prepareImage(file, mode, level, turns)
  try {
    const worker = await getWorker()
    if (PSM[page] !== appliedPsm) {
      await worker.setParameters({ tessedit_pageseg_mode: PSM[page] as never })
      appliedPsm = PSM[page]
    }
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

/** Below this quality the photo is read again, two other ways. Tuned by `eval/` (docs/photo-accuracy.md). */
export const retry = { below: 60 }

/** The best of: a normal read, and (only if that looked poor) a read that corrects dim or uneven light and a sparse-text read. */
export async function readPhoto(file: Blob, progress: (p: number) => void): Promise<OcrLine[]> {
  let best = await readOnce(file, progress, 'stretch')
  if (readQuality(best) >= retry.below) return best
  for (const [mode, page] of [['flat', 'auto'], ['stretch', 'sparse']] as const) {
    const lines = await readOnce(file, progress, mode, true, page)
    if (readQuality(lines) > readQuality(best)) best = lines
  }
  return best
}

/**
 * Reads a photo of a document into fields. Two independent readers look at it: PaddleOCR, whose values are shown, and
 * Tesseract as a cross-check; a field they disagree on is marked "check this" (`combineReads`). If PaddleOCR cannot run
 * on this device, Tesseract alone reads it, with its retries for poor photos.
 */
export async function readFields(type: DocTypeId, file: Blob, progress: (p: number) => void): Promise<Extraction> {
  let paddleLines: OcrLine[]
  let turns = 0
  try {
    ;({ lines: paddleLines, turns } = await (await paddle()).readPaddle(file, (p) => progress(p * 0.5)))
  } catch {
    return extractFields(type, await readPhoto(file, progress))
  }
  const primary = extractFields(type, paddleLines)
  try {
    const second = await readOnce(file, (p) => progress(0.5 + p * 0.5), 'stretch', true, 'auto', turns)
    return combineReads(primary, extractFields(type, second))
  } catch {
    return primary
  }
}

/** Stop the engines and free their memory. */
export async function disposeOcr() {
  const p = workerPromise
  workerPromise = null
  if (p) await (await p).terminate().catch(() => undefined)
  if (paddleModule) await (await paddleModule).disposePaddle()
  paddleModule = null
}
