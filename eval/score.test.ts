import { describe, expect, it } from 'vitest'
import { isRight, nameCer, normalize, outcomeOf, percentile, report, tally, tokenF1, type Result } from './score'

const r = (over: Partial<Result>): Result => ({ kind: 'k', condition: 'clean', truth: {}, fields: {}, check: [], ms: 1000, ...over })

describe('normalisation and matching', () => {
  it('ignores case, spacing and date separators', () => {
    expect(normalize('name', 'asha  kumari-sharma')).toBe('ASHA KUMARI SHARMA')
    expect(normalize('dob', '15-06-2000')).toBe('15/06/2000')
    expect(normalize('number', '2345 6789 0124')).toBe('234567890124')
  })
  it('matches addresses by token overlap, others exactly', () => {
    expect(isRight('address', '12 MG ROAD MUMBAI 400069', '12 MG ROAD, MUMBAI, 400069')).toBe(true)
    expect(isRight('address', 'MUMBAI', '12 MG ROAD MUMBAI 400069')).toBe(false)
    expect(isRight('name', 'ASHA SHARMA', 'ASHA SHARMN')).toBe(false)
    expect(tokenF1('A B', 'A B C')).toBeCloseTo(0.8)
  })
})

describe('outcomes', () => {
  const truth = { name: 'ASHA SHARMA', dob: '15/06/2000' }
  it('tells a flagged mistake from a silent one', () => {
    expect(outcomeOf(r({ truth, fields: { name: 'ASHA SHARNA' }, check: ['name'] }), 'name')).toBe('wrong_flagged')
    expect(outcomeOf(r({ truth, fields: { name: 'ASHA SHARNA' } }), 'name')).toBe('wrong_silent')
  })
  it('separates right, missing and invented values', () => {
    expect(outcomeOf(r({ truth, fields: { dob: '15-06-2000' } }), 'dob')).toBe('right_unflagged')
    expect(outcomeOf(r({ truth, fields: { dob: '15/06/2000' }, check: ['dob'] }), 'dob')).toBe('right_flagged')
    expect(outcomeOf(r({ truth, fields: {} }), 'dob')).toBe('missing')
    expect(outcomeOf(r({ truth, fields: { address: 'SOMEWHERE 400001' } }), 'address')).toBe('hallucinated')
    expect(outcomeOf(r({ truth, fields: {} }), 'address')).toBeNull()
  })
  it('tallies per field', () => {
    const t = tally([r({ truth, fields: { name: 'ASHA SHARMA', dob: '01/01/2000' } }), r({ truth, fields: {} })])
    expect(t.get('name')).toMatchObject({ scored: 2, right: 1, missing: 1, silent: 0 })
    expect(t.get('dob')).toMatchObject({ scored: 2, right: 0, silent: 1, missing: 1 })
  })
})

describe('summary figures', () => {
  it('computes name error rate and percentiles', () => {
    expect(nameCer([r({ truth: { name: 'ABCD' }, fields: { name: 'ABXD' } })])).toBeCloseTo(0.25)
    expect(percentile([1, 2, 3, 4, 100], 50)).toBe(3)
    expect(percentile([1, 2, 3, 4, 100], 95)).toBe(100)
  })
  it('writes a report with each section', () => {
    const md = report([r({ truth: { name: 'ASHA SHARMA' }, fields: { name: 'ASHA SHARMA' } })])
    for (const h of ['**Overall**', '**By field**', '**By degradation**', '**By document**', 'Read time per image']) expect(md).toContain(h)
  })
})
