import { describe, expect, it } from 'vitest'
import { getService } from '../rules'
import type { DocTypeId, FieldKey } from '../rules/types'
import { checkDocuments, type CheckInput, type ProvidedDoc, type Report } from './engine'
import { aadhaarFrom } from './testkit'

const AS_OF = '2026-11-10'
const AADHAAR = aadhaarFrom('23456789012')
const ADDRESS = '12 Test Street, Sample Nagar, Chennai 600001'

let n = 0
const doc = (type: DocTypeId, fields: Partial<Record<FieldKey, string>> = {}): ProvidedDoc => ({ id: `d${++n}`, type, fields })
const tick = (type: DocTypeId): ProvidedDoc => ({ id: `d${++n}`, type, fields: {}, present: true })

const aadhaar = (name = 'Asha Sharma', dob = '15/06/2000') => doc('aadhaar', { name, dob, address: ADDRESS, number: AADHAAR })

function run(serviceId: string, input: Partial<CheckInput> & { docs: ProvidedDoc[] }): Report {
  const service = getService(serviceId)!
  return checkDocuments({ service, dob: '15/06/2000', asOf: AS_OF, answers: {}, ...input })
}
const ids = (r: Report) => r.issues.map((i) => i.id)
const has = (r: Report, prefix: string) => r.issues.some((i) => i.id.startsWith(prefix))
const severityOf = (r: Report, prefix: string) => r.issues.find((i) => i.id.startsWith(prefix))?.severity

describe("learner's licence", () => {
  const complete = () => [aadhaar(), tick('form_1'), tick('photos')]

  it('is ready when the age proof, address proof, Form 1 and photos are there', () => {
    const r = run('learner_licence', { answers: { category: 'private' }, docs: complete() })
    expect(r.verdict).toBe('ready')
    expect(r.age).toBe(26)
    expect(r.checklist.every((c) => c.status === 'have')).toBe(true)
  })

  it('is not ready without Form 1 and photos, and says what is accepted', () => {
    const r = run('learner_licence', { answers: { category: 'private' }, docs: [aadhaar()] })
    expect(r.verdict).toBe('not_ready')
    expect(ids(r)).toEqual(expect.arrayContaining(['missing:form_1', 'missing:photos']))
    expect(r.issues.find((i) => i.id === 'missing:form_1')?.fix).toContain('Form 1')
    expect(r.issues.find((i) => i.id === 'missing:form_1')?.fix).toMatch(/^Bring: /) // one option: no "one of"
    const empty = run('learner_licence', { answers: { category: 'private' }, docs: [] })
    expect(empty.issues.find((i) => i.id === 'missing:age_proof')?.fix).toMatch(/^Bring one of: /)
  })

  it('only warns about Form 1A for a first-time private applicant of 40 or more, since official sources differ', () => {
    const r = run('learner_licence', { dob: '01/01/1980', answers: { category: 'private' }, docs: [aadhaar('Asha Sharma', '01/01/1980'), tick('form_1'), tick('photos')] })
    expect(severityOf(r, 'missing:form_1a_40')).toBe('warning')
    expect(ids(r)).not.toContain('missing:form_1a')
    expect(r.verdict).toBe('almost_ready')
  })

  it('asks for Form 1A for a commercial licence at any age', () => {
    const r = run('learner_licence', { answers: { category: 'commercial' }, docs: [aadhaar(), tick('photos')] })
    expect(ids(r)).toContain('missing:form_1a')
  })

  it('blocks a 17-year-old applying for a private licence', () => {
    const r = run('learner_licence', { dob: '15/06/2009', answers: { category: 'private' }, docs: [aadhaar('Asha Sharma', '15/06/2009'), tick('form_1'), tick('photos')] })
    expect(severityOf(r, 'eligibility:min_age_private')).toBe('blocker')
  })

  it('lets a 16-year-old apply for a 50cc gearless motorcycle but asks for guardian consent', () => {
    const r = run('learner_licence', { dob: '15/06/2010', answers: { category: 'gearless_50cc' }, docs: [aadhaar('Asha Sharma', '15/06/2010'), tick('form_1'), tick('photos')] })
    expect(has(r, 'eligibility:')).toBe(false)
    expect(ids(r)).toContain('missing:guardian_consent')
  })

  it('blocks until the questions are answered', () => {
    const r = run('learner_licence', { docs: complete() })
    expect(ids(r)).toContain('unanswered:category')
    expect(r.verdict).toBe('not_ready')
  })

  it('does not accept an expired proof document', () => {
    const r = run('learner_licence', {
      answers: { category: 'private' },
      docs: [aadhaar(), doc('passport', { name: 'Asha Sharma', dob: '15/06/2000', number: 'K1234567', expiryDate: '01/01/2025' }), tick('form_1'), tick('photos')],
    })
    expect(severityOf(r, 'expired:')).toBe('blocker')
  })
})

