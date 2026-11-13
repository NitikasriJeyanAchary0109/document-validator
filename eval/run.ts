// Dev-only browser runner: generates invented cards, degrades them, reads each through the app's real pipeline
// (prepareImage, Tesseract.js, extractFields) and prints the scoreboard. Open /eval.html in `npm run dev` and keep the
// tab in front (a hidden tab is throttled and the timings are wrong).
//
// Every image is read three times (A normal clean-up, B the dim-light clean-up, C normal plus turning the photo level) and all are kept in memory, so any reading
// policy can be scored afterwards without re-reading: window.__replay({ mode: 'A' | 'B' | 'C' | 'cascade', below, lowConf }).
// ?variants=paddle,flatL,sparse adds more readings of each image (paddle = PaddleOCR); &lean=1 skips reads A and B, &lazy=1 reads
// variants only when the first read looks poor, &save=KEY keeps the readings in localStorage and ?restore=KEY[,KEY] scores them again
// without reading (policies: 'paddle', 'dual' = PaddleOCR shown and Tesseract cross-checks, 'pt:N', 'tp:N', 'casc:flatL,sparse').
// ?people=N reads people 1..N; add &from=K to start at person K (to check on people a setting was not tuned on).
import { combineReads } from '../src/core/combine'
import { extractFields, tuning, type OcrLine } from '../src/core/extract'
import { readOnce, readQuality, type PageMode } from '../src/ocr/read'
import type { PrepMode } from '../src/ocr/prepare'
import { readPaddle } from '../src/ocr/paddle'
import { CONDITIONS, degrade, type Condition } from './degrade'
import { report, type Result } from './score'
import { DOC_OF, KINDS, drawCard, makePerson, mulberry32 } from './synth'

interface Captured {
  kind: (typeof KINDS)[number]
  condition: string
  truth: Result['truth']
  a: OcrLine[]
  b: OcrLine[]
  /** Normal clean-up plus turning the photo level. */
  c: OcrLine[]
  msA: number
  msB: number
  msC: number
  /** Extra experimental reads (all levelled), by variant name. */
  v: Record<string, { lines: OcrLine[]; ms: number; turns?: number }>
  failed: boolean
}

interface Policy {
  mode: string
  /** Cascade: read again with the dim-light clean-up when the first read's quality is below this. */
  below?: number
  lowConf?: number
  /** Use the passport's machine-readable lines (default: as the app does). */
  mrz?: boolean
}

declare global {
  interface Window {
    __captured?: Captured[]
    __report?: string
    __progress?: string
    __replay?: (p: Policy) => string
  }
}

const out = document.getElementById('out') as HTMLPreElement
const status = document.getElementById('status') as HTMLElement

function replay(captured: Captured[], p: Policy): string {
  const keep = tuning.lowConf
  const keepMrz = tuning.mrz
  if (p.lowConf !== undefined) tuning.lowConf = p.lowConf
  if (p.mrz !== undefined) tuning.mrz = p.mrz
  const results: Result[] = captured.map((c) => {
    let lines = c.a
    let ms = c.msA
    if (p.mode.startsWith('pt:') || p.mode.startsWith('tp:')) {
      // Two readers: 'pt:N' reads with PaddleOCR first and also uses Tesseract's read when Paddle's quality is below N;
      // 'tp:N' is the other way round. The read with the higher quality wins.
      const n = Number(p.mode.slice(3))
      const [first, firstMs, second, secondMs] = p.mode.startsWith('pt')
        ? [c.v.paddle!.lines, c.v.paddle!.ms, c.c, c.msC]
        : [c.c, c.msC, c.v.paddle!.lines, c.v.paddle!.ms]
      lines = first
      ms = firstMs
      if (readQuality(first) < n) {
        ms += secondMs
        if (readQuality(second) > readQuality(first)) lines = second
      }
    } else if (p.mode.startsWith('casc')) {
      // Production-style: the levelled normal read, then (only if it looks poor) the best of it and the listed variants.
      lines = c.c
      ms = c.msC
      if (readQuality(c.c) < (p.below ?? 60)) {
        for (const name of p.mode.slice(5).split(',').filter(Boolean)) {
          const alt = c.v[name]
          if (!alt) continue
          ms += alt.ms
          if (readQuality(alt.lines) > readQuality(lines)) lines = alt.lines
        }
      }
    } else if (p.mode === 'B') {
      lines = c.b
      ms = c.msB
    } else if (c.v[p.mode]) {
      lines = c.v[p.mode]!.lines
      ms = c.v[p.mode]!.ms
    } else if (p.mode === 'C') {
      lines = c.c
      ms = c.msC
    } else if (p.mode === 'cascade' && readQuality(c.a) < (p.below ?? 85)) {
      ms = c.msA + c.msB
      if (readQuality(c.b) > readQuality(c.a)) lines = c.b
    }
    if (p.mode === 'dual') {
      // Both readers on every photo; PaddleOCR's values are shown, Tesseract's read is the cross-check.
      const a = extractFields(DOC_OF[c.kind], c.v.paddle!.lines)
      const b = extractFields(DOC_OF[c.kind], c.c)
      const m = combineReads(a, b)
      return { kind: c.kind, condition: c.condition, truth: c.truth, fields: m.fields, check: m.check, ms: c.v.paddle!.ms + c.msC, failed: c.failed }
    }
    const { fields, check } = extractFields(DOC_OF[c.kind], lines)
    return { kind: c.kind, condition: c.condition, truth: c.truth, fields, check, ms, failed: c.failed }
  })
  tuning.lowConf = keep
  tuning.mrz = keepMrz
  return report(results)
}

