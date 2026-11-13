// Combines what two independent readers found on the same photo. Two readers that agree are more trustworthy than one;
// two that disagree is a field the person should look at. Pure (no browser), so it is tested offline.
import type { FieldKey } from '../rules/types'
import type { Extraction, Mark } from './extract'

const NAMES: FieldKey[] = ['name', 'fatherName']

/** Kinds of mark that two readers agreeing on the value settles. Tuned by `eval/` (docs/photo-accuracy.md). */
export const agreement = {
  clears: ['position'] as Mark[],
  /** Addresses are long and one reader often picks up junk from the lines next to them, so for them a low-confidence read also counts. */
  addressClears: ['position', 'confidence'] as Mark[],
}

/** Letters and digits only. */
const squash = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '')
/** Words separated by single spaces; punctuation ignored. */
const words = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
/** Share of words two lists have in common, between 0 and 1 (2 * shared / (a + b)). */
function overlap(a: string[], b: string[]): number {
  const pool = [...b]
  let hit = 0
  for (const t of a) {
    const i = pool.indexOf(t)
    if (i >= 0) {
      hit++
      pool.splice(i, 1)
    }
  }
  return a.length + b.length === 0 ? 0 : (2 * hit) / (a.length + b.length)
}

/** The same address: every token with a digit in it (house number, PIN code) identical, and the rest of the words mostly shared. */
function sameAddress(a: string, b: string): boolean {
  const wa = words(a).split(' ')
  const wb = words(b).split(' ')
  const digits = (w: string[]) => w.filter((t) => /\d/.test(t)).sort().join(' ')
  return digits(wa) === digits(wb) && overlap(wa, wb) >= 0.85
}

/** Numbers and dates are the same however they are spaced; names and addresses must also agree on their words. */
const same = (f: FieldKey, a: string, b: string) => (f === 'address' ? sameAddress(a, b) : NAMES.includes(f) ? words(a) === words(b) : squash(a) === squash(b))

/**
 * `primary` is the reader whose value is shown; `second` is the cross-check.
 * - Only the primary found a field: that value, with its own "check this" status. Only the second: that value, marked.
 * - Both found the same value: shown, and only marked for checking if both readers were unsure of it for a reason that
 *   agreement does not settle (`agreement.clears`: a value found by position rather than by a label is settled by two readers
 *   finding the same thing; a format failure or cleaned-off junk is not).
 * - Both found the same letters but spaced differently (a name run together, or split): the second reader's spacing is
 *   used, since the primary is the one known to drop or add spaces. Marked if either reader was unsure.
 * - Different values: the primary's, marked for checking.
 */
export function combineReads(primary: Extraction, second: Extraction): Extraction {
  const fields: Extraction['fields'] = {}
  const check = new Set<FieldKey>()
  const marks: Partial<Record<FieldKey, Mark>> = {}
  const mark = (f: FieldKey, m: Mark) => {
    check.add(f)
    marks[f] = m
  }
  const keys = new Set([...Object.keys(primary.fields), ...Object.keys(second.fields)] as FieldKey[])
  for (const f of keys) {
    const p = primary.fields[f]
    const s = second.fields[f]
    const pCheck = primary.check.includes(f)
    const sCheck = second.check.includes(f)
    const pMark = primary.marks?.[f] ?? 'format'
    const sMark = second.marks?.[f] ?? 'format'
    // On agreement a mark stays only if both readers were unsure, and not just for a reason that agreement settles.
    const clears = f === 'address' ? agreement.addressClears : agreement.clears
    const stays = pCheck && sCheck && !(clears.includes(pMark) && clears.includes(sMark))
    if (p && !s) {
      fields[f] = p
      if (pCheck) mark(f, pMark)
    } else if (s && !p) {
      // Only the cross-check found it, so nothing confirms it: always marked.
      fields[f] = s
      mark(f, 'format')
    } else if (p && s) {
      if (same(f, p, s)) {
        fields[f] = p
        if (stays) mark(f, pMark)
      } else if (NAMES.includes(f) && squash(p) === squash(s)) {
        // The readers differ on where the spaces go, so this is not agreement: either reader's doubt keeps the mark.
        fields[f] = s
        if (pCheck) mark(f, pMark)
        else if (sCheck) mark(f, sMark)
      } else {
        fields[f] = p
        mark(f, 'format')
      }
    }
  }
  return { fields, check: [...check], marks }
}