describe('driving licence after a learner\'s licence', () => {
  const base = (issueDate: string) => [
    doc('learner_licence', { name: 'Asha Sharma', dob: '15/06/2000', number: 'MH14/LL/2026/1', issueDate }),
    aadhaar(),
    tick('form_1'),
    tick('photos'),
  ]
  const answers = { category: 'private' }

  it('is fine 45 days after the learner\'s licence was issued', () => {
    const r = run('driving_licence', { answers, docs: base('26/09/2026') })
    expect(has(r, 'timing:')).toBe(false)
    expect(r.verdict).toBe('ready')
  })

  it('blocks when the learner\'s licence is under 30 days old', () => {
    const r = run('driving_licence', { answers, docs: base('31/10/2026') })
    expect(severityOf(r, 'timing:ll_waiting_period')).toBe('blocker')
    expect(r.issues.find((i) => i.id.startsWith('timing:'))?.fix).toContain('30 days after 31/10/2026')
  })

  it('blocks when the learner\'s licence is older than about six months', () => {
    const r = run('driving_licence', { answers, docs: base('01/03/2026') })
    expect(severityOf(r, 'timing:ll_validity')).toBe('blocker')
  })

  it('asks for the issue date when it is missing', () => {
    const r = run('driving_licence', {
      answers,
      docs: [doc('learner_licence', { name: 'Asha Sharma', number: 'MH14/LL/2026/1' }), aadhaar(), tick('form_1'), tick('photos')],
    })
    expect(has(r, 'window_missing:')).toBe(true)
  })

  it('checks the learner\'s licence boundaries exactly: 30 and 180 days are fine', () => {
    expect(has(run('driving_licence', { answers, docs: base('11/10/2026') }), 'timing:')).toBe(false) // 30 days
    expect(has(run('driving_licence', { answers, docs: base('14/05/2026') }), 'timing:')).toBe(false) // 180 days
    expect(has(run('driving_licence', { answers, docs: base('13/05/2026') }), 'timing:')).toBe(true) // 181 days
  })
})

describe('driving licence renewal', () => {
  const docsFor = (expiryDate: string) => [
    doc('driving_licence', { name: 'Asha Sharma', dob: '15/06/2000', number: 'MH1420110062821', expiryDate }),
    tick('form_1'),
    tick('photos'),
  ]
  const answers = { category: 'private', address_changed: 'no' }

  it('is ready for a licence that is valid for months', () => {
    expect(run('licence_renewal', { answers, docs: docsFor('01/03/2027') }).verdict).toBe('ready')
  })
  it('only notes a licence that expired within the 30-day grace period', () => {
    const r = run('licence_renewal', { answers, docs: docsFor('20/10/2026') })
    expect(severityOf(r, 'timing:renewal_expired')).toBe('info')
    expect(r.verdict).toBe('ready')
    expect(has(r, 'expired:')).toBe(false) // the window handles it; the generic "expired" blocker is not used
  })
  it('warns once the 30-day grace period is over, and only that message', () => {
    const r = run('licence_renewal', { answers, docs: docsFor('01/01/2025') })
    expect(ids(r).filter((i) => i.startsWith('timing:')).map((i) => i.split(':', 2).join(':'))).toEqual(['timing:renewal_over_grace'])
    expect(severityOf(r, 'timing:renewal_over_grace')).toBe('warning')
  })
  it('gives the long-expired message only, not both, after more than five years', () => {
    const r = run('licence_renewal', { answers, docs: docsFor('01/01/2020') })
    expect(ids(r).filter((i) => i.startsWith('timing:')).map((i) => i.split(':', 2).join(':'))).toEqual(['timing:renewal_long_expired'])
  })
  it('asks for address proof only if the address changed', () => {
    expect(ids(run('licence_renewal', { answers: { ...answers, address_changed: 'yes' }, docs: docsFor('01/03/2027') }))).toContain('missing:address_proof')
    expect(ids(run('licence_renewal', { answers, docs: docsFor('01/03/2027') }))).not.toContain('missing:address_proof')
  })
  it('notes when renewal is very early', () => {
    const r = run('licence_renewal', { answers, docs: docsFor('01/01/2029') })
    expect(severityOf(r, 'timing:renewal_too_early')).toBe('info')
  })
})

