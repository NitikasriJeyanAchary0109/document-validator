// Date parsing for documents. Indian documents print DD/MM/YYYY, DD-MM-YYYY or DD.MM.YYYY; date inputs give YYYY-MM-DD.
// A bare year ("Year of Birth: 1990") is accepted as a partial date. Anything else is null.

export interface DateParts {
  year: number
  month?: number
  day?: number
}
export type FullDate = Required<DateParts>

const DAY_MS = 86_400_000

export function parseDate(input: string | undefined | null): DateParts | null {
  const s = input?.trim()
  if (!s) return null
  if (/^(19|20)\d{2}$/.test(s)) return { year: Number(s) }
  let day: number, month: number, year: number
  const dmy = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(s)
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  if (dmy) {
    day = Number(dmy[1])
    month = Number(dmy[2])
    year = Number(dmy[3])
  } else if (iso) {
    year = Number(iso[1])
    month = Number(iso[2])
    day = Number(iso[3])
  } else return null
  if (year < 1900 || year > 2100) return null
  const d = new Date(Date.UTC(year, month - 1, day))
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null
  return { year, month, day }
}

export function parseFullDate(input: string | undefined | null): FullDate | null {
  const p = parseDate(input)
  return p && isFull(p) ? p : null
}

export function isFull(p: DateParts): p is FullDate {
  return p.month !== undefined && p.day !== undefined
}

export function formatDate(p: DateParts): string {
  if (!isFull(p)) return String(p.year)
  return `${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')}/${p.year}`
}

const toMs = (d: FullDate) => Date.UTC(d.year, d.month - 1, d.day)

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: FullDate, to: FullDate): number {
  return Math.round((toMs(to) - toMs(from)) / DAY_MS)
}

/** Whole years of age on `on`, given a full date of birth. */
export function ageOn(dob: FullDate, on: FullDate): number {
  let age = on.year - dob.year
  if (on.month < dob.month || (on.month === dob.month && on.day < dob.day)) age -= 1
  return age
}

export function compareFull(a: FullDate, b: FullDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day
}

export function today(now: Date = new Date()): FullDate {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() }
}

export function toIso(d: FullDate): string {
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
}
