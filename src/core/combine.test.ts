import { describe, expect, it } from 'vitest'
import { combineReads } from './combine'
import type { Extraction } from './extract'

const ex = (fields: Extraction['fields'], check: Extraction['check'] = []): Extraction => ({ fields, check })

describe('combining two readers', () => {
  it('keeps a value both readers agree on, and drops a flag only one of them raised', () => {
    const r = combineReads(ex({ number: '908120035144' }, ['number']), ex({ number: '908120035144' }))
    expect(r.fields.number).toBe('908120035144')
    expect(r.check).toEqual([])
  })

  it('keeps a flag both readers raised', () => {
    const r = combineReads(ex({ name: 'ASHA' }, ['name']), ex({ name: 'ASHA' }, ['name']))
    expect(r.check).toEqual(['name'])
  })

  it('marks a field the readers disagree on and shows the primary reader value', () => {
    const r = combineReads(ex({ dob: '15/04/1964' }), ex({ dob: '16/04/1964' }))
    expect(r.fields.dob).toBe('15/04/1964')
    expect(r.check).toEqual(['dob'])
  })

  it('takes the second reader spacing when only the spaces differ in a name', () => {
    const r = combineReads(ex({ name: 'PRIYA DEVIPATEL' }), ex({ name: 'PRIYA DEVI PATEL' }))
    expect(r.fields.name).toBe('PRIYA DEVI PATEL')
    expect(r.check).toEqual([])
  })

  it('does not treat a different number with the same digits spaced differently as a disagreement', () => {
    const r = combineReads(ex({ number: '9081 2003 5144' }), ex({ number: '908120035144' }))
    expect(r.check).toEqual([])
  })

  it('uses a value that only one reader found, keeping that reader flag', () => {
    const r = combineReads(ex({}), ex({ dob: '18/08/1997' }, ['dob']))
    expect(r.fields.dob).toBe('18/08/1997')
    expect(r.check).toEqual(['dob'])
    expect(combineReads(ex({ name: 'ASHA NAIR' }), ex({})).check).toEqual([])
  })
})
