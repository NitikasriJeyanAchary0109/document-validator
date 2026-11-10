import { PASSPORT_ADDRESS_PROOF, PASSPORT_RETRIEVED, PASSPORT_SOURCE_NOTE, PASSPORT_STANDING_NOTES, passportDobRequirements } from '../common'
import type { Service } from '../types'

const FRESH = 'https://www.passportindia.gov.in/psp/docAdvisor/attachmentAdvFreshInp'
const ADDRESS = 'https://www.passportindia.gov.in/psp/ListDocuments'

export const passportFresh: Service = {
  id: 'passport_fresh',
  category: 'passport',
  title: 'Passport: fresh application (adult)',
  summary: 'Your first passport, applying as someone aged 18 or over.',
  officialUrl: FRESH,
  status: 'verified',
  retrieved: PASSPORT_RETRIEVED,
  sourceNote: PASSPORT_SOURCE_NOTE,
  questions: [],
  requirements: [
    {
      id: 'address_proof',
      label: 'Proof of present address',
      help: 'Also accepted: Income Tax assessment order, proof of a gas connection, and a copy of your spouse\'s passport if the address matches. Only your present address needs proof.',
      anyOf: PASSPORT_ADDRESS_PROOF,
      severity: 'blocker',
      sourceUrl: ADDRESS,
    },
    ...passportDobRequirements('dob_proof', 'blocker'),
    {
      id: 'non_ecr_proof',
      label: 'Proof of a non-ECR category',
      help: 'For applicants eligible for non-ECR status, for example Class 10 or higher. Without it the passport may be marked ECR.',
      anyOf: [
        { doc: 'school_certificate', note: 'Class 10 pass certificate or higher.' },
        { doc: 'degree_certificate' },
        { doc: 'income_tax_proof', note: 'Assessment and payment proof for the last year.' },
        { doc: 'birth_certificate', minAge: 50, note: 'Accepted for applicants over 50.' },
      ],
      when: { ageAtLeast: 18 },
      severity: 'warning',
      sourceUrl: FRESH,
    },
  ],
  eligibility: [
    {
      id: 'minor',
      violatedWhen: { ageBelow: 18 },
      severity: 'warning',
      found: 'Applicants under 18 follow the process for minors, with parental consent.',
      why: 'The adult document list does not include the parental forms a minor needs.',
      fix: 'Choose "Passport for a child under 18" instead.',
      sourceUrl: 'https://www.passportindia.gov.in/psp/SplCaseOfMinorsReqPassport',
    },
  ],
  dateWindows: [],
  carry: [
    'Fill in the application on Passport Seva and note your Application Reference Number (ARN).',
    'Pay the fee online before you can book an appointment.',
    'Visit the Passport Seva Kendra within 90 days of submitting the form, or it has to be submitted again.',
    'Bring the original of every document and one set of self-attested photocopies.',
    'Attend in person: no agent or employee can submit for you.',
  ],
  notes: [
    ...PASSPORT_STANDING_NOTES,
    'Special situations add documents: marriage, a change of name, government employment, students living away from their parents, and residents of J&K or Nagaland. Check the Document Advisor for your case.',
  ],
}
