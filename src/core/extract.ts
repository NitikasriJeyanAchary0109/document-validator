// Turns OCR text from a photo of a document into the fields the checker asks for. Pure text in, fields out: no image
// handling and no browser APIs, so it is tested offline with invented text. The user always confirms the result, so
// anything we are unsure about is flagged in `check` instead of being dropped or guessed silently.
import { DOCS } from '../rules/documents'
import type { DocTypeId, FieldKey } from '../rules/types'
import { formatDate, parseFullDate } from './dates'
import { validateNumber, type NumberKind } from './validators'

export interface OcrLine {
  text: string
  /** Mean word confidence 0-100 from the OCR engine. */
  conf: number
}

export interface Extraction {
  fields: Partial<Record<FieldKey, string>>
  /** Fields the user should look at twice: guessed by position, failed a format check, or read with low confidence. */
  check: FieldKey[]
}

/** Lines read below this confidence are marked for checking. Tuned by `eval/` on invented cards. */
export const tuning = { lowConf: 70 }

export const linesFromText = (text: string): OcrLine[] => text.split(/\r?\n/).map((t) => ({ text: t, conf: 100 }))

const clean = (l: OcrLine): OcrLine => ({ text: l.text.replace(/\s+/g, ' ').trim(), conf: l.conf })

/** Letters an OCR engine often returns where a digit was printed. Only applied inside tokens that must be digits. */
const DIGIT_FIX: Record<string, string> = { O: '0', o: '0', I: '1', l: '1', L: '1', '|': '1', S: '5', B: '8' }
const fixDigits = (s: string) => s.replace(/[OoIlL|SB]/g, (c) => DIGIT_FIX[c] ?? c)
const LETTER_FIX: Record<string, string> = { '0': 'O', '1': 'I', '5': 'S', '8': 'B' }
const fixLetters = (s: string) => s.replace(/[0158]/g, (c) => LETTER_FIX[c] ?? c)

// ---- dates

const DATE_RE = /([0-9OoIl|]{1,2})\s*[/\-.]\s*([0-9OoIl|]{1,2})\s*[/\-.]\s*([0-9OoIl|]{4})/g

function datesIn(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(DATE_RE)) {
    const p = parseFullDate(`${fixDigits(m[1]!)}/${fixDigits(m[2]!)}/${fixDigits(m[3]!)}`)
    if (p) out.push(formatDate(p))
  }
  return out
}

// ---- label helpers

interface Hit {
  value: string
  conf: number
}

/** The text after a label, on the same line or, if the label stands alone, on the next line. */
function afterLabel(lines: OcrLine[], label: RegExp, opts: { not?: RegExp; stop?: RegExp } = {}): Hit | null {
  // Cards print labels in two scripts ("नाम / Name"); an English-only OCR reads the first half as junk before the slash.
  const re = new RegExp(`^(?:.*?/\\s*)?[^A-Za-z]*(?:${label.source})\\s*[:\\-.]?\\s*(.*)$`, 'i')
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i]!.text
    if (opts.not?.test(t)) continue
    const m = re.exec(t)
    if (!m) continue
    const rest = (m[m.length - 1] ?? '').trim()
    if (/[A-Za-z0-9]{2}/.test(rest)) return { value: rest, conf: lines[i]!.conf }
    const next = lines[i + 1]
    if (next && /[A-Za-z0-9]{2}/.test(next.text) && !(opts.stop ?? LABELISH).test(next.text)) return { value: next.text, conf: next.conf }
  }
  return null
}

/** A line that looks like another field label, so it is not mistaken for the value of the one before it. */
const LABELISH = /^[^A-Za-z]*(father|mother|husband|name|date|dob|d\.o\.b|gender|sex|address|issue|valid|expiry|signature|permanent)/i

function dateAfter(lines: OcrLine[], label: RegExp): Hit | null {
  const re = new RegExp(label.source, 'i')
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i]!.text
    const m = re.exec(t)
    if (!m) continue
    const same = datesIn(t.slice(m.index + m[0].length))
    if (same[0]) return { value: same[0], conf: lines[i]!.conf }
    const next = lines[i + 1]
    const nd = next ? datesIn(next.text) : []
    if (next && nd[0]) return { value: nd[0], conf: next.conf }
  }
  return null
}

/**
 * Letters only. Photos add junk to the end of a name line (a border, a photo edge, a stamp): short or mixed-case
 * tails such as "ARJUN PATEL oO" or "ASHA SHARMA O". Those are dropped, and the name is marked for checking.
 */
