import { describe, expect, it } from 'vitest'
import { aadhaarFrom } from './testkit'
import {
  maskAadhaar,
  validateAadhaar,
  validateDrivingLicence,
  validatePan,
  validatePassportNumber,
  validatePincode,
  validateVehicleNumber,
  validateVoterId,
  verhoeffCheckDigit,
  verhoeffValid,
} from './validators'

describe('Verhoeff', () => {
  it('matches the published example: check digit for 236 is 3', () => {
    expect(verhoeffCheckDigit('236')).toBe('3')
    expect(verhoeffValid('2363')).toBe(true)
    expect(verhoeffValid('2364')).toBe(false)
  })
  it('round-trips for generated numbers', () => {
    for (const base of ['23456789012', '98765432100', '55555555555']) expect(verhoeffValid(aadhaarFrom(base))).toBe(true)
  })
  it('detects any single-digit change', () => {
    const good = aadhaarFrom('23456789012')
    for (let i = 0; i < good.length; i++) {
      const bad = good.slice(0, i) + String((Number(good[i]) + 1) % 10) + good.slice(i + 1)
      expect(verhoeffValid(bad)).toBe(false)
    }
  })
})

describe('Aadhaar', () => {
  it('accepts a valid number with spaces', () => {
    const n = aadhaarFrom('23456789012')
    expect(validateAadhaar(`${n.slice(0, 4)} ${n.slice(4, 8)} ${n.slice(8)}`).status).toBe('valid')
  })
  it('rejects wrong length, a leading 0 or 1, and a bad checksum', () => {
    expect(validateAadhaar('1234').status).toBe('invalid')
    expect(validateAadhaar('123456789012').status).toBe('invalid')
    expect(validateAadhaar('234567890123').status).toBe('invalid') // checksum
  })
  it('masks to the last 4 digits', () => {
    expect(maskAadhaar('2345 6789 0123')).toBe('XXXX XXXX 0123')
    expect(maskAadhaar('12')).toBe('')
  })
})

describe('PAN', () => {
  it('accepts a well-formed PAN, lower case and spaced', () => {
    expect(validatePan('ABCPE1234F').status).toBe('valid')
    expect(validatePan('abcpe 1234 f').status).toBe('valid')
  })
  it('rejects bad shape and a bad 4th character', () => {
    expect(validatePan('ABCDE12345').status).toBe('invalid')
    expect(validatePan('ABCXE1234F').status).toBe('invalid')
  })
})

describe('Passport number', () => {
  it('is a letter followed by 7 digits, the first not 0', () => {
    expect(validatePassportNumber('K1234567').status).toBe('valid')
    expect(validatePassportNumber('K0234567').status).toBe('invalid')
    expect(validatePassportNumber('12345678').status).toBe('invalid')
  })
})

describe('Driving licence number', () => {
  it('accepts the current format with separators', () => {
    expect(validateDrivingLicence('MH14 20110062821').status).toBe('valid')
    expect(validateDrivingLicence('DL-0420110149646').status).toBe('valid')
  })
  it('flags an unknown state code as invalid', () => {
    expect(validateDrivingLicence('ZZ1420110062821').status).toBe('invalid')
  })
  it('treats other shapes as unusual, not wrong, because older formats exist', () => {
    expect(validateDrivingLicence('KA-01/12345/1995').status).toBe('unusual')
  })
})

describe('Vehicle registration number', () => {
  it('accepts standard and BH series', () => {
    expect(validateVehicleNumber('MH 12 AB 1234').status).toBe('valid')
    expect(validateVehicleNumber('KA05MN9').status).toBe('valid')
    expect(validateVehicleNumber('22 BH 1234 AA').status).toBe('valid')
  })
  it('rejects junk and unknown state codes', () => {
    expect(validateVehicleNumber('12345').status).toBe('invalid')
    expect(validateVehicleNumber('ZZ12AB1234').status).toBe('invalid')
  })
})

describe('Voter ID and PIN code', () => {
  it('voter id: standard is valid, others are unusual', () => {
    expect(validateVoterId('ABC1234567').status).toBe('valid')
    expect(validateVoterId('MH/01/001/123456').status).toBe('unusual')
  })
  it('pin code', () => {
    expect(validatePincode('600 001').status).toBe('valid')
    expect(validatePincode('012345').status).toBe('invalid')
    expect(validatePincode('6001').status).toBe('invalid')
  })
})
