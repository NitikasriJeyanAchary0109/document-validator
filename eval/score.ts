// Scores photo reading against known answers. Pure (no browser), so it is unit-tested. The measurements that matter most:
// a wrong value the person is NOT told to check ("silent error") is the dangerous case; a wrong value that is flagged is
// the system working as designed.
import { formatDate, parseDate } from '../src/core/dates'
import { levenshtein } from '../src/core/names'
import type { FieldKey } from '../src/rules/types'

export type Fields = Partial<Record<FieldKey, string>>

export interface Result {
  kind: string
  condition: string
  truth: Fields
  fields: Fields
  check: FieldKey[]
  ms: number
  failed?: boolean
}

const DATE_FIELDS: FieldKey[] = ['dob', 'issueDate', 'expiryDate']

export function normalize(field: FieldKey, v: string | undefined): string {
  const s = (v ?? '').trim()
  if (!s) return ''
  if (DATE_FIELDS.includes(field)) {
    const p = parseDate(s)
    return p ? formatDate(p) : s
  }
  if (field === 'number') return s.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (field === 'address') return s.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  return s.toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function tokenF1(a: string, b: string): number {
  const ta = a.split(' ').filter(Boolean)
  const tb = b.split(' ').filter(Boolean)
  if (ta.length === 0 || tb.length === 0) return 0
  const pool = [...tb]
  let hit = 0
  for (const t of ta) {
    const i = pool.indexOf(t)
    if (i >= 0) {
      hit++
      pool.splice(i, 1)
    }
  }
  if (hit === 0) return 0
  const p = hit / ta.length
  const r = hit / tb.length
  return (2 * p * r) / (p + r)
}

/** A prediction counts as right if it matches exactly, or for addresses if its token F1 is at least 0.8. */
export function isRight(field: FieldKey, predicted: string | undefined, truth: string): boolean {
  const p = normalize(field, predicted)
  const t = normalize(field, truth)
  if (!p) return false
  return field === 'address' ? tokenF1(p, t) >= 0.8 : p === t
}

export type Outcome = 'right_unflagged' | 'right_flagged' | 'wrong_flagged' | 'wrong_silent' | 'missing' | 'hallucinated'

export function outcomeOf(r: Result, field: FieldKey): Outcome | null {
  const truth = r.truth[field]
  const pred = r.fields[field]
  if (truth === undefined) return pred && normalize(field, pred) ? 'hallucinated' : null
  if (!pred || !normalize(field, pred)) return 'missing'
  const flagged = r.check.includes(field)
  if (isRight(field, pred, truth)) return flagged ? 'right_flagged' : 'right_unflagged'
  return flagged ? 'wrong_flagged' : 'wrong_silent'
}

export interface Tally {
  scored: number
  right: number
  rightFlagged: number
  wrongFlagged: number
  silent: number
  missing: number
  hallucinated: number
}

const empty = (): Tally => ({ scored: 0, right: 0, rightFlagged: 0, wrongFlagged: 0, silent: 0, missing: 0, hallucinated: 0 })

export function tally(results: Result[], pick: (r: Result, f: FieldKey) => boolean = () => true): Map<string, Tally> {
  const out = new Map<string, Tally>()
  for (const r of results) {
    const fields = new Set<FieldKey>([...(Object.keys(r.truth) as FieldKey[]), ...(Object.keys(r.fields) as FieldKey[])])
    for (const f of fields) {
      if (!pick(r, f)) continue
      const o = outcomeOf(r, f)
      if (!o) continue
      const t = out.get(f) ?? empty()
      if (o === 'hallucinated') t.hallucinated++
      else {
        t.scored++
        if (o === 'right_unflagged') t.right++
        else if (o === 'right_flagged') {
          t.right++
          t.rightFlagged++
        } else if (o === 'wrong_flagged') t.wrongFlagged++
        else if (o === 'wrong_silent') t.silent++
        else t.missing++
      }
      out.set(f, t)
    }
  }
  return out
}

export function sum(ts: Iterable<Tally>): Tally {
  const o = empty()
  for (const t of ts) for (const k of Object.keys(o) as (keyof Tally)[]) o[k] += t[k]
  return o
}

export const pct = (n: number, d: number) => (d === 0 ? 'n/a' : `${((100 * n) / d).toFixed(1)}%`)

export function nameCer(results: Result[]): number | null {
  let edits = 0
  let chars = 0
  for (const r of results) {
    const t = r.truth.name
    if (t === undefined) continue
    const a = normalize('name', r.fields.name)
    const b = normalize('name', t)
    edits += levenshtein(a, b)
    chars += b.length
  }
  return chars === 0 ? null : edits / chars
}

export function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]!
}

function row(label: string, t: Tally): string {
  return `| ${label} | ${t.scored} | ${pct(t.right, t.scored)} | ${pct(t.silent, t.scored)} | ${pct(t.wrongFlagged, t.scored)} | ${pct(t.missing, t.scored)} | ${t.hallucinated} |`
}

const HEAD = '| | fields | right | silent wrong | wrong but flagged | missed | invented |\n|---|---|---|---|---|---|---|'

/** Markdown report: overall, by field, by degradation, by document, and latency. */
export function report(results: Result[]): string {
  const ok = results.filter((r) => !r.failed)
  const lines: string[] = []
  const all = tally(ok)
  lines.push(`Images: ${results.length} (${results.length - ok.length} failed to read)`, '')
  lines.push('**Overall**', '', HEAD, row('all fields', sum(all.values())), '')
  lines.push('**By field**', '', HEAD, ...[...all.entries()].sort().map(([f, t]) => row(f, t)), '')
  const conds = [...new Set(ok.map((r) => r.condition))]
  lines.push('**By degradation**', '', HEAD, ...conds.map((c) => row(c, sum(tally(ok.filter((r) => r.condition === c)).values()))), '')
  const kinds = [...new Set(ok.map((r) => r.kind))]
  lines.push('**By document**', '', HEAD, ...kinds.map((k) => row(k, sum(tally(ok.filter((r) => r.kind === k)).values()))), '')
  const cer = nameCer(ok)
  const all2 = sum(all.values())
  lines.push(`Name character error rate: ${cer === null ? 'n/a' : (100 * cer).toFixed(1) + '%'}`)
  lines.push(`Right values the person is still asked to check: ${pct(all2.rightFlagged, all2.right)} of right values`)
  const ms = ok.map((r) => r.ms)
  lines.push(`Read time per image: p50 ${(percentile(ms, 50) / 1000).toFixed(1)} s, p95 ${(percentile(ms, 95) / 1000).toFixed(1)} s`)
  return lines.join('\n')
}

