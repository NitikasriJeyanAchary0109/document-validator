import { describe, expect, it } from 'vitest'
import { extractFields } from './extract'
import { aadhaarFrom } from './testkit'

const AADHAAR = aadhaarFrom('23456789012')
const spaced = (n: string) => `${n.slice(0, 4)} ${n.slice(4, 8)} ${n.slice(8)}`

describe('Aadhaar text', () => {
  const front = `Government of India\nASHA KUMARI SHARMA\nDOB: 15/06/2000\nFEMALE\n${spaced(AADHAAR)}\nVID: 1234 5678 9012 3456`
  it('reads the name above the date of birth, the date and the number', () => {
    const r = extractFields('aadhaar', front)
    expect(r.fields).toMatchObject({ name: 'ASHA KUMARI SHARMA', dob: '15/06/2000', number: AADHAAR })
  })
  it('asks for a second look at the name it guessed by position, but not at a checked number', () => {
    const r = extractFields('aadhaar', front)
    expect(r.check).toContain('name')
    expect(r.check).not.toContain('number')
    expect(r.check).not.toContain('dob')
  })
  it('does not take part of the 16-digit VID as the Aadhaar number', () => {
    expect(extractFields('aadhaar', 'VID: 2345 6789 0123 4567').fields.number).toBeUndefined()
  })
  it('repairs letters read in place of digits and still validates the number', () => {
    const misread = spaced(AADHAAR).replace(/0/g, 'O').replace(/1/g, 'I')
    expect(extractFields('aadhaar', `NAME HERE\nDOB: 15/06/2000\n${misread}`).fields.number).toBe(AADHAAR)
  })
  it('keeps a number that fails the checksum but flags it', () => {
    const bad = AADHAAR.slice(0, 11) + String((Number(AADHAAR[11]) + 1) % 10)
    const r = extractFields('aadhaar', `NAME HERE\nDOB: 15/06/2000\n${spaced(bad)}`)
    expect(r.fields.number).toBe(bad)
    expect(r.check).toContain('number')
  })
  it('reads an address block ending at the PIN code, and always flags it', () => {
    const r = extractFields('aadhaar', 'Address:\nS/O: Ramesh Sharma, 12 MG Road\nAndheri East\nMumbai, Maharashtra - 400069\nVID: 1111')
    expect(r.fields.address).toBe('S/O: Ramesh Sharma, 12 MG Road, Andheri East, Mumbai, Maharashtra - 400069')
    expect(r.check).toContain('address')
  })
  it('reads a date whose digits were misread as letters', () => {
    expect(extractFields('aadhaar', 'NAME HERE\nDOB: l5/O6/2OOO').fields.dob).toBe('15/06/2000')
  })
  it('flags a field read with low OCR confidence', () => {
    const r = extractFields('aadhaar', [
      { text: 'NAME HERE', conf: 90 },
      { text: 'DOB: 15/06/2000', conf: 40 },
    ])
    expect(r.fields.dob).toBe('15/06/2000')
    expect(r.check).toContain('dob')
  })
})

describe('other documents', () => {
  it('reads a PAN card: number, name, father and date of birth', () => {
    const r = extractFields('pan', 'INCOME TAX DEPARTMENT\nPermanent Account Number\nABCPK1234F\nName\nASHA SHARMA\nFather\'s Name\nRAMESH SHARMA\nDate of Birth\n15/06/2000')
    expect(r.fields).toMatchObject({ number: 'ABCPK1234F', name: 'ASHA SHARMA', fatherName: 'RAMESH SHARMA', dob: '15/06/2000' })
    expect(r.check).toEqual([])
  })
  it('does not take the father\'s name as the name', () => {
    const r = extractFields('pan', "Father's Name\nRAMESH SHARMA\nName\nASHA SHARMA")
    expect(r.fields.name).toBe('ASHA SHARMA')
  })
  it('repairs a PAN with 0 read in a letter position', () => {
    expect(extractFields('pan', 'A8C0K1234F').fields.number).toBe('ABCOK1234F')
    expect(extractFields('pan', 'AB0PK1234F').fields.number).toBe('ABOPK1234F')
  })
  it('reads a passport', () => {
    const r = extractFields('passport', 'Passport No.\nK1234567\nSurname\nSHARMA\nGiven Name(s)\nASHA KUMARI\nDate of Birth 15/06/2000\nDate of Expiry 01/01/2031')
    expect(r.fields).toMatchObject({ number: 'K1234567', name: 'ASHA KUMARI SHARMA', dob: '15/06/2000', expiryDate: '01/01/2031' })
  })
  it('reads a driving licence with its dates', () => {
    const r = extractFields('driving_licence', 'DL No: MH14 20110012345\nName: ASHA SHARMA\nDOB: 15/06/2000\nDate of Issue: 01/02/2021\nValid Till: 31/01/2041')
    expect(r.fields).toMatchObject({ number: 'MH1420110012345', name: 'ASHA SHARMA', dob: '15/06/2000', issueDate: '01/02/2021', expiryDate: '31/01/2041' })
  })
  it('reads a voter ID number and name', () => {
    const r = extractFields('voter_id', "Elector's Name: ASHA SHARMA\nABC1234567")
    expect(r.fields).toMatchObject({ number: 'ABC1234567', name: 'ASHA SHARMA' })
  })
  it('reads a registration number and its validity', () => {
    const r = extractFields('rc', 'Regn. No: MH 12 AB 1234\nRegn. Validity: 10/03/2035')
    expect(r.fields).toMatchObject({ number: 'MH12AB1234', expiryDate: '10/03/2035' })
  })
})

