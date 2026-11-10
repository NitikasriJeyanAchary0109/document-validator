import { describe, expect, it } from 'vitest'
import { ageOn, daysBetween, formatDate, parseDate, parseFullDate } from './dates'

describe('parseDate', () => {
  it('reads Indian and ISO formats', () => {
    expect(parseDate('26/01/1990')).toEqual({ year: 1990, month: 1, day: 26 })
    expect(parseDate('26-01-1990')).toEqual({ year: 1990, month: 1, day: 26 })
    expect(parseDate('26.1.1990')).toEqual({ year: 1990, month: 1, day: 26 })
    expect(parseDate('1990-01-26')).toEqual({ year: 1990, month: 1, day: 26 })
  })
  it('reads a bare year as a partial date', () => {
    expect(parseDate('1990')).toEqual({ year: 1990 })
    expect(parseFullDate('1990')).toBeNull()
  })
  it('rejects impossible dates and noise', () => {
    expect(parseDate('31/02/2000')).toBeNull()
    expect(parseDate('13/13/2000')).toBeNull()
    expect(parseDate('tomorrow')).toBeNull()
    expect(parseDate('')).toBeNull()
    expect(parseDate(undefined)).toBeNull()
  })
  it('formats back to DD/MM/YYYY', () => {
    expect(formatDate({ year: 2000, month: 3, day: 5 })).toBe('05/03/2000')
  })
})

describe('age and day arithmetic', () => {
  it('counts a birthday only once it has arrived', () => {
    const dob = { year: 2000, month: 6, day: 15 }
    expect(ageOn(dob, { year: 2026, month: 6, day: 14 })).toBe(25)
    expect(ageOn(dob, { year: 2026, month: 6, day: 15 })).toBe(26)
  })
  it('days between dates, across a leap day', () => {
    expect(daysBetween({ year: 2024, month: 2, day: 28 }, { year: 2024, month: 3, day: 1 })).toBe(2)
    expect(daysBetween({ year: 2026, month: 11, day: 10 }, { year: 2026, month: 11, day: 1 })).toBe(-9)
  })
})