/** Extra readings, named in ?variants=; each is a clean-up mode plus a page mode, always levelled. */
const VARIANTS: Record<string, { mode: PrepMode; page: PageMode }> = {
  flatL: { mode: 'flat', page: 'auto' },
  sparse: { mode: 'stretch', page: 'sparse' },
}

async function readVariant(blob: Blob, name: string) {
  const t = performance.now()
  if (name === 'paddle') {
    const { lines, turns } = await readPaddle(blob)
    return { lines, ms: performance.now() - t, turns }
  }
  const v = VARIANTS[name]!
  const lines = await readOnce(blob, () => undefined, v.mode, true, v.page)
  return { lines, ms: performance.now() - t }
}

async function main(from: number, people: number, conditions: readonly Condition[], kinds: readonly (typeof KINDS)[number][] = KINDS) {
  const captured: Captured[] = []
  window.__captured = captured
  window.__replay = (p) => replay(captured, p)
  const total = (people - from + 1) * kinds.length * conditions.length
  for (let seed = from; seed <= people; seed++) {
    const person = makePerson(seed)
    for (const kind of kinds) {
      for (const cond of conditions) {
        const rng = mulberry32(seed * 1000 + KINDS.indexOf(kind) * 10 + CONDITIONS.indexOf(cond))
        const sample = drawCard(kind, person, rng)
        const blob = await degrade(sample.canvas, cond, rng)
        const row: Captured = { kind, condition: cond, truth: sample.truth, a: [], b: [], c: [], msA: 0, msB: 0, msC: 0, v: {}, failed: false }
        try {
          if (!lean) {
            const t0 = performance.now()
            row.a = await readOnce(blob, () => undefined, 'stretch', false)
            row.msA = performance.now() - t0
            const t1 = performance.now()
            row.b = await readOnce(blob, () => undefined, 'flat', false)
            row.msB = performance.now() - t1
          }
          // PaddleOCR is read first when asked for: it finds how the photo is turned, and the Tesseract read uses the same turn.
          if (variants.includes('paddle') && !lazy) row.v.paddle = await readVariant(blob, 'paddle')
          const t2 = performance.now()
          row.c = await readOnce(blob, () => undefined, 'stretch', true, 'auto', row.v.paddle?.turns ?? 0)
          row.msC = performance.now() - t2
          // Other variants are alternatives to a poor first read, so (with &lazy=1) they are only read when it looks poor.
          if (!lazy || readQuality(row.c) < 60) for (const name of variants) if (!row.v[name]) row.v[name] = await readVariant(blob, name)
        } catch {
          row.failed = true
        }
        captured.push(row)
        window.__progress = `${captured.length}/${total}`
        status.textContent = `Reading ${captured.length} of ${total}…`
      }
    }
  }
  const save = new URLSearchParams(location.search).get('save')
  if (save) localStorage.setItem(save, JSON.stringify(captured))
  window.__report = replay(captured, { mode: 'A' })
  out.textContent = window.__report
  status.textContent = `Done: ${total} images.`
}

const params = new URLSearchParams(location.search)
const people = Number(params.get('people') ?? 4)
const from = Number(params.get('from') ?? 1)
const variants = (params.get('variants') ?? '').split(',').filter((n) => n in VARIANTS || n === 'paddle')
const onlyKinds = params.get('kinds')?.split(',').filter((k): k is (typeof KINDS)[number] => (KINDS as readonly string[]).includes(k))
const lean = params.get('lean') === '1'
const lazy = params.get('lazy') === '1'
const only = params.get('conditions')?.split(',').filter((c): c is Condition => (CONDITIONS as readonly string[]).includes(c))
document.getElementById('go')?.addEventListener('click', () => void main(from, people, only?.length ? only : CONDITIONS, onlyKinds?.length ? onlyKinds : KINDS))
const restore = params.get('restore')
if (restore) {
  // Reload readings saved by an earlier run (&save=KEY), several keys joined with commas, so policies can be scored again.
  const captured: Captured[] = restore
    .split(',')
    .flatMap((k) => JSON.parse(localStorage.getItem(k) ?? '[]') as (Captured & { p?: { lines: OcrLine[]; ms: number } })[])
    .map((c) => ({ ...c, a: c.a ?? [], b: c.b ?? [], msA: 0, msB: 0, v: c.v ?? { paddle: c.p! } }))
  window.__captured = captured
  window.__replay = (p) => replay(captured, p)
  status.textContent = `Restored ${captured.length} images.`
}
if (params.get('run') === '1') void main(from, people, only?.length ? only : CONDITIONS, onlyKinds?.length ? onlyKinds : KINDS)
