// Reads the two machine-readable lines at the bottom of a passport photo (ICAO 9303, 44 characters each). Their check
// digits tell us when a value was read correctly, so a number or date that passes is far more trustworthy than the
// same value read from the printed text above. Pure text in, values out: tested offline with invented lines.
import { formatDate } from './dates'

export interface Mrz {
  /** Values read from line 2, each only when its check digit passes (after turning letters read for digits back into digits). */
  number?: string
  dob?: string
  expiry?: string
  /** From line 1. There is no check digit for names, so these only support or fill in the printed ones. */
  surname?: string
  given?: string
  /** Every name word on line 1 in order, surname first, for when the "<<" between surname and given names was not read. */
  tokens?: string[]
  /** The check digit over the whole of line 2 also passes: number, both dates and the empty personal-number field all read right. */
  composite?: boolean
}

const WEIGHTS = [7, 3, 1]

/** ICAO check digit: weights 7, 3, 1 repeating; digits count as themselves, A to Z as 10 to 35, "<" as 0. */
export function checkDigit(s: string): number {
  let sum = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!
    const v = c === '<' ? 0 : c >= '0' && c <= '9' ? c.charCodeAt(0) - 48 : c >= 'A' && c <= 'Z' ? c.charCodeAt(0) - 55 : -1
    if (v < 0) return -1
    sum += v * WEIGHTS[i % 3]!
  }
  return sum % 10
}

