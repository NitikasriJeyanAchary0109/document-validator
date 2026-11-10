// Name and address comparison across documents. Our own judgment, not an official standard: officers decide what
// they accept. Exact and clearly different names are the only strong signals; everything between is a soft warning.

export type NameMatch = 'exact' | 'reordered' | 'partial' | 'initials' | 'fuzzy' | 'different'

// "Kumari" and "Ku" are deliberately NOT here: they are honorifics for some people and a real middle name for many others.
const HONORIFICS = new Set(['MR', 'MRS', 'MS', 'MISS', 'SHRI', 'SHRIMATI', 'SMT', 'SRI', 'DR', 'LATE', 'SHREE'])
const RELATION_PREFIX = /\b(S\/O|D\/O|W\/O|C\/O|SON OF|DAUGHTER OF|WIFE OF)\b.*$/i

export function normaliseName(raw: string): string[] {
  return raw
    .replace(RELATION_PREFIX, '')
    .toUpperCase()
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t && !HONORIFICS.has(t))
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = tmp
    }
  }
  return prev[b.length]!
}

const similarity = (a: string, b: string) => (a || b ? 1 - levenshtein(a, b) / Math.max(a.length, b.length) : 1)

/** Every token of `shorter` is found in `longer` (as itself, or as an initial of / for a full token). */
function coveredBy(shorter: string[], longer: string[], allowInitials: boolean): boolean {
  const pool = [...longer]
  for (const t of shorter) {
    const i = pool.findIndex((u) => u === t || (allowInitials && (t.length === 1 ? u.startsWith(t) : u.length === 1 && t.startsWith(u))))
    if (i < 0) return false
    pool.splice(i, 1)
  }
  return true
}

export function compareNames(a: string, b: string): NameMatch {
  const ta = normaliseName(a)
  const tb = normaliseName(b)
  if (!ta.length || !tb.length) return 'different'
  if (ta.join(' ') === tb.join(' ')) return 'exact'
  if ([...ta].sort().join(' ') === [...tb].sort().join(' ')) return 'reordered'
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta]
  if (coveredBy(short, long, false)) return 'partial' // a middle name is missing on one document
  if (coveredBy(short, long, true)) return 'initials'
  if (similarity([...ta].sort().join(' '), [...tb].sort().join(' ')) >= 0.85) return 'fuzzy' // probably a typo
  return 'different'
}

// ---------------------------------------------------------------- addresses

export type AddressMatch = 'match' | 'partial' | 'different'

const ADDRESS_FILLER = new Set(['NO', 'NEAR', 'OPP', 'OPPOSITE', 'BEHIND', 'DIST', 'DISTRICT', 'STATE', 'INDIA', 'THE', 'AND', 'OF', 'FLAT', 'HOUSE', 'ROAD', 'RD', 'STREET', 'ST'])

function addressTokens(raw: string): { tokens: Set<string>; pin?: string } {
  const pin = /(?<!\d)([1-9]\d{5})(?!\d)/.exec(raw)?.[1]
  const tokens = new Set(
    raw
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 2 && !ADDRESS_FILLER.has(t) && t !== pin),
  )
  return { tokens, pin }
}

export function compareAddresses(a: string, b: string): AddressMatch {
  const x = addressTokens(a)
  const y = addressTokens(b)
  if (x.pin && y.pin && x.pin !== y.pin) return 'different'
  if (!x.tokens.size || !y.tokens.size) return 'different'
  let shared = 0
  for (const t of x.tokens) if (y.tokens.has(t)) shared += 1
  const overlap = shared / Math.min(x.tokens.size, y.tokens.size)
  if (overlap >= 0.6) return 'match'
  if (overlap >= 0.3 || (x.pin && x.pin === y.pin)) return 'partial'
  return 'different'
}
