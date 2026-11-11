// Dev-only browser runner: generates invented cards, degrades them, reads each through the app's real pipeline
// (prepareImage, Tesseract.js, extractFields) and prints the scoreboard. Open /eval.html in `npm run dev` and keep the
// tab in front (a hidden tab is throttled and the timings are wrong).
//
// Every image is read three times (A normal clean-up, B the dim-light clean-up, C normal plus turning the photo level) and all are kept in memory, so any reading
// policy can be scored afterwards without re-reading: window.__replay({ mode: 'A' | 'B' | 'C' | 'cascade', below, lowConf }).
// ?people=N reads people 1..N; add &from=K to start at person K (to check on people a setting was not tuned on).
import { extractFields, tuning, type OcrLine } from '../src/core/extract'
import { readOnce, readQuality } from '../src/ocr/read'
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
  failed: boolean
}

interface Policy {
  mode: 'A' | 'B' | 'C' | 'cascade'
  /** Cascade: read again with the dim-light clean-up when the first read's quality is below this. */
  below?: number
  lowConf?: number
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
  if (p.lowConf !== undefined) tuning.lowConf = p.lowConf
  const results: Result[] = captured.map((c) => {
    let lines = c.a
    let ms = c.msA
    if (p.mode === 'B') {
      lines = c.b
      ms = c.msB
    } else if (p.mode === 'C') {
      lines = c.c
      ms = c.msC
    } else if (p.mode === 'cascade' && readQuality(c.a) < (p.below ?? 85)) {
      ms = c.msA + c.msB
      if (readQuality(c.b) > readQuality(c.a)) lines = c.b
    }
    const { fields, check } = extractFields(DOC_OF[c.kind], lines)
    return { kind: c.kind, condition: c.condition, truth: c.truth, fields, check, ms, failed: c.failed }
  })
  tuning.lowConf = keep
  return report(results)
}

async function main(from: number, people: number, conditions: readonly Condition[]) {
  const captured: Captured[] = []
  window.__captured = captured
  window.__replay = (p) => replay(captured, p)
  const total = (people - from + 1) * KINDS.length * conditions.length
  for (let seed = from; seed <= people; seed++) {
    const person = makePerson(seed)
    for (const kind of KINDS) {
      for (const cond of conditions) {
        const rng = mulberry32(seed * 1000 + KINDS.indexOf(kind) * 10 + CONDITIONS.indexOf(cond))
        const sample = drawCard(kind, person, rng)
        const blob = await degrade(sample.canvas, cond, rng)
        const row: Captured = { kind, condition: cond, truth: sample.truth, a: [], b: [], c: [], msA: 0, msB: 0, msC: 0, failed: false }
        try {
          const t0 = performance.now()
          row.a = await readOnce(blob, () => undefined, 'stretch', false)
          row.msA = performance.now() - t0
          const t1 = performance.now()
          row.b = await readOnce(blob, () => undefined, 'flat', false)
          row.msB = performance.now() - t1
          const t2 = performance.now()
          row.c = await readOnce(blob, () => undefined, 'stretch', true)
          row.msC = performance.now() - t2
        } catch {
          row.failed = true
        }
        captured.push(row)
        window.__progress = `${captured.length}/${total}`
        status.textContent = `Reading ${captured.length} of ${total}…`
      }
    }
  }
  window.__report = replay(captured, { mode: 'A' })
  out.textContent = window.__report
  status.textContent = `Done: ${total} images.`
}

const params = new URLSearchParams(location.search)
const people = Number(params.get('people') ?? 4)
const from = Number(params.get('from') ?? 1)
const only = params.get('conditions')?.split(',').filter((c): c is Condition => (CONDITIONS as readonly string[]).includes(c))
document.getElementById('go')?.addEventListener('click', () => void main(from, people, only?.length ? only : CONDITIONS))
if (params.get('run') === '1') void main(from, people, only?.length ? only : CONDITIONS)
