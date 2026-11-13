// Helpers for tests. Dummy values only: never put real document data in tests.
import { checkDigit } from './mrz'
import { verhoeffCheckDigit } from './validators'

/** A structurally valid Aadhaar-format number for tests: 11 digits plus the Verhoeff check digit. */
export const aadhaarFrom = (first11: string) => first11 + verhoeffCheckDigit(first11)

/**
 * The two machine-readable lines of a passport (ICAO 9303, 44 characters each), with correct check digits, for tests and
 * the evaluation. Dates are YYMMDD, the number is a letter and seven digits (padded with "<" to nine characters).
 */
export function passportMrz(p: { surname: string; given: string; number: string; dob: string; expiry: string; sex?: string }): [string, string] {
  const fill = (s: string, n: number) => s.padEnd(n, '<').slice(0, n)
  const line1 = fill(`P<IND${p.surname.replace(/ /g, '<')}<<${p.given.replace(/ /g, '<')}`, 44)
  const number = fill(p.number, 9)
  const personal = '<'.repeat(14)
  const body = `${number}${checkDigit(number)}IND${p.dob}${checkDigit(p.dob)}${p.sex ?? 'F'}${p.expiry}${checkDigit(p.expiry)}${personal}0`
  const composite = checkDigit(body.slice(0, 10) + body.slice(13, 20) + body.slice(21, 43))
  return [line1, body + composite]
}