describe('when nothing useful is there', () => {
  it('returns nothing rather than inventing values', () => {
    expect(extractFields('aadhaar', '').fields).toEqual({})
    expect(extractFields('pan', 'lorem ipsum dolor sit amet').fields).toEqual({})
    expect(extractFields('aadhaar', 'lorem ipsum dolor').check).toEqual([])
  })
  it('only returns fields that document asks for', () => {
    const r = extractFields('puc', 'Name: ASHA\nValid Till: 10/03/2027')
    expect(Object.keys(r.fields)).toEqual(['expiryDate'])
  })
})

describe('what the photo test found on clean images', () => {
  it('reads a bilingual PAN label whose first half came out as Latin junk', () => {
    const r = extractFields('pan', "am / Name\nVIKRAM KHAN\noar &1 A719 / Father's Name\nNEHA KHAN\n7 Pt a / Date of Birth\n18/08/1997")
    expect(r.fields).toMatchObject({ name: 'VIKRAM KHAN', fatherName: 'NEHA KHAN', dob: '18/08/1997' })
  })
  it('reads a passport number whose first letter came out as a digit', () => {
    const r = extractFields('passport', 'P IND 17598775\nSurname\nKHAN\nGiven Name(s)\nVIKRAM')
    expect(r.fields.number).toBe('I7598775')
  })
  it('reads a voter ID number with O and I read as digits', () => {
    expect(extractFields('voter_id', '0LI6088558').fields.number).toBe('OLI6088558')
    expect(extractFields('voter_id', 'OLI6088558').fields.number).toBe('OLI6088558')
  })
  it('does not turn a dash-separated date into a passport number', () => {
    expect(extractFields('passport', 'Date of Birth 18-08-1997').fields.number).toBeUndefined()
  })
  it('drops a short mixed-case tail after an upper-case name', () => {
    expect(extractFields('voter_id', "Elector's Name: ARJUN PATEL oO").fields.name).toBe('ARJUN PATEL')
    expect(extractFields('voter_id', "Elector's Name: R K SHARMA").fields.name).toBe('R K SHARMA')
    expect(extractFields('voter_id', "Elector's Name: ARJUN PATEL oO").check).toContain('name')
    expect(extractFields('voter_id', "Elector's Name: ARJUN PATEL").check).not.toContain('name')
  })
  it('drops short upper-case tails and mixed-case words after an upper-case name, and says so', () => {
    for (const tail of ['CO', 'O', 'I', 'OO', 'See']) {
      const r = extractFields('voter_id', `Elector's Name: ASHA NAIR ${tail}`)
      expect(r.fields.name, tail).toBe('ASHA NAIR')
      expect(r.check, tail).toContain('name')
    }
  })
  it('flags a passport name when the surname or the given name is missing', () => {
    const only = extractFields('passport', 'Given Name(s)\nVIKRAM\nDate of Birth\n18/08/1997')
    expect(only.fields.name).toBe('VIKRAM')
    expect(only.check).toContain('name')
    const both = extractFields('passport', 'Surname\nKHAN\nGiven Name(s)\nVIKRAM')
    expect(both.check).not.toContain('name')
  })
})
