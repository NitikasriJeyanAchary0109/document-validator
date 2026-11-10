// Format checks for identity and vehicle numbers. Pure functions; they judge the *shape* of a number, never whether
// it belongs to a real person. 'invalid' means it cannot be right as typed; 'unusual' means the shape is not the
// current standard but older or state-specific formats exist, so the user should compare with the card.

export type NumberStatus = 'valid' | 'invalid' | 'unusual'

export interface NumberCheck {
  status: NumberStatus
  normalized: string
  reason?: string
}

const clean = (raw: string) => raw.toUpperCase().replace(/[\s\-/.]/g, '')

// ---------------------------------------------------------------- Verhoeff (Aadhaar checksum)

const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]

export function verhoeffValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false
  let c = 0
  const rev = digits.split('').reverse()
  for (let i = 0; i < rev.length; i++) c = D[c]![P[i % 8]![Number(rev[i])]!]!
  return c === 0
}

/** Computes the Verhoeff check digit to append to `digits`. Used by tests and sample-data generators. */
export function verhoeffCheckDigit(digits: string): string {
  const INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9]
  let c = 0
  const rev = digits.split('').reverse()
  for (let i = 0; i < rev.length; i++) c = D[c]![P[(i + 1) % 8]![Number(rev[i])]!]!
  return String(INV[c])
}

// ---------------------------------------------------------------- state / UT codes

/** Two-letter state and UT codes used in registration marks and driving licence numbers. */
export const STATE_CODES = new Set([
  'AN', 'AP', 'AR', 'AS', 'BR', 'CG', 'CH', 'DD', 'DL', 'DN', 'GA', 'GJ', 'HP', 'HR', 'JH', 'JK', 'KA', 'KL', 'LA', 'LD',
  'MH', 'ML', 'MN', 'MP', 'MZ', 'NL', 'OD', 'OR', 'PB', 'PY', 'RJ', 'SK', 'TN', 'TR', 'TS', 'TG', 'UK', 'UA', 'UP', 'WB',
])

// ---------------------------------------------------------------- validators

export function validateAadhaar(raw: string): NumberCheck {
  const n = raw.replace(/[\s\-]/g, '')
  if (!/^\d{12}$/.test(n)) return { status: 'invalid', normalized: n, reason: 'An Aadhaar number has 12 digits.' }
  if (/^[01]/.test(n)) return { status: 'invalid', normalized: n, reason: 'An Aadhaar number does not start with 0 or 1.' }
  if (!verhoeffValid(n)) return { status: 'invalid', normalized: n, reason: 'The last digit does not match the other 11, so a digit may be mistyped.' }
  return { status: 'valid', normalized: n }
}

export function validatePan(raw: string): NumberCheck {
  const n = clean(raw)
  if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(n)) return { status: 'invalid', normalized: n, reason: 'A PAN is 5 letters, 4 digits, then 1 letter.' }
  if (!'ABCFGHLJPT'.includes(n[3]!)) return { status: 'invalid', normalized: n, reason: 'The 4th character of a PAN is one of A, B, C, F, G, H, L, J, P or T.' }
  return { status: 'valid', normalized: n }
}

export function validatePassportNumber(raw: string): NumberCheck {
  const n = clean(raw)
  if (!/^[A-Z][1-9]\d{6}$/.test(n)) return { status: 'invalid', normalized: n, reason: 'An Indian passport number is 1 letter followed by 7 digits.' }
  return { status: 'valid', normalized: n }
}

export function validateVoterId(raw: string): NumberCheck {
  const n = clean(raw)
  if (/^[A-Z]{3}\d{7}$/.test(n)) return { status: 'valid', normalized: n }
  return { status: 'unusual', normalized: n, reason: 'Voter ID numbers are usually 3 letters and 7 digits. Older cards use other formats, so compare with your card.' }
}

export function validateDrivingLicence(raw: string): NumberCheck {
  const n = clean(raw)
  const m = /^([A-Z]{2})(\d{2})((?:19|20)\d{2})(\d{7})$/.exec(n)
  if (m) {
    if (!STATE_CODES.has(m[1]!)) return { status: 'invalid', normalized: n, reason: `"${m[1]}" is not a state or UT code.` }
    return { status: 'valid', normalized: n }
  }
  return {
    status: 'unusual',
    normalized: n,
    reason: 'Current licence numbers are a state code, RTO code, year and 7 digits. Older or state-specific formats exist, so compare with your card.',
  }
}

export function validateVehicleNumber(raw: string): NumberCheck {
  const n = clean(raw)
  if (/^\d{2}BH\d{4}[A-Z]{1,2}$/.test(n)) return { status: 'valid', normalized: n } // Bharat (BH) series
  const m = /^([A-Z]{2})(\d{1,2})([A-Z]{1,3})(\d{1,4})$/.exec(n)
  if (!m) {
    return {
      status: 'invalid',
      normalized: n,
      reason: 'A registration number looks like MH12AB1234: state code, RTO number, series letters, then up to 4 digits.',
    }
  }
  if (!STATE_CODES.has(m[1]!)) return { status: 'invalid', normalized: n, reason: `"${m[1]}" is not a state or UT code.` }
  return { status: 'valid', normalized: n }
}

export function validatePincode(raw: string): NumberCheck {
  const n = raw.replace(/\s/g, '')
  if (!/^[1-9]\d{5}$/.test(n)) return { status: 'invalid', normalized: n, reason: 'A PIN code has 6 digits and does not start with 0.' }
  return { status: 'valid', normalized: n }
}

export type NumberKind = 'aadhaar' | 'pan' | 'passport' | 'driving_licence' | 'voter_id' | 'vehicle' | 'plain'

export function validateNumber(kind: NumberKind, raw: string): NumberCheck {
  switch (kind) {
    case 'aadhaar':
      return validateAadhaar(raw)
    case 'pan':
      return validatePan(raw)
    case 'passport':
      return validatePassportNumber(raw)
    case 'driving_licence':
      return validateDrivingLicence(raw)
    case 'voter_id':
      return validateVoterId(raw)
    case 'vehicle':
      return validateVehicleNumber(raw)
    case 'plain':
      return { status: 'valid', normalized: raw.trim() }
  }
}

/** Last 4 digits only. We never keep or show a full Aadhaar number outside the input box. */
export function maskAadhaar(raw: string): string {
  const n = raw.replace(/[\s\-]/g, '')
  return n.length >= 4 ? `XXXX XXXX ${n.slice(-4)}` : ''
}
