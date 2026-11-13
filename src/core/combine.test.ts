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

  it('takes the second reader spacing when only the spaces differ in a name, and keeps any mark either reader had', () => {
    const r = combineReads(ex({ name: 'PRIYA DEVIPATEL' }), ex({ name: 'PRIYA DEVI PATEL' }))
    expect(r.fields.name).toBe('PRIYA DEVI PATEL')
    expect(r.check).toEqual([])
    const marked = combineReads(ex({ name: 'PRIYA DEVIPATEL' }, ['name']), ex({ name: 'PRIYA DEVI PATEL' }))
    expect(marked.check).toEqual(['name'])
  })

  it('clears a mark that only says the value was found by position when both readers found the same value', () => {
    const pos = (v: string) => ({ fields: { name: v }, check: ['name' as const], marks: { name: 'position' as const } })
    expect(combineReads(pos('ASHA NAIR'), pos('ASHA NAIR')).check).toEqual([])
    expect(combineReads(pos('ASHA NAIR'), pos('ASHA NAIR')).marks).toEqual({})
    const fmt = { fields: { name: 'ASHA NAIR' }, check: ['name' as const], marks: { name: 'format' as const } }
    expect(combineReads(fmt, fmt).check).toEqual(['name'])
    expect(combineReads(pos('ASHA NAIR'), pos('ASHA NAIRR')).check).toEqual(['name'])
  })

  it('does not treat a different number with the same digits spaced differently as a disagreement', () => {
    const r = combineReads(ex({ number: '9081 2003 5144' }), ex({ number: '908120035144' }))
    expect(r.check).toEqual([])
  })

  it('uses a value that only one reader found: the primary keeps its own mark, a lone cross-check value is always marked', () => {
    const r = combineReads(ex({}), ex({ dob: '18/08/1997' }))
    expect(r.fields.dob).toBe('18/08/1997')
    expect(r.check).toEqual(['dob'])
    expect(combineReads(ex({ name: 'ASHA NAIR' }), ex({})).check).toEqual([])
  })

  it('treats addresses as the same when their numbers match and the other words mostly do, ignoring junk one reader added', () => {
    const base = 'S/O: NEHA KHAN, 160, MG ROAD, INDIRANAGAR, MUMBAI, MAHARASHTRA - 400293'
    const mark = (v: string, m: 'position' | 'confidence') => ({ fields: { address: v }, check: ['address' as const], marks: { address: m } })
    const r = combineReads(mark(base, 'position'), mark(`LL] a, ${base} in 0`.replace(' in 0', ''), 'confidence'))
    expect(r.check).toEqual([])
    expect(combineReads(mark(base, 'position'), mark(base.replace('160', '166'), 'confidence')).check).toEqual(['address'])
    expect(combineReads(mark(base, 'position'), mark(base.replace('400293', '400298'), 'confidence')).check).toEqual(['address'])
  })
})
