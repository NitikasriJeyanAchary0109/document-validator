import { PASSPORT_ADDRESS_PROOF, PASSPORT_RETRIEVED, PASSPORT_SOURCE_NOTE, PASSPORT_STANDING_NOTES, passportDobRequirements } from '../common'
import type { Service } from '../types'

const MINOR = 'https://www.passportindia.gov.in/psp/SplCaseOfMinorsReqPassport'
const ADDRESS = 'https://www.passportindia.gov.in/psp/ListDocuments'

export const passportMinor: Service = {
  id: 'passport_minor',
  category: 'passport',
  title: 'Passport: child under 18',
  summary: 'A first or renewed passport for a child, with parental consent.',
  officialUrl: MINOR,
  status: 'verified',
  retrieved: PASSPORT_RETRIEVED,
  sourceNote: PASSPORT_SOURCE_NOTE,
  questions: [
    {
      id: 'consent',
      label: 'Can both parents give consent?',
      help: 'This decides which consent form is used.',
      options: [
        { value: 'both_parents', label: 'Yes, both parents' },
        { value: 'one_parent', label: 'No, only one parent can (separation, desertion, other parent abroad, and similar)' },
      ],
    },
  ],
  requirements: [
    ...passportDobRequirements('dob_proof', 'blocker'),
    {
      id: 'address_proof',
      label: 'Proof of present address',
      help: 'For a minor this can be in a parent\'s name, or a copy of a parent\'s passport (first and last pages).',
      anyOf: [...PASSPORT_ADDRESS_PROOF, { doc: 'parent_passport', note: 'First and last pages of a parent\'s passport.' }],
      severity: 'blocker',
      sourceUrl: ADDRESS,
    },
    {
      id: 'annexure_d',
      label: 'Consent of both parents (Annexure D)',
      anyOf: [{ doc: 'annexure_d' }],
      when: { answer: { id: 'consent', is: 'both_parents' } },
      severity: 'blocker',
      sourceUrl: MINOR,
    },
    {
      id: 'annexure_c',
      label: 'Declaration by one parent (Annexure C), with supporting papers for the reason',
      help: 'For example a parent abroad needs a passport copy and proof of residence or travel abroad. The passport office decides whether the papers are enough.',
      anyOf: [{ doc: 'annexure_c' }],
      when: { answer: { id: 'consent', is: 'one_parent' } },
      severity: 'blocker',
      sourceUrl: MINOR,
    },
    {
      id: 'parent_passport',
      label: "Parents' passports",
      help: 'Either both parents attend, or one parent attends with both parents\' passports.',
      anyOf: [{ doc: 'parent_passport' }],
      when: { answer: { id: 'consent', is: 'both_parents' } },
      severity: 'warning',
      sourceUrl: MINOR,
    },
  ],
  eligibility: [
    {
      id: 'adult',
      violatedWhen: { ageAtLeast: 18 },
      severity: 'warning',
      found: 'Applicants aged 18 or over apply as adults.',
      why: 'The minor process asks for parental consent forms an adult does not need.',
      fix: 'Choose "Passport: fresh application (adult)" or re-issue instead.',
      sourceUrl: 'https://www.passportindia.gov.in/psp/docAdvisor/attachmentAdvFreshInp',
    },
  ],
  dateWindows: [],
  carry: [
    'Fill in the application on Passport Seva and note your Application Reference Number (ARN).',
    'Pay the fee online before booking.',
    'Bring the original of every document and one set of self-attested photocopies.',
    'Children under 4 should bring a recent 4.5 x 3.5 cm photograph with a white background.',
  ],
  notes: [
    ...PASSPORT_STANDING_NOTES,
    'Tatkaal is not available for a minor filed with Annexure C, or for some single-parent, out-of-wedlock, adopted and surrogate cases.',
    'Step-parent names, unwed parents and children without a birth record have their own papers. Check the minors page on Passport Seva.',
  ],
}