describe('vehicle services', () => {
  it('new registration: a loan adds Form 34', () => {
    const yes = run('vehicle_registration', { answers: { financed: 'yes' }, docs: [] })
    const no = run('vehicle_registration', { answers: { financed: 'no' }, docs: [] })
    expect(ids(yes)).toContain('missing:form_34')
    expect(ids(no)).not.toContain('missing:form_34')
  })

  it('new registration: expired insurance is a blocker', () => {
    const r = run('vehicle_registration', { answers: { financed: 'no' }, docs: [doc('insurance', { name: 'Asha Sharma', expiryDate: '01/10/2026' })] })
    expect(severityOf(r, 'expired:')).toBe('blocker')
  })

  it('transfer: Form 28 only when moving to another state, Form 35 only with a loan', () => {
    const a = run('ownership_transfer', { answers: { financed: 'no', location: 'same_state' }, docs: [] })
    const b = run('ownership_transfer', { answers: { financed: 'yes', location: 'other_state' }, docs: [] })
    expect(ids(a)).not.toEqual(expect.arrayContaining(['missing:form_28']))
    expect(ids(a)).not.toContain('missing:form_35')
    expect(ids(b)).toEqual(expect.arrayContaining(['missing:form_28', 'missing:form_35']))
  })

  it('transfer: checks the registration number format on the RC', () => {
    const r = run('ownership_transfer', { answers: { financed: 'no', location: 'same_state' }, docs: [doc('rc', { name: 'Asha Sharma', number: '12345', expiryDate: '01/01/2035' })] })
    expect(has(r, 'number:')).toBe(true)
  })
})

describe('passport: fresh', () => {
  it('accepts a school certificate as proof of date of birth for someone born in 1990', () => {
    const r = run('passport_fresh', { dob: '15/06/1990', docs: [aadhaar('Asha Sharma', '15/06/1990'), doc('school_certificate', { name: 'Asha Sharma', dob: '15/06/1990' })] })
    expect(r.verdict).toBe('ready')
  })

  it('does not accept Aadhaar alone as proof of date of birth', () => {
    const r = run('passport_fresh', { dob: '15/06/1990', docs: [aadhaar('Asha Sharma', '15/06/1990')] })
    expect(ids(r)).toContain('missing:dob_proof_born_before_cutoff')
  })

  it('counts a PAN only if it shows the exact date of birth', () => {
    const yearOnly = doc('pan', { name: 'Asha Sharma', dob: '1990', number: 'ABCPS1234F' })
    const exact = doc('pan', { name: 'Asha Sharma', dob: '15/06/1990', number: 'ABCPS1234F' })
    const a = run('passport_fresh', { dob: '15/06/1990', docs: [aadhaar('Asha Sharma', '15/06/1990'), yearOnly] })
    const b = run('passport_fresh', { dob: '15/06/1990', docs: [aadhaar('Asha Sharma', '15/06/1990'), exact] })
    expect(a.issues.find((i) => i.id === 'missing:dob_proof_born_before_cutoff')?.found).toContain('does not show a full date of birth')
    expect(ids(b)).not.toContain('missing:dob_proof_born_before_cutoff')
  })

  it('born on or after 1 Oct 2023 accepts only a birth certificate', () => {
    const school = doc('school_certificate', { name: 'Baby', dob: '02/01/2024' })
    const birth = doc('birth_certificate', { name: 'Baby', dob: '02/01/2024' })
    expect(ids(run('passport_minor', { dob: '02/01/2024', answers: { consent: 'both_parents' }, docs: [school] }))).toContain('missing:dob_proof_born_after_cutoff')
    expect(ids(run('passport_minor', { dob: '02/01/2024', answers: { consent: 'both_parents' }, docs: [birth] }))).not.toContain('missing:dob_proof_born_after_cutoff')
  })

  it('points a minor to the minor process', () => {
    const r = run('passport_fresh', { dob: '15/06/2015', docs: [] })
    expect(has(r, 'eligibility:minor')).toBe(true)
  })

  it('missing non-ECR proof is a warning, not a blocker; a birth certificate counts for it only from age 50', () => {
    const birth = (dob: string) => doc('birth_certificate', { name: 'Asha Sharma', dob })
    const young = run('passport_fresh', { dob: '15/06/1990', docs: [aadhaar('Asha Sharma', '15/06/1990'), birth('15/06/1990')] })
    expect(severityOf(young, 'missing:non_ecr_proof')).toBe('warning')
    expect(young.verdict).toBe('almost_ready')
    const older = run('passport_fresh', { dob: '15/06/1970', docs: [aadhaar('Asha Sharma', '15/06/1970'), birth('15/06/1970')] })
    expect(has(older, 'missing:non_ecr_proof')).toBe(false)
  })
})

