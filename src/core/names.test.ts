import { describe, expect, it } from 'vitest'
import { compareAddresses, compareNames } from './names'

describe('compareNames', () => {
  it('exact, ignoring case, punctuation and honorifics', () => {
    expect(compareNames('Asha Kumari Sharma', 'ASHA KUMARI SHARMA')).toBe('exact')
    expect(compareNames('Smt. Asha Sharma', 'Asha Sharma')).toBe('exact')
  })
  it('reordered', () => {
    expect(compareNames('Sharma Asha Kumari', 'Asha Kumari Sharma')).toBe('reordered')
  })
  it('partial: a middle name is missing on one document', () => {
    expect(compareNames('Asha Sharma', 'Asha Kumari Sharma')).toBe('partial')
  })
  it('initials', () => {
    expect(compareNames('A K Sharma', 'Asha Kumari Sharma')).toBe('initials')
    expect(compareNames('Asha K Sharma', 'Asha Kumari Sharma')).toBe('initials')
  })
  it('fuzzy: a one-letter typo', () => {
    expect(compareNames('Ashaa Sharma', 'Asha Sharma')).toBe('fuzzy')
    expect(compareNames('Priya Venkatesan', 'Priya Venkatesn')).toBe('fuzzy')
  })
  it('different: another person, or the same first name with another surname', () => {
    expect(compareNames('Asha Sharma', 'Radha Sharma')).toBe('different')
    expect(compareNames('Asha Sharma', 'Asha Verma')).toBe('different')
  })
  it('empty names never match', () => {
    expect(compareNames('', 'Asha')).toBe('different')
  })
  it('drops "S/O ..." relation text', () => {
    expect(compareNames('Asha Sharma D/O Ramesh Sharma', 'Asha Sharma')).toBe('exact')
  })
})

describe('compareAddresses', () => {
  const a = '12 Test Street, Sample Nagar, Chennai 600001'
  it('same address written slightly differently still matches', () => {
    expect(compareAddresses(a, '12, Test St., Sample Nagar, Chennai - 600001')).toBe('match')
  })
  it('a different PIN code is different', () => {
    expect(compareAddresses(a, '12 Test Street, Sample Nagar, Chennai 600002')).toBe('different')
  })
  it('same PIN but little else in common is partial', () => {
    expect(compareAddresses(a, 'Flat 4B, Lake View Apartments, Chennai 600001')).toBe('partial')
  })
  it('a completely different place is different', () => {
    expect(compareAddresses(a, '45 Park Avenue, Andheri West, Mumbai 400053')).toBe('different')
  })
})
