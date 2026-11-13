// Turns OCR text from a photo of a document into the fields the checker asks for. Pure text in, fields out: no image
// handling and no browser APIs, so it is tested offline with invented text. The user always confirms the result, so
// anything we are unsure about is flagged in `check` instead of being dropped or guessed silently.
import { DOCS } from '../rules/documents'
import type { DocTypeId, FieldKey } from '../rules/types'
import { compareFull, formatDate, parseFullDate } from './dates'
import { parseMrz } from './mrz'
import { levenshtein } from './names'
import { validateNumber, type NumberKind } from './validators'

export interface OcrLine {
  text: string
  /** Mean word confidence 0-100 from the OCR engine. */
  conf: number
}

/** Why a field is marked: it failed a format check or had junk cleaned off ('format'), it was found by position or pattern rather
 *  than by a label ('position'), or the line was read with low confidence ('confidence'). Several apply: the first listed wins, so a value found by position AND read with low confidence is a 'confidence' mark. */
export type Mark = 'format' | 'confidence' | 'position'

export interface Extraction {
  fields: Partial<Record<FieldKey, string>>
  /** Fields the user should look at twice: guessed by position, failed a format check, or read with low confidence. */
  check: FieldKey[]
  /** The reason for each marked field, so that two readers agreeing can clear the kinds of mark that agreement settles. */
  marks?: Partial<Record<FieldKey, Mark>>
}

/** Lines read below this confidence are marked for checking. Tuned by `eval/` on invented cards. */
export const tuning = { lowConf: 70, /** Use a passport's machine-readable lines. The evaluation switches it off to measure what it adds. */ mrz: true }

export const linesFromText = (text: string): OcrLine[] => text.split(/\r?\n/).map((t) => ({ text: t, conf: 100 }))

const clean = (l: OcrLine): OcrLine => ({ text: l.text.replace(/\s+/g, ' ').trim(), conf: l.conf })

/** Letters an OCR engine often returns where a digit was printed. Only applied inside tokens that must be digits. */
const DIGIT_FIX: Record<string, string> = { O: '0', o: '0', I: '1', l: '1', L: '1', '|': '1', S: '5', B: '8' }
const fixDigits = (s: string) => s.replace(/[OoIlL|SB]/g, (c) => DIGIT_FIX[c] ?? c)
const LETTER_FIX: Record<string, string> = { '0': 'O', '1': 'I', '5': 'S', '8': 'B' }
const fixLetters = (s: string) => s.replace(/[0158]/g, (c) => LETTER_FIX[c] ?? c)

// ---- dates

const DATE_RE = /([0-9OoIl|]{1,2})\s*[/\-.]\s*([0-9OoIl|]{1,2})\s*[/\-.]\s*([0-9OoIl|]{4})/g

/** Dates found in the text. Cards print day and month as two digits, so a one-digit day or month usually means a digit
 *  was lost in the photo ("A 5/03/1980" for "15/03/1980"); such a date is returned but marked unsure. */
/** Day, month and year with the second separator read as 7, 1, I, l or |: "09/0772033". */
const DAMAGED_DATE_RE = /(?<!\d)(\d{2})\s*[/\-.]\s*(\d{2})[71Il|]((?:19|20)\d{2})(?!\d)/g

function datesIn(text: string): { value: string; unsure: boolean }[] {
  const out: { value: string; unsure: boolean }[] = []
  for (const m of text.matchAll(DATE_RE)) {
    const p = parseFullDate(`${fixDigits(m[1]!)}/${fixDigits(m[2]!)}/${fixDigits(m[3]!)}`)
    if (p) out.push({ value: formatDate(p), unsure: m[1]!.length < 2 || m[2]!.length < 2 })
  }
  if (out.length === 0) {
    // One separator may have been read as a digit-like character ("09/0772033" for "09/07/2033"). It is only accepted when
    // what is left is a real date with a plausible year, and the person is asked to check it.
    for (const m of text.matchAll(DAMAGED_DATE_RE)) {
      const p = parseFullDate(`${m[1]}/${m[2]}/${m[3]}`)
      if (p) out.push({ value: formatDate(p), unsure: true })
    }
  }
  return out
}

// ---- label helpers