describe('passport: re-issue', () => {
  it('an expired old passport is fine and raises no expiry blocker', () => {
    const r = run('passport_reissue', {
      dob: '15/06/1990',
      answers: { reason: 'expiry_or_pages' },
      docs: [doc('passport', { name: 'Asha Sharma', dob: '15/06/1990', number: 'K1234567', expiryDate: '01/01/2026' }), aadhaar('Asha Sharma', '15/06/1990')],
    })
    expect(has(r, 'expired:')).toBe(false)
  })

  it('lost or damaged asks for the affidavit, the police report and a date-of-birth proof', () => {
    const r = run('passport_reissue', { dob: '15/06/1990', answers: { reason: 'lost_damaged' }, docs: [aadhaar('Asha Sharma', '15/06/1990')] })
    expect(ids(r)).toEqual(expect.arrayContaining(['missing:annexure_f', 'missing:police_report', 'missing:dob_proof_lost_born_before_cutoff']))
    expect(ids(r)).not.toContain('missing:old_passport')
  })
})

describe('passport: minor', () => {
  it('consent form depends on whether both parents can sign', () => {
    const both = run('passport_minor', { dob: '15/06/2015', answers: { consent: 'both_parents' }, docs: [] })
    const one = run('passport_minor', { dob: '15/06/2015', answers: { consent: 'one_parent' }, docs: [] })
    expect(ids(both)).toContain('missing:annexure_d')
    expect(ids(both)).not.toContain('missing:annexure_c')
    expect(ids(one)).toContain('missing:annexure_c')
    expect(ids(one)).not.toContain('missing:annexure_d')
  })
})

describe('consistency across documents', () => {
  const answers = { category: 'private' }
  const withDocs = (...docs: ProvidedDoc[]) => run('learner_licence', { answers, docs: [...docs, tick('form_1'), tick('photos')] })

  it('a name that is clearly different is a blocker', () => {
    const r = withDocs(aadhaar('Asha Sharma'), doc('pan', { name: 'Radha Sharma', dob: '15/06/2000', number: 'ABCPS1234F' }))
    expect(severityOf(r, 'name:')).toBe('blocker')
    expect(r.verdict).toBe('not_ready')
  })

  it('reordered, partial, initials and fuzzy names are warnings, never blockers', () => {
    for (const other of ['Sharma Asha', 'Asha Kumari Sharma', 'A Sharma', 'Ashaa Sharma']) {
      const r = withDocs(aadhaar('Asha Sharma'), doc('pan', { name: other, dob: '15/06/2000', number: 'ABCPS1234F' }))
      const sev = severityOf(r, 'name:')
      expect(sev === 'warning' || sev === 'info' || sev === undefined, `${other}: ${sev}`).toBe(true)
      expect(sev).not.toBe('blocker')
    }
  })

  it('a date of birth that differs from the one entered is a blocker', () => {
    const r = withDocs(aadhaar('Asha Sharma', '16/06/2000'))
    expect(severityOf(r, 'dob:')).toBe('blocker')
  })

  it('a year-only date of birth in the same year is not a mismatch', () => {
    const r = withDocs(aadhaar('Asha Sharma', '2000'))
    expect(has(r, 'dob:')).toBe(false)
  })

  it('a different address is only a warning', () => {
    const r = withDocs(aadhaar(), doc('utility_bill', { name: 'Asha Sharma', address: '45 Park Avenue, Andheri West, Mumbai 400053' }))
    expect(severityOf(r, 'address:')).toBe('warning')
  })

  it('a mistyped Aadhaar number is a warning and never echoes the digits', () => {
    const r = withDocs(doc('aadhaar', { name: 'Asha Sharma', dob: '15/06/2000', address: ADDRESS, number: '234567890123' }))
    const issue = r.issues.find((i) => i.id.startsWith('number:'))!
    expect(issue.severity).toBe('warning')
    expect(issue.title).toContain('Aadhaar') // proper nouns keep their capital
    expect(JSON.stringify(issue)).not.toContain('234567890123')
  })

  it('unreadable dates are flagged', () => {
    const r = withDocs(doc('aadhaar', { name: 'Asha Sharma', dob: 'sometime', address: ADDRESS, number: AADHAAR }))
    expect(has(r, 'date_unreadable:')).toBe(true)
  })

  it('PAN 5th letter differing from the surname initial is only information', () => {
    const r = withDocs(aadhaar('Asha Sharma'), doc('pan', { name: 'Asha Sharma', dob: '15/06/2000', number: 'ABCPK1234F' }))
    expect(severityOf(r, 'pan_surname:')).toBe('info')
    expect(r.verdict).toBe('ready')
  })
})