function cleanName(raw: string): { value: string; unsure: boolean } {
  const t = raw.replace(/[^A-Za-z .'-]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  let unsure = false
  const last = () => t[t.length - 1]!
  while (t.length >= 3 && /[a-z]/.test(last()) && t.slice(0, -1).every((x) => x === x.toUpperCase())) {
    t.pop()
    unsure = true
  }
  while (t.length >= 3 && last().length <= 2) {
    t.pop()
    unsure = true
  }
  while (t.length >= 2 && t[0]!.length <= 2 && /[a-z]/.test(t[0]!) && t[1] === t[1]!.toUpperCase()) {
    t.shift()
    unsure = true
  }
  if (t.length === 2 && last().length <= 2) unsure = true
  return { value: t.join(' '), unsure }
}

// ---- numbers

const compact = (s: string) => s.toUpperCase().replace(/[\s\-.]/g, '')

function numberCandidates(kind: NumberKind, line: string): string[] {
  // A date with dashes or dots would otherwise compact into a plausible 8-digit "number".
  const text = line.replace(DATE_RE, ' ')
  // The whole line with spaces removed (numbers printed in groups, "9081 2003 5144") and each word alone ("IND 17598775").
  const chunks = [compact(text), ...text.split(/\s+/).map(compact).filter(Boolean)]
  const find = (re: RegExp, fix: (s: string) => string = (s) => s) => [...new Set(chunks.flatMap((c) => [...c.matchAll(re)].map((m) => fix(m[0]))))]
  switch (kind) {
    case 'aadhaar':
      return find(/(?<![0-9A-Z])[0-9OILSB|]{12}(?![0-9A-Z])/g, fixDigits).filter((x) => /^\d{12}$/.test(x))
    case 'pan':
      return find(/(?<![0-9A-Z])[A-Z0-9]{10}(?![0-9A-Z])/g, (s) => fixLetters(s.slice(0, 5)) + fixDigits(s.slice(5, 9)) + fixLetters(s[9]!))
    case 'passport':
      return find(/(?<![0-9A-Z])[A-Z0-9][0-9OILSB|]{7}(?![0-9A-Z])/g, (s) => fixLetters(s[0]!) + fixDigits(s.slice(1)))
    case 'voter_id':
      return find(/(?<![0-9A-Z])[A-Z0-9]{3}[0-9OILSB|]{7}(?![0-9A-Z])/g, (s) => fixLetters(s.slice(0, 3)) + fixDigits(s.slice(3)))
    case 'driving_licence':
      return find(/[A-Z]{2}\d{13}/g)
    case 'vehicle':
      return find(/(?:[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{1,4}|\d{2}BH\d{4}[A-Z]{1,2})/g)
    case 'plain':
      return []
  }
}

function findNumber(lines: OcrLine[], kind: NumberKind): { hit: Hit; valid: boolean } | null {
  let first: Hit | null = null
  for (const l of lines) {
    for (const cand of numberCandidates(kind, l.text)) {
      const r = validateNumber(kind, cand)
      if (r.status === 'valid') return { hit: { value: r.normalized, conf: l.conf }, valid: true }
      first ??= { value: r.normalized, conf: l.conf }
    }
  }
  return first ? { hit: first, valid: false } : null
}

// ---- per-field extraction

const NAME_LABEL = /(?:elector'?s\s+)?name/
const FATHER_LABEL = /father'?s?\s*(?:name)?|(?:पिता|pita)/
const DOB_LABEL = /d\.?\s*o\.?\s*b|date\s*of\s*birth|birth\s*date|जन्म/i
const ISSUE_LABEL = /date\s*of\s*issue|issue\s*date|issued\s*on|d\.?\s*o\.?\s*i\b/
const EXPIRY_LABEL = /valid\s*(?:till|upto|up\s*to|until|to)|date\s*of\s*expiry|expiry\s*date|expires?(?:\s*on)?|validity|nt\s*\)?\s*:?\s*valid/

const NOT_A_NAME = /government|india|authority|male|female|address|\bvid\b|aadhaar|enrol|download|unique|identification|income\s*tax|permanent|account|driving|licen[cs]e|republic|election|commission|card/i

function aadhaarName(lines: OcrLine[]): Hit | null {
  // On the front of an Aadhaar the name is the line just above the date of birth.
  const at = lines.findIndex((l) => DOB_LABEL.test(l.text) && /\d{2}|[Yy]ear/.test(l.text + (lines[lines.indexOf(l) + 1]?.text ?? '')))
  for (let i = at - 1; i >= 0 && i >= at - 3; i--) {
    const t = lines[i]!.text
    const n = cleanName(t).value
    if (n.length >= 3 && /^[A-Za-z .'-]+$/.test(n.replace(/\s/g, '')) && !NOT_A_NAME.test(n) && (t.match(/[A-Za-z]/g)?.length ?? 0) >= 3) return { value: n, conf: lines[i]!.conf }
  }
  return null
}

function addressOf(lines: OcrLine[]): Hit | null {
  const at = lines.findIndex((l) => /^[^A-Za-z]*address/i.test(l.text))
  if (at < 0) return null
  const parts: string[] = []
  let conf = 100
  for (let i = at; i < Math.min(lines.length, at + 7); i++) {
    let t = lines[i]!.text
    if (i === at) t = t.replace(/^[^A-Za-z]*address\s*[:\-]?\s*/i, '')
    if (/\bvid\b|aadhaar|help@|www\.|uidai/i.test(t)) break
    if (t.trim().length < 2) continue
    parts.push(t.trim())
    conf = Math.min(conf, lines[i]!.conf)
    if (/\b[1-9]\d{5}\b/.test(t)) break
  }
  const joined = parts.join(', ').replace(/\s+,/g, ',').replace(/,\s*,/g, ',').trim()
  return joined.length >= 8 ? { value: joined, conf } : null
}

export function extractFields(type: DocTypeId, input: string | OcrLine[]): Extraction {
  const lines = (typeof input === 'string' ? linesFromText(input) : input).map(clean).filter((l) => l.text.length > 0)
  const def = DOCS[type]
  const fields: Extraction['fields'] = {}
  const check = new Set<FieldKey>()
  const put = (f: FieldKey, hit: Hit | null, unsure = false) => {
    if (!hit || fields[f]) return
    fields[f] = hit.value
    if (unsure || hit.conf < tuning.lowConf) check.add(f)
  }

  for (const f of def.fields) {
    switch (f) {
      case 'number': {
        if (!def.numberKind) break
        if (def.numberKind === 'plain') {
          put('number', afterLabel(lines, /(?:l\.?\s*l\.?|licen[cs]e|learner'?s?)\s*(?:no|number)\.?/), true)
          break
        }
        const n = findNumber(lines, def.numberKind)
        if (n) put('number', n.hit, !n.valid)
        break
      }
      case 'dob':
        put('dob', dateAfter(lines, DOB_LABEL))
        break
      case 'issueDate':
        put('issueDate', dateAfter(lines, ISSUE_LABEL))
        break
      case 'expiryDate':
        put('expiryDate', dateAfter(lines, EXPIRY_LABEL))
        break
      case 'fatherName': {
        const h = afterLabel(lines, FATHER_LABEL)
        if (h) {
          const n = cleanName(h.value)
          put('fatherName', { ...h, value: n.value }, n.unsure || !/^[A-Za-z .'-]{3,}$/.test(h.value))
        }
        break
      }
      case 'name': {
        if (type === 'passport') {
          const given = afterLabel(lines, /given\s*name\(?s?\)?/)
          const sur = afterLabel(lines, /surname/)
          if (given || sur) {
            const n = cleanName(`${given?.value ?? ''} ${sur?.value ?? ''}`)
            // A passport has both parts: with one missing, the name is incomplete.
            put('name', { value: n.value, conf: Math.min(given?.conf ?? 100, sur?.conf ?? 100) }, n.unsure || !given || !sur)
          }
          break
        }
        const labelled = afterLabel(lines, NAME_LABEL, { not: /father|mother|husband|s\/o|d\/o|w\/o|guardian|\bson\b/i })
        if (labelled) {
          const n = cleanName(labelled.value)
          put('name', { ...labelled, value: n.value }, n.unsure)
        }
        else if (type === 'aadhaar') put('name', aadhaarName(lines), true)
        break
      }
      case 'address':
        put('address', addressOf(lines), true)
        break
    }
  }
  // Drop empties that cleaning reduced to nothing.
  for (const k of Object.keys(fields) as FieldKey[]) if (!fields[k]?.trim()) delete fields[k]
  return { fields, check: [...check].filter((f) => fields[f] !== undefined) }
}