interface Hit {
  value: string
  conf: number
  /** The value was found but should be checked by the person whatever the confidence. */
  unsure?: boolean
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

/** Words that head a passport's printed fields, so a line starting with one is a label and not a name. */
const PASSPORT_LABEL = /^[^A-Za-z]*(type|country|passport|republic|s[a-z]{1,2}name|[cgq][ij1l]ven|name|date|sex|place|nationality|issue|expiry|authority|holder)/i

interface Part {
  hit: Hit
  /** Index of the line the value is on, and of the line with the label. */
  at: number
  labelAt: number
  by: 'label' | 'position'
}

/** A line that is a plain name: letters, spaces and the odd dot or hyphen, and not a field label. */
const plainName = (l: OcrLine | undefined): l is OcrLine => !!l && /^[A-Za-z .'-]{2,}$/.test(l.text) && !PASSPORT_LABEL.test(l.text)

/**
 * The value printed under a passport label such as "Surname" or "Given Name(s)". Photos misspell labels ("Sumame", "Civen
 * Narme(s)"), so the label word is matched by edit distance, and a "Name(s)" word after "Given" is skipped.
 */
function passportLabelValue(lines: OcrLine[], label: string, maxDistance: number): Part | null {
  for (let i = 0; i < lines.length; i++) {
    const words = lines[i]!.text.split(' ')
    for (let j = 0; j < words.length; j++) {
      const w = words[j]!.replace(/[^A-Za-z]/g, '').toLowerCase()
      if (Math.abs(w.length - label.length) > maxDistance || levenshtein(w, label) > maxDistance) continue
      let rest = words.slice(j + 1)
      if (/^n[a-z]{1,4}\(?s?\)?$/i.test(rest[0] ?? '') && label === 'given') rest = rest.slice(1)
      const same = rest.join(' ').trim()
      if (/[A-Za-z]{2}/.test(same) && !PASSPORT_LABEL.test(same)) return { hit: { value: same, conf: lines[i]!.conf }, at: i, labelAt: i, by: 'label' }
      const next = lines[i + 1]
      if (plainName(next)) return { hit: { value: next.text, conf: next.conf }, at: i + 1, labelAt: i, by: 'label' }
    }
  }
  return null
}

/** Surname and given names of a passport. If one label cannot be found, the plain line next to the other one is taken. */
function passportParts(lines: OcrLine[]): { sur: Part | null; given: Part | null } {
  let sur = passportLabelValue(lines, 'surname', 2)
  let given = passportLabelValue(lines, 'given', 1)
  if (!sur && given) {
    // The printed order is Surname, then Given Name(s): the plain line above the given-names label is the surname.
    const above = lines[given.labelAt - 1]
    if (plainName(above)) sur = { hit: { value: above.text, conf: above.conf }, at: given.labelAt - 1, labelAt: given.labelAt - 1, by: 'position' }
  }
  if (sur && !given) {
    // The given names follow the surname, after their (unreadable) label if that was read as a line of its own.
    const skip = /[cgq][ij1l]ven/i.test(lines[sur.at + 1]?.text ?? '') ? 2 : 1
    const below = lines[sur.at + skip]
    if (plainName(below)) given = { hit: { value: below.text, conf: below.conf }, at: sur.at + skip, labelAt: sur.at, by: 'position' }
  }
  return { sur, given }
}

/** A line that looks like another field label, so it is not mistaken for the value of the one before it. */
const LABELISH = /^[^A-Za-z]*(father|mother|husband|name|date|dob|d\.o\.b|gender|sex|address|issue|valid|expiry|signature|permanent)/i

/**
 * The date after a label. Photos misspell labels ("Date of Brth", "rate of Birth"), so when the label pattern finds nothing,
 * `fuzzy` gives label words to match by edit distance instead, as [word, largest distance].
 */
function dateAfter(lines: OcrLine[], label: RegExp, fuzzy: [string, number][] = []): Hit | null {
  const re = new RegExp(label.source, 'i')
  const after = (i: number, rest: string): Hit | null => {
    const same = datesIn(rest)
    if (same[0]) return { value: same[0].value, conf: lines[i]!.conf, unsure: same[0].unsure }
    const next = lines[i + 1]
    const nd = next ? datesIn(next.text) : []
    if (next && nd[0]) return { value: nd[0].value, conf: next.conf, unsure: nd[0].unsure }
    return null
  }
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i]!.text
    const m = re.exec(t)
    if (!m) continue
    const hit = after(i, t.slice(m.index + m[0].length))
    if (hit) return hit
  }
  for (const [word, distance] of fuzzy) {
    for (let i = 0; i < lines.length; i++) {
      const words = lines[i]!.text.split(' ')
      for (let j = 0; j < words.length; j++) {
        const w = words[j]!.replace(/[^A-Za-z]/g, '').toLowerCase()
        if (w.length < 3 || Math.abs(w.length - word.length) > distance || levenshtein(w, word) > distance) continue
        const hit = after(i, words.slice(j + 1).join(' '))
        if (hit) return hit
      }
    }
  }
  return null
}

