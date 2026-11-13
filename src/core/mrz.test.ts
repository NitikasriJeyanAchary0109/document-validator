import { describe, expect, it } from 'vitest'
import { checkDigit, parseMrz } from './mrz'
import { passportMrz } from './testkit'

// The ICAO 9303 specimen: document number L898902C3 has check digit 6, birth 740812 has 2, expiry 120415 has 9.
describe('check digit', () => {
  it('matches the published ICAO example values', () => {
    expect(checkDigit('L898902C3')).toBe(6)
    expect(checkDigit('740812')).toBe(2)
    expect(checkDigit('120415')).toBe(9)
  })
})

const mrz = passportMrz({ surname: 'PATEL', given: 'ARJUN KUMAR', number: 'F7657322', dob: '000823', expiry: '360228' })
const NOW = new Date(2026, 10, 12)

describe('machine-readable lines', () => {
  it('builds lines of 44 characters', () => {
    expect(mrz[0]).toHaveLength(44)
    expect(mrz[1]).toHaveLength(44)
  })

  it('reads number, dates and names from clean lines', () => {
    expect(parseMrz([...mrz], NOW)).toEqual({ number: 'F7657322', dob: '23/08/2000', expiry: '28/02/2036', surname: 'PATEL', given: 'ARJUN KUMAR', tokens: ['PATEL', 'ARJUN', 'KUMAR'], composite: true })
  })

  it('finds the lines among the other text of the page', () => {
    const r = parseMrz(['Republic of India', 'Surname', 'PATEL', mrz[0], mrz[1]], NOW)
    expect(r?.number).toBe('F7657322')
  })

  it('reads a birth year after the current one as the last century', () => {
    const old = passportMrz({ surname: 'RAO', given: 'LATA', number: 'K1234567', dob: '640412', expiry: '330101' })
    expect(parseMrz([...old], NOW)?.dob).toBe('12/04/1964')
  })

  it('tolerates spaces, lower case and "<" read as «', () => {
    const noisy = [mrz[0].replace(/</g, '«'), mrz[1].toLowerCase().replace(/(.{11})/, '$1 ')]
    expect(parseMrz(noisy, NOW)).toMatchObject({ number: 'F7657322', dob: '23/08/2000' })
  })

  it('repairs letters read for digits where the check digit allows it', () => {
    const bad = mrz[1].replace('000823', 'O00823')
    expect(parseMrz([mrz[0], bad], NOW)?.dob).toBe('23/08/2000')
  })

  it('does not guess at a misread character in the number: a check digit has only ten values', () => {
    const bad = mrz[1].replace('F7657322', 'F1657322')
    expect(parseMrz([mrz[0], bad], NOW)?.number).toBeUndefined()
  })

  it('confirms the whole of line 2 with the composite check digit, even with filler read as other characters', () => {
    expect(parseMrz([...mrz], NOW)?.composite).toBe(true)
    const junk = mrz[1].replace(/<{14}/, '<<K<<<<S<<<<<<')
    expect(parseMrz([mrz[0], junk], NOW)?.composite).toBe(true)
    expect(parseMrz([mrz[0], mrz[1].slice(0, 43) + '5'], NOW)?.composite).toBe(false)
  })

  it('drops a value whose check digit fails and cannot be repaired', () => {
    const bad = mrz[1].replace('000823', '000824')
    const r = parseMrz([mrz[0], bad], NOW)
    expect(r?.dob).toBeUndefined()
    expect(r?.number).toBe('F7657322')
  })

  it('returns null when there are no such lines', () => {
    expect(parseMrz(['Republic of India', 'Surname', 'PATEL'], NOW)).toBeNull()
  })

  it('drops the filler a photo turns into letters at the end of the given names', () => {
    const r = parseMrz([mrz[0].replace(/<{3,}$/, (f) => 'K'.repeat(f.length)), mrz[1]], NOW)
    expect(r?.given).toBe('ARJUN KUMAR')
  })

  it('drops filler tokens that a photo turned into letters in the middle of the names', () => {
    const r = parseMrz([mrz[0].replace('ARJUN<KUMAR<<<<', 'ARJUN<KUMAR<CCS<'), mrz[1]], NOW)
    expect(r?.given).toBe('ARJUN KUMAR')
  })

  it('reads names from a first line that is short and misspelled, with "<-" for the double filler', () => {
    expect(parseMrz(['P<TNDSHARMA<-ASHA<~'], NOW)).toMatchObject({ surname: 'SHARMA', given: 'ASHA' })
    expect(parseMrz(['PINDPATEL<<ARJUN<KUMAR'], NOW)).toMatchObject({ surname: 'PATEL', given: 'ARJUN KUMAR' })
  })

  it('keeps every name word in order when the double filler was not read', () => {
    expect(parseMrz(['P<INDIYER<GURPREET<KUMARI<<<<<<<<'], NOW)?.tokens).toEqual(['IYER', 'GURPREET', 'KUMARI'])
  })
})
