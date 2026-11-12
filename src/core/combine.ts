// Combines what two independent readers found on the same photo. Two readers that agree are more trustworthy than one;
// two that disagree is a field the person should look at. Pure (no browser), so it is tested offline.
import type { FieldKey } from '../rules/types'
import type { Extraction } from './extract'

const NAMES: FieldKey[] = ['name', 'fatherName']

/** Letters and digits only. */
const squash = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '')
/** Words separated by single spaces; punctuation ignored. */
const words = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
/** Numbers and dates are the same however they are spaced; names and addresses must also agree on their words. */
const same = (f: FieldKey, a: string, b: string) => (NAMES.includes(f) || f === 'address' ? words(a) === words(b) : squash(a) === squash(b))

/**
 * `primary` is the reader whose value is shown; `second` is the cross-check.
 * - Only one reader found a field: that value, with its own "check this" status.
 * - Both found the same value: shown, and only marked for checking if both readers were unsure of it.
 * - Both found the same letters but spaced differently (a name run together, or split): the second reader's spacing is
 *   used, since the primary is the one known to drop or add spaces. Marked only if both were unsure.
 * - Different values: the primary's, marked for checking.
 */
export function combineReads(primary: Extraction, second: Extraction): Extraction {
  const fields: Extraction['fields'] = {}
  const check = new Set<FieldKey>()
  const keys = new Set([...Object.keys(primary.fields), ...Object.keys(second.fields)] as FieldKey[])
  for (const f of keys) {
    const p = primary.fields[f]
    const s = second.fields[f]
    const pCheck = primary.check.includes(f)
    const sCheck = second.check.includes(f)
    if (p && !s) {
      fields[f] = p
      if (pCheck) check.add(f)
    } else if (s && !p) {
      fields[f] = s
      if (sCheck) check.add(f)
    } else if (p && s) {
      if (same(f, p, s)) {
        fields[f] = p
        if (pCheck && sCheck) check.add(f)
      } else if (NAMES.includes(f) && squash(p) === squash(s)) {
        fields[f] = s
        if (pCheck && sCheck) check.add(f)
      } else {
        fields[f] = p
        check.add(f)
      }
    }
  }
  return { fields, check: [...check] }
}