/**
 * Letters only. Photos add junk to the end of a name line (a border, a photo edge, a stamp): short or mixed-case
 * tails such as "ARJUN PATEL oO" or "ASHA SHARMA O". Those are dropped, and the name is marked for checking.
 */
/** A name word of this many letters or more is marked as possibly two words run together. Tuned by `eval/`. */
const LONG_NAME_WORD = 10
const suspectWord = (w: string) => w.replace(/[^A-Za-z]/g, '').length >= LONG_NAME_WORD || /[A-Za-z]\.[A-Za-z]/.test(w)

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
  // A very long word is often two words the photo ran together ("GURPREETKUMARI"), and a dot inside a word is junk ("AR.JUN").
  if (t.some(suspectWord)) unsure = true
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
  const marks: Partial<Record<FieldKey, Mark>> = {}
  /** The surname as read from the printed text of a passport, which the machine-readable lines are lined up against. */
  let printedSurname: string | undefined
  const RANK: Mark[] = ['format', 'confidence', 'position']
  const mark = (f: FieldKey, m: Mark) => {
    check.add(f)
    if (!marks[f] || RANK.indexOf(m) < RANK.indexOf(marks[f]!)) marks[f] = m
  }
  const put = (f: FieldKey, hit: Hit | null, unsure: false | Mark = false) => {
    if (!hit || fields[f]) return
    fields[f] = hit.value
    if (unsure) mark(f, unsure)
    if (hit.unsure) mark(f, 'format')
    if (hit.conf < tuning.lowConf) mark(f, 'confidence')
  }

  for (const f of def.fields) {
    switch (f) {
      case 'number': {
        if (!def.numberKind) break
        if (def.numberKind === 'plain') {
          put('number', afterLabel(lines, /(?:l\.?\s*l\.?|licen[cs]e|learner'?s?)\s*(?:no|number)\.?/), 'position')
          break
        }
        const n = findNumber(lines, def.numberKind)
        if (n) put('number', n.hit, n.valid ? false : 'format')
        break
      }
      case 'dob':
        put('dob', dateAfter(lines, DOB_LABEL, type === 'passport' ? [['birth', 2]] : []))
        break
      case 'issueDate':
        put('issueDate', dateAfter(lines, ISSUE_LABEL))
        break
      case 'expiryDate':
        put('expiryDate', dateAfter(lines, EXPIRY_LABEL, type === 'passport' ? [['expiry', 2]] : []))
        break
      case 'fatherName': {
        const h = afterLabel(lines, FATHER_LABEL)
        if (h) {
          const n = cleanName(h.value)
          put('fatherName', { ...h, value: n.value }, n.unsure || !/^[A-Za-z .'-]{3,}$/.test(h.value) ? 'format' : false)
        }
        break
      }
      case 'name': {
        if (type === 'passport') {
          const parts = passportParts(lines)
          printedSurname = parts.sur?.hit.value
          const given = parts.given?.hit
          const sur = parts.sur?.hit
          if (given || sur) {
            const n = cleanName(`${given?.value ?? ''} ${sur?.value ?? ''}`)
            // A passport has both parts: with one missing, the name is incomplete. One found only by its place is marked as such.
            const how = parts.sur?.by === 'position' || parts.given?.by === 'position' ? 'position' : false
            put('name', { value: n.value, conf: Math.min(given?.conf ?? 100, sur?.conf ?? 100) }, n.unsure || !given || !sur ? 'format' : how)
          }
          break
        }
        const labelled = afterLabel(lines, NAME_LABEL, { not: /father|mother|husband|s\/o|d\/o|w\/o|guardian|\bson\b/i })
        if (labelled) {
          const n = cleanName(labelled.value)
          put('name', { ...labelled, value: n.value }, n.unsure ? 'format' : false)
        }
        else if (type === 'aadhaar') put('name', aadhaarName(lines), 'position')
        break
      }
      case 'address':
        put('address', addressOf(lines), 'position')
        break
    }
  }
  // A passport prints the date of birth above the date of expiry. When their labels were too damaged to read, two dates on the
  // page (not counting the machine-readable lines) are taken in that order, and one date left over goes to the field still empty.
  if (type === 'passport' && (!fields.dob || !fields.expiryDate)) {
    const seen: { value: string; conf: number }[] = []
    for (const l of lines) {
      if (/<{2,}/.test(l.text)) continue
      for (const d of datesIn(l.text)) if (!seen.some((x) => x.value === d.value) && !d.unsure) seen.push({ value: d.value, conf: l.conf })
    }
    const left = seen.filter((d) => d.value !== fields.dob && d.value !== fields.expiryDate)
    const when = (v: string) => parseFullDate(v)
    const before = (a: string, b: string) => {
      const x = when(a)
      const y = when(b)
      return !!x && !!y && compareFull(x, y) < 0
    }
    if (!fields.dob && !fields.expiryDate && left.length === 2 && before(left[0]!.value, left[1]!.value)) {
      put('dob', left[0]!, 'position')
      put('expiryDate', left[1]!, 'position')
    } else if (!fields.expiryDate && fields.dob && left.length === 1 && before(fields.dob, left[0]!.value)) put('expiryDate', left[0]!, 'position')
    else if (!fields.dob && fields.expiryDate && left.length === 1 && before(left[0]!.value, fields.expiryDate)) put('dob', left[0]!, 'position')
  }
  // A passport's machine-readable lines carry check digits. A value that passes its own check digit is shown instead of the
  // printed one; it is also trusted without a mark when the printed text agrees with it or the check over the whole line
  // passes too (a lone check digit has ten values, so on its own it lets about one wrong read in ten through).
  const mrz = type === 'passport' && tuning.mrz ? parseMrz(lines.map((l) => l.text)) : null
  if (mrz) {
    const take = (f: FieldKey, v: string | undefined) => {
      if (!v) return
      const agrees = fields[f] === v
      fields[f] = v
      if (agrees || mrz.composite) {
        check.delete(f)
        delete marks[f]
      } else mark(f, 'format')
    }
    take('number', mrz.number)
    take('dob', mrz.dob)
    take('expiryDate', mrz.expiry)
    // The names on line 1 give "given names + surname" with the spacing the "<" marks. When the double "<<" between surname and
    // given names was not read, the printed surname says where the surname ends.
    let name: string | undefined
    const letters = (v: string) => v.toUpperCase().replace(/[^A-Z]/g, '')
    if (mrz.tokens && printedSurname) {
      const want = letters(printedSurname)
      for (let k = 1; k < mrz.tokens.length && !name; k++) {
        if (letters(mrz.tokens.slice(0, k).join('')) === want) name = `${mrz.tokens.slice(k).join(' ')} ${mrz.tokens.slice(0, k).join(' ')}`
      }
    }
    if (!name && mrz.surname && mrz.given) name = `${mrz.given} ${mrz.surname}`
    if (name) {
      // No check digit covers names: they replace the printed name only when they agree with it (which also settles its
      // spacing), complete a cut-short printed name, and fill it in when it was not read at all (both marked for checking).
      if (fields.name && letters(fields.name) === letters(name)) {
        fields.name = name
        // Both lines come from the same recogniser, which runs words together in the same way on both: a very long word
        // stays marked even though the two agree.
        if (name.split(' ').some(suspectWord)) mark('name', 'format')
        else {
          check.delete('name')
          delete marks.name
        }
      } else if (fields.name && letters(name).includes(letters(fields.name)) && letters(fields.name).length >= 3) {
        // The printed name was cut short (a missing surname line): the lines complete it, still marked.
        fields.name = name
        mark('name', 'format')
      } else if (!fields.name) {
        fields.name = name
        mark('name', 'format')
      }
    }
  }
  // Drop empties that cleaning reduced to nothing.
  for (const k of Object.keys(fields) as FieldKey[]) if (!fields[k]?.trim()) delete fields[k]
  const kept = [...check].filter((f) => fields[f] !== undefined)
  return { fields, check: kept, marks: Object.fromEntries(kept.map((f) => [f, marks[f]!])) }
}