describe('applicant inputs', () => {
  it('needs a readable, non-future date of birth', () => {
    expect(ids(run('learner_licence', { dob: '', answers: { category: 'private' }, docs: [] }))).toContain('dob_missing')
    expect(ids(run('learner_licence', { dob: '1990', answers: { category: 'private' }, docs: [] }))).toContain('dob_unreadable')
    expect(ids(run('learner_licence', { dob: '15/06/2030', answers: { category: 'private' }, docs: [] }))).toContain('dob_future')
  })
  it('age is calculated on the appointment date, not today', () => {
    expect(run('learner_licence', { dob: '11/11/2008', asOf: '2026-11-10', answers: { category: 'private' }, docs: [] }).age).toBe(17)
    expect(run('learner_licence', { dob: '11/11/2008', asOf: '2026-11-11', answers: { category: 'private' }, docs: [] }).age).toBe(18)
  })
})

describe('wording', () => {
  it('no issue text promises an outcome', () => {
    const r = run('passport_fresh', { dob: '15/06/1990', docs: [aadhaar('Asha Sharma', '15/06/1990'), doc('pan', { name: 'Someone Else', dob: '01/01/1991', number: 'bad' })] })
    const text = JSON.stringify(r.issues).toLowerCase()
    expect(r.issues.length).toBeGreaterThan(2)
    for (const banned of ['will be rejected', 'guarantee', 'will be approved', 'definitely']) expect(text).not.toContain(banned)
  })
})

describe('sources', () => {
  it('gives unverified issues no source link and verified ones a government link', () => {
    const r = run('learner_licence', { answers: { category: 'private' }, docs: [aadhaar()] })
    const unverified = r.issues.find((x) => x.provisional)
    const verified = r.issues.find((x) => x.id === 'missing:form_1')
    expect(verified?.provisional).toBe(false)
    expect(verified?.sourceUrl).toMatch(/^https:\/\/[^/]*parivahan\.gov\.in\/.+/)
    for (const x of r.issues.filter((y) => y.provisional)) expect(x.sourceUrl).toBeUndefined()
    expect(unverified === undefined || unverified.sourceUrl === undefined).toBe(true)
  })
})