/** What an OCR engine returns for a printed digit, and for a printed letter. */
const TO_DIGIT: Record<string, string> = { O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', S: '5', G: '6', B: '8' }
const TO_LETTER: Record<string, string> = { '0': 'O', '1': 'I', '2': 'Z', '5': 'S', '6': 'G', '8': 'B' }
const asDigits = (s: string) => s.replace(/[A-Z]/g, (c) => TO_DIGIT[c] ?? c)
const asLetters = (s: string) => s.replace(/[0-9]/g, (c) => TO_LETTER[c] ?? c)

/** Whether the value's check digit passes. There is no guessing at repairs: a check digit has only ten values, so a search
 *  over look-alike characters would accept a wrong value about one time in ten. */
const passes = (value: string, check: string) => /^[0-9]$/.test(check) && checkDigit(value) === Number(check)

/** YYMMDD to DD/MM/YYYY, or null if it is not a real date. A birth date cannot be in the future; an expiry date is this century. */
function toDate(yymmdd: string, kind: 'birth' | 'expiry', now = new Date()): string | null {
  if (!/^\d{6}$/.test(yymmdd)) return null
  const yy = Number(yymmdd.slice(0, 2))
  const month = Number(yymmdd.slice(2, 4))
  const day = Number(yymmdd.slice(4, 6))
  const thisYy = now.getFullYear() % 100
  const year = kind === 'expiry' ? 2000 + yy : yy > thisYy ? 1900 + yy : 2000 + yy
  const d = new Date(year, month - 1, day)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null
  return formatDate({ day, month, year })
}

/** One line as the MRZ alphabet: upper case, no spaces, and the look-alikes of the "<" filler turned into it. */
const normalise = (t: string) => t.toUpperCase().replace(/[«‹〈]/g, '<').replace(/\s+/g, '')

/** A name token made only of the letters a photo turns the "<" filler into ("CCS", "KKK") is filler, not a name. */
const isFiller = (t: string) => t.length >= 2 && /^[CKSLEI(]+$/.test(t) && !/[AOUY]/.test(t)

/** Names from line 1: "P<INDSURNAME<<GIVEN<NAMES<<<<". Filler misread as letters or dashes is dropped. */
function namesFrom(line: string): Pick<Mrz, 'surname' | 'given' | 'tokens'> {
  // Line 1 starts with the document type and the issuing country, which a photo may misspell ("P<TND").
  const head = /^P.?[IT1L]N[D0O]/.exec(line)
  if (!head) return {}
  const rest = line.slice(head[0].length)
  const words = (s: string) =>
    s
      .split(/[<\-~=]+/)
      // Filler that was not split off by a "<" is glued to the last name as a run of look-alike letters.
      .map((t) => t.replace(/[^A-Z]/g, '').replace(/[CKSL]{3,}$/, ''))
      .filter((t) => t.length > 0 && !isFiller(t))
  // The surname ends at the first double filler; a photo may turn it into "<-" or a single "<".
  const [sur, ...given] = rest.split(/[<\-~=]{2,}/)
  const out: Pick<Mrz, 'surname' | 'given' | 'tokens'> = {}
  const surname = words(sur ?? '').join(' ')
  const givenNames = words(given.join('<<')).join(' ')
  if (surname.length >= 2) out.surname = surname
  if (givenNames.length >= 2) out.given = givenNames
  const tokens = words(rest)
  if (tokens.length > 0) out.tokens = tokens
  return out
}

/** Finds the MRZ in the OCR lines of a passport photo, or null when there is none. Never throws. */
export function parseMrz(texts: string[], now = new Date()): Mrz | null {
  // MRZ lines are long and made only of capitals, digits and "<"; a little junk from a photo is tolerated.
  const lines = texts.map(normalise).filter((l) => l.length >= 30 && (l.match(/[A-Z0-9<]/g)?.length ?? 0) / l.length > 0.9)
  const out: Mrz = {}
  // Line 1 is shorter than a full line when the filler was not read, so it is looked for on its own.
  for (const line of texts.map(normalise)) {
    if (line.length >= 12 && /^P.?[IT1L]N[D0O]/.test(line) && (line.match(/[A-Z0-9<\-~=]/g)?.length ?? 0) / line.length > 0.85) Object.assign(out, namesFrom(line))
  }
  // Line 2 is found by the nationality "IND" that follows the number and its check digit, whatever came before or after.
  for (const line of lines) {
    // The nationality sits at index 10; a photo may read its I as 1 or L, and its D as 0 or O.
    for (const at of [10, 9, 11, 12, 8].filter((i) => /^[I1L]N[D0O]/.test(line.slice(i, i + 3)))) {
      const numberPart = line.slice(Math.max(0, at - 10), at - 1)
      const numberCheck = line[at - 1] ?? ''
      const dobPart = asDigits(line.slice(at + 3, at + 9))
      const dobCheck = asDigits(line[at + 9] ?? '')
      const expPart = asDigits(line.slice(at + 11, at + 17))
      const expCheck = asDigits(line[at + 17] ?? '')
      // An Indian passport number is a letter and seven digits, then "<" padding to nine characters.
      const m = /^([A-Z0-9])([0-9OILSBQDZG]{7})(<*)$/.exec(numberPart)
      if (!m) continue
      const number = (asLetters(m[1]!) + asDigits(m[2]!)).padEnd(9, '<')
      const numberOk = passes(number, asDigits(numberCheck))
      const dobDate = passes(dobPart, dobCheck) ? toDate(dobPart, 'birth', now) : null
      const expDate = passes(expPart, expCheck) ? toDate(expPart, 'expiry', now) : null
      if (numberOk) out.number = number.replace(/</g, '')
      if (dobDate) out.dob = dobDate
      if (expDate) out.expiry = expDate
      if (numberOk && dobDate && expDate) {
        // The personal-number field is empty on Indian passports; anything else there is a misread "<", so it counts as one.
        const personal = line.slice(at + 18, at + 33).replace(/[^0-9]/g, '<')
        const whole = number + asDigits(numberCheck) + dobPart + dobCheck + expPart + expCheck + personal
        out.composite = passes(whole, asDigits(line[at + 33] ?? ''))
      }
      if (out.number || out.dob || out.expiry) break
    }
  }
  return Object.keys(out).length ? out : null
}
