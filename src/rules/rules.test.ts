// Guards the rules data: a typo in a rules file should fail here, not silently hide a requirement.
import { describe, expect, it } from 'vitest'
import { DOCS } from './documents'
import { SERVICES } from './index'
import type { Condition, Service } from './types'

function answersUsed(c: Condition | undefined, out: { id: string; values: string[] }[] = []) {
  if (!c) return out
  if (c.answer) out.push({ id: c.answer.id, values: Array.isArray(c.answer.is) ? c.answer.is : [c.answer.is] })
  c.all?.forEach((x) => answersUsed(x, out))
  c.any?.forEach((x) => answersUsed(x, out))
  if (c.not) answersUsed(c.not, out)
  return out
}

function allConditions(s: Service): (Condition | undefined)[] {
  return [...s.requirements.map((r) => r.when), ...s.eligibility.map((e) => e.violatedWhen)]
}

describe.each(SERVICES.map((s) => [s.id, s] as const))('rules: %s', (_id, s) => {
  it('has a source, a date and notes', () => {
    expect(s.officialUrl).toMatch(/^https:\/\//)
    expect(s.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(s.sourceNote.length).toBeGreaterThan(20)
    expect(s.notes.length).toBeGreaterThan(0)
  })

  it('has unique requirement ids and only known document types', () => {
    const ids = s.requirements.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const r of s.requirements) {
      expect(r.anyOf.length).toBeGreaterThan(0)
      for (const a of r.anyOf) expect(DOCS[a.doc], `${r.id}: unknown doc ${a.doc}`).toBeDefined()
    }
    for (const w of s.dateWindows) {
      expect(DOCS[w.doc].fields, `${w.id}: ${w.doc} has no ${w.field}`).toContain(w.field)
    }
    for (const d of s.expiryExempt ?? []) expect(DOCS[d]).toBeDefined()
  })

  it('only refers to questions and answers that exist', () => {
    for (const c of allConditions(s)) {
      for (const used of answersUsed(c)) {
        const q = s.questions.find((x) => x.id === used.id)
        expect(q, `unknown question "${used.id}"`).toBeDefined()
        for (const v of used.values) expect(q!.options.map((o) => o.value), `"${v}" is not an option of ${used.id}`).toContain(v)
      }
    }
  })

  it('never promises an outcome', () => {
    const text = JSON.stringify(s).toLowerCase()
    for (const banned of ['will be rejected', 'guarantee', 'within 7 days', 'will be approved']) expect(text).not.toContain(banned)
  })

  it('cites a government page for every rule not marked unverified', () => {
    const cited = (url: string | undefined, where: string) => {
      expect(url, `${where}: verified rule has no source`).toBeDefined()
      const u = new URL(url!)
      expect(u.protocol, where).toBe('https:')
      expect(/(^|\.)(gov|nic)\.in$/.test(u.hostname), `${where}: ${u.hostname} is not a government site`).toBe(true)
      expect(u.pathname.length, `${where}: a home page is not a citation`).toBeGreaterThan(1)
    }
    const verifiedService = s.status === 'verified'
    for (const r of [...s.requirements, ...s.eligibility, ...s.dateWindows]) {
      const provisional = r.provisional ?? !verifiedService
      if (!provisional) cited(r.sourceUrl, r.id)
    }
  })

  it('marks unverified services honestly', () => {
    if (s.category === 'rto') expect(s.status).toBe('provisional')
  })
})

describe('document catalogue', () => {
  it('every document with a number field names a validator', () => {
    for (const [id, d] of Object.entries(DOCS)) {
      if (d.fields.includes('number')) expect(d.numberKind, id).toBeDefined()
    }
  })
})
