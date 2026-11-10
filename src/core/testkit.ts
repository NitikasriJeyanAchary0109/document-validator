// Helpers for tests. Dummy values only: never put real document data in tests.
import { verhoeffCheckDigit } from './validators'

/** A structurally valid Aadhaar-format number for tests: 11 digits plus the Verhoeff check digit. */
export const aadhaarFrom = (first11: string) => first11 + verhoeffCheckDigit(first11)
