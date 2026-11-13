import { describe, expect, it } from 'vitest'
import { extractFields, type OcrLine } from './extract'
import { aadhaarFrom, passportMrz } from './testkit'

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
  it('marks a date with a one-digit day or month, where a digit was probably lost', () => {
    const lost = extractFields('aadhaar', 'DOB: A 5/03/ 1980')
    expect(lost.fields.dob).toBe('05/03/1980')
    expect(lost.check).toContain('dob')
    expect(extractFields('aadhaar', 'DOB: 15/03/1980').check).not.toContain('dob')
    expect(extractFields('aadhaar', 'DOB: 15/3/1980').check).toContain('dob')
  })
})

describe('passport machine-readable lines', () => {
  const [l1, l2] = passportMrz({ surname: 'KHAN', given: 'VIKRAM', number: 'I7598775', dob: '970818', expiry: '350725' })
  const visual = 'Surname\nKHAN\nGiven Name(s)\nVIKRAM\nDate of Birth\n18/08/1997\nDate of Expiry\n25/07/2035\nP IND I7598775'

  it('reads everything from the lines alone; the composite check digit settles the numbers and dates, the name stays marked', () => {
    const r = extractFields('passport', `${l1}\n${l2}`)
    expect(r.fields).toMatchObject({ number: 'I7598775', dob: '18/08/1997', expiryDate: '25/07/2035', name: 'VIKRAM KHAN' })
    expect(r.check).toEqual(['name'])
  })

  it('shows a value that passes its own check digit but marks it when the line as a whole does not check out', () => {
    const r = extractFields('passport', `${l1}\n${l2.slice(0, 43)}7`)
    expect(r.fields.dob).toBe('18/08/1997')
    expect(r.check).toContain('dob')
  })

  it('keeps no mark on a printed value that the lines agree with, even when the whole-line check fails', () => {
    const r = extractFields('passport', `${visual}\n${l1}\n${l2.slice(0, 43)}7`)
    expect(r.check).not.toContain('dob')
  })

  it('replaces a misread printed value with the one that passes its check digit, without a mark', () => {
    const r = extractFields('passport', `${visual.replace('18/08/1997', '18/08/1991')}\n${l1}\n${l2}`)
    expect(r.fields.dob).toBe('18/08/1997')
    expect(r.check).not.toContain('dob')
  })

  it('settles the spacing and the mark of a name that agrees with the lines', () => {
    const [m1, m2] = passportMrz({ surname: 'PATEL', given: 'ARJUN KUMAR', number: 'I7598775', dob: '970818', expiry: '350725' })
    const r = extractFields('passport', `Surname\nPATEL\nGiven Name(s)\nARJUNKUMAR\n${m1}\n${m2}`)
    expect(r.fields.name).toBe('ARJUN KUMAR PATEL')
    expect(r.check).not.toContain('name')
  })

  it('completes a printed name that is missing its surname, and keeps the mark', () => {
    const r = extractFields('passport', `Given Name(s)\nVIKRAM\n${l1}\n${l2}`)
    expect(r.fields.name).toBe('VIKRAM KHAN')
    expect(r.check).toContain('name')
  })

  it('does not trust lines whose check digits fail', () => {
    const r = extractFields('passport', `${visual.replace('18/08/1997', '18/08/1991')}\n${l1}\n${l2.replace('970818', '970819')}`)
    expect(r.fields.dob).toBe('18/08/1991')
  })

  it('changes nothing for other documents', () => {
    expect(extractFields('pan', `${l1}\n${l2}`).fields).toEqual({})
  })

  it('says why a field is marked, with low confidence outranking position and format outranking both', () => {
    const low = (text: string): OcrLine[] => text.split('\n').map((t) => ({ text: t, conf: 40 }))
    expect(extractFields('aadhaar', 'Government of India\nASHA KUMARI SHARMA\nDOB: 15/06/2000').marks?.name).toBe('position')
    expect(extractFields('aadhaar', low('Government of India\nASHA KUMARI SHARMA\nDOB: 15/06/2000')).marks?.name).toBe('confidence')
    expect(extractFields('voter_id', "Elector's Name: ASHA NAIR CO").marks?.name).toBe('format')
  })

  it('finds the surname when the photo turned its label into "Sumame" or "Suname"', () => {
    for (const label of ['Sumame', 'Suname', 'Sumtame', 'Surmame', 'Surnarne']) {
      const r = extractFields('passport', `${label}\nPATEL\nGiven Name(s)\nARJUN\nDate of Birth`)
      expect(r.fields.name, label).toBe('ARJUN PATEL')
      expect(r.check, label).not.toContain('name')
    }
  })

  it('takes the plain line above "Given Name(s)" as the surname when its label is lost, and marks it', () => {
    const r = extractFields('passport', 'Type Country Code\nPATEL\nGiven Name(s)\nARJUN')
    expect(r.fields.name).toBe('ARJUN PATEL')
    expect(r.marks?.name).toBe('position')
  })

  it('does not take a label line above "Given Name(s)" for a surname', () => {
    const r = extractFields('passport', 'Date of Birth\nGiven Name(s)\nARJUN')
    expect(r.fields.name).toBe('ARJUN')
    expect(r.check).toContain('name')
  })

  it('finds the given names when their label is misread too, from the plain line under the surname', () => {
    const r = extractFields('passport', 'Sumame\nSHARMA\nCivenNamel\nASHA\nDatoofBirh')
    expect(r.fields.name).toBe('ASHA SHARMA')
    const lost = extractFields('passport', 'Sumame\nSHARMA\nASHA\nDate of Birth')
    expect(lost.fields.name).toBe('ASHA SHARMA')
    expect(lost.marks?.name).toBe('position')
  })

  it('skips the "Name(s)" word after "Given" and reads a value on the same line', () => {
    expect(extractFields('passport', 'Surname PATEL\nGiven Narme(s) ARJUN').fields.name).toBe('ARJUN PATEL')
  })

  it('splits given names with the spacing of the machine-readable names, lined up on the printed surname', () => {
    const r = extractFields('passport', 'Sumame\nIYER\nGiven Name(s)\nGURPREETKUMARI\nP<INDIYER<GURPREET<KUMARI<<<<<<<<<<')
    expect(r.fields.name).toBe('GURPREET KUMARI IYER')
    expect(r.check).not.toContain('name')
  })

  it('marks a name word that is probably two words run together, or that has a dot inside it', () => {
    const passport = (given: string) => extractFields('passport', `Surname\nIYER\nGiven Name(s)\n${given}`)
    expect(passport('GURPREETKUMARI').check).toContain('name')
    expect(passport('GURPREET KUMARI').check).not.toContain('name')
    expect(passport('AR.JUN').check).toContain('name')
    expect(passport('PRIYADARSHINI').check).toContain('name')
  })

  it('keeps a mark on a very long name word even when the machine-readable lines read it the same way', () => {
    const [m1, m2] = passportMrz({ surname: 'IYER', given: 'GURPREETKUMARI', number: 'I7598775', dob: '970818', expiry: '350725' })
    const r = extractFields('passport', `Surname\nIYER\nGiven Name(s)\nGURPREETKUMARI\n${m1}\n${m2}`)
    expect(r.check).toContain('name')
  })

  it('finds the dates when their labels are misspelled, matching the label words by edit distance', () => {
    const r = extractFields('passport', 'rate of Birth\n18/08/1997\nDate oi Exoily\n25/07/2035')
    expect(r.fields).toMatchObject({ dob: '18/08/1997', expiryDate: '25/07/2035' })
    expect(r.check).toEqual([])
    expect(extractFields('passport', 'Date of Brth Sex\n18/08/1997 F\nDate cf Expiry\n25/07/2035').fields).toMatchObject({ dob: '18/08/1997', expiryDate: '25/07/2035' })
  })

  it('takes two dates in printed order (birth, then expiry) when both labels are unreadable, and marks them', () => {
    const r = extractFields('passport', 'Dxx\n18/08/1997\nzzz\n25/07/2035')
    expect(r.fields).toMatchObject({ dob: '18/08/1997', expiryDate: '25/07/2035' })
    expect(r.marks).toMatchObject({ dob: 'position', expiryDate: 'position' })
  })

  it('gives a single leftover date to the field that is still empty, if it fits', () => {
    expect(extractFields('passport', 'Date of Birth\n18/08/1997\nzzz\n25/07/2035').fields.expiryDate).toBe('25/07/2035')
    expect(extractFields('passport', 'Date of Expiry\n25/07/2035\nzzz\n18/08/1997').fields.dob).toBe('18/08/1997')
    // A date that cannot be the expiry (before the birth date) is not guessed into it.
    expect(extractFields('passport', 'Date of Birth\n18/08/1997\nzzz\n01/01/1990').fields.expiryDate).toBeUndefined()
  })

  it('does not guess dates for passports from three or more dates, or for other documents', () => {
    expect(extractFields('passport', 'a\n18/08/1997\nb\n25/07/2035\nc\n01/01/2020').fields.dob).toBeUndefined()
    expect(extractFields('pan', 'Dxx\n18/08/1997\nzzz\n25/07/2035').fields.dob).toBeUndefined()
  })

  it('reads machine-readable lines whose nationality was read as "1ND"', () => {
    const [m1, m2] = passportMrz({ surname: 'KHAN', given: 'VIKRAM', number: 'I7598775', dob: '970818', expiry: '350725' })
    expect(extractFields('passport', `${m1}\n${m2.replace('IND', '1ND')}`).fields).toMatchObject({ number: 'I7598775', dob: '18/08/1997' })
  })

  it('repairs a date whose second separator was read as a digit, and marks it', () => {
    const r = extractFields('passport', 'Date of Expiry\n09/0772033')
    expect(r.fields.expiryDate).toBe('09/07/2033')
    expect(r.marks?.expiryDate).toBe('format')
    expect(extractFields('passport', 'Date of Expiry\n02/0372032').fields.expiryDate).toBe('02/03/2032')
    // Not a real date, or an implausible year: left alone.
    expect(extractFields('passport', 'Date of Expiry\n39/0772033').fields.expiryDate).toBeUndefined()
    expect(extractFields('passport', 'Date of Expiry\n09/0775033').fields.expiryDate).toBeUndefined()
  })
})