describe('Aadhaar update', () => {
  const NAME_DOC = () => doc('passport', { name: 'Asha Sharma', dob: '15/06/2000', number: 'K1234567', expiryDate: '01/01/2031' })

  it('asks which update first', () => {
    expect(ids(run('aadhaar_update', { answers: {}, docs: [] }))).toContain('unanswered:update')
  })
  it('is ready for a name update with a passport', () => {
    const r = run('aadhaar_update', { answers: { update: 'name' }, docs: [NAME_DOC()] })
    expect(r.verdict).toBe('ready')
  })
  it('does not accept a PAN card as proof of identity (it is not on the UIDAI list)', () => {
    const r = run('aadhaar_update', { answers: { update: 'name' }, docs: [doc('pan', { name: 'Asha Sharma', dob: '15/06/2000', number: 'ABCPK1234F' })] })
    expect(ids(r)).toContain('missing:name_proof')
  })
  it('does not accept a driving licence as proof of address', () => {
    const r = run('aadhaar_update', { answers: { update: 'address' }, docs: [doc('driving_licence', { name: 'Asha Sharma', dob: '15/06/2000', number: 'MH1420110012345' })] })
    expect(ids(r)).toContain('missing:address_proof')
  })
  it('accepts a driving licence as proof of identity', () => {
    const r = run('aadhaar_update', { answers: { update: 'name' }, docs: [doc('driving_licence', { name: 'Asha Sharma', dob: '15/06/2000', number: 'MH1420110012345', expiryDate: '01/01/2040' })] })
    expect(ids(r)).not.toContain('missing:name_proof')
  })
  it('requires a birth certificate for a date-of-birth update under 18', () => {
    const answers = { update: 'dob' }
    const r = run('aadhaar_update', { dob: '15/06/2012', answers, docs: [doc('passport', { name: 'Asha Sharma', dob: '15/06/2012', number: 'K1234567', expiryDate: '01/01/2031' })] })
    expect(ids(r)).toContain('missing:dob_proof_minor')
    const ok = run('aadhaar_update', { dob: '15/06/2012', answers, docs: [doc('birth_certificate', { name: 'Asha Sharma', fatherName: 'Ramesh Sharma', dob: '15/06/2012' })] })
    expect(ok.verdict).toBe('ready')
  })
  it('accepts several documents for a date-of-birth update from 18', () => {
    const r = run('aadhaar_update', { answers: { update: 'dob' }, docs: [doc('school_certificate', { name: 'Asha Sharma', fatherName: 'Ramesh Sharma', dob: '15/06/2000' })] })
    expect(ids(r)).not.toContain('missing:dob_proof_adult')
  })
  it('warns when a utility bill is older than three months, and not at the edge', () => {
    const bill = (issueDate: string) => run('aadhaar_update', { answers: { update: 'address' }, docs: [doc('utility_bill', { name: 'Asha Sharma', address: ADDRESS, issueDate })] })
    expect(has(bill('01/07/2026'), 'timing:bill_age')).toBe(true)
    expect(has(bill('10/08/2026'), 'timing:bill_age')).toBe(false) // 92 days
    expect(has(bill('08/08/2026'), 'timing:bill_age')).toBe(true) // 94 days
  })
  it('flags a name that differs between the documents submitted', () => {
    const r = run('aadhaar_update', { answers: { update: 'dob' }, docs: [doc('birth_certificate', { name: 'Asha Sharma', fatherName: 'R Sharma', dob: '15/06/2000' }), doc('passport', { name: 'Meera Rao', dob: '15/06/2000', number: 'K1234567', expiryDate: '01/01/2031' })] })
    expect(ids(r).some((i) => i.startsWith('name:'))).toBe(true)
  })
  it('is marked verified and every requirement cites the UIDAI document', () => {
    const s = getService('aadhaar_update')!
    expect(s.status).toBe('verified')
    for (const req of s.requirements) expect(req.sourceUrl).toMatch(/^https:\/\/[^/]*uidai\.gov\.in\//)
  })
})

describe('driving licence: duplicate, address or name change', () => {
  const dl = () => doc('driving_licence', { name: 'Asha Sharma', dob: '15/06/2000', number: 'MH1420110012345' })

  it('needs a police complaint for a duplicate', () => {
    const r = run('licence_changes', { answers: { change: 'duplicate' }, docs: [dl()] })
    expect(severityOf(r, 'missing:police_complaint')).toBe('blocker')
    expect(run('licence_changes', { answers: { change: 'duplicate' }, docs: [dl(), tick('police_complaint')] }).verdict).toBe('ready')
  })
  it('needs address proof only for an address change', () => {
    expect(ids(run('licence_changes', { answers: { change: 'address' }, docs: [dl()] }))).toContain('missing:address_proof')
    expect(ids(run('licence_changes', { answers: { change: 'duplicate' }, docs: [dl(), tick('police_complaint')] }))).not.toContain('missing:address_proof')
  })
  it('lists the name-change papers as unverified, and is satisfied by any one', () => {
    const missing = run('licence_changes', { answers: { change: 'name' }, docs: [dl()] })
    expect(missing.issues.find((i) => i.id.startsWith('missing:name_papers'))?.provisional).toBe(true)
    expect(ids(run('licence_changes', { answers: { change: 'name' }, docs: [dl(), tick('affidavit')] }))).not.toContain('missing:name_papers')
  })
  it('does not raise an expiry blocker for an expired licence it cannot judge', () => {
    const expired = doc('driving_licence', { name: 'Asha Sharma', dob: '15/06/2000', number: 'MH1420110012345', expiryDate: '01/01/2025' })
    expect(has(run('licence_changes', { answers: { change: 'duplicate' }, docs: [expired, tick('police_complaint')] }), 'expired:')).toBe(false)
  })
})
