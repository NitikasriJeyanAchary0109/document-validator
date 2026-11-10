// Building blocks shared by several services.
import type { Acceptable, Requirement, Severity } from './types'

export const RETRIEVED_RTO = '2026-11-10'

export const SARATHI = 'https://sarathi.parivahan.gov.in/'
export const FORM_2_URL = 'https://parivahan.gov.in/sites/default/files/DownloadForm/cmvr/FORM-2.pdf'
export const LL_FAQ_URL = 'https://sarathi.parivahan.gov.in/sarathicms/api/v1/get-resource/UFhyTWVpVitVVDFjelRxS0pwTU5RVlR2Q29FZTRRSFZsVHZvR3Ric3IzUT0='
export const VAHAN = 'https://vahan.parivahan.gov.in/'
export const PARIVAHAN = 'https://parivahan.gov.in/'

export const RTO_SOURCE_NOTE =
  'Rules marked verified were read on 10 Nov 2026 on two government documents: the Form 2 annexure on parivahan.gov.in and the Sarathi learner licence FAQ. Everything else is marked unverified and shows no source link: it comes from a secondary copy of the Motor Vehicles Act (the India Code site blocked access) or from commercial guides (the Central Motor Vehicles Rules and Vahan pages could not be read).'

export const RTO_STANDING_NOTES = [
  'Rules, forms and fees differ between states and RTOs. Your state transport department or its Sarathi page is the final word.',
  'We check what you tell us. We do not see the documents, so we cannot tell whether a photo, signature or stamp is acceptable, or whether a document is genuine.',
]

const STATE_ADDS = 'Not on the national Form 2 list. Some states add it, so confirm for yours.'

/** Form 2 annexure: one list for proof of age and address; states may add more. */
export const RTO_AGE_PROOF: Acceptable[] = [
  { doc: 'aadhaar' },
  { doc: 'voter_id' },
  { doc: 'lic_policy' },
  { doc: 'passport' },
  { doc: 'school_certificate' },
  { doc: 'birth_certificate' },
  { doc: 'pan', note: STATE_ADDS },
]

export const RTO_ADDRESS_PROOF: Acceptable[] = [
  { doc: 'aadhaar' },
  { doc: 'voter_id' },
  { doc: 'lic_policy' },
  { doc: 'passport' },
  { doc: 'utility_bill', note: STATE_ADDS },
  { doc: 'rent_agreement', note: STATE_ADDS },
  { doc: 'bank_passbook', note: STATE_ADDS },
]

export const RTO_ID_PROOF: Acceptable[] = [{ doc: 'aadhaar' }, { doc: 'passport' }, { doc: 'voter_id' }, { doc: 'driving_licence' }, { doc: 'pan' }]

export const CATEGORY_QUESTION = {
  id: 'category',
  label: 'What do you want to drive?',
  help: 'This decides the minimum age and the medical form.',
  options: [
    { value: 'gearless_50cc', label: 'Motorcycle without gear, up to 50cc' },
    { value: 'private', label: 'Car or geared motorcycle (private use)' },
    { value: 'commercial', label: 'Commercial or transport vehicle' },
  ],
}

/**
 * Form 2 annexure: Form 1 self-declaration for everyone; Form 1A medical certificate for a transport (commercial)
 * licence and for renewal from 40. The Sarathi learner FAQ is stricter (Form 1 "attached with" Form 1A), so a
 * first-time applicant of 40 or more gets a warning, not a blocker.
 */
export function medicalRequirements(): Requirement[] {
  return [
    {
      id: 'form_1',
      label: 'Declaration of physical fitness (Form 1)',
      anyOf: [{ doc: 'form_1' }],
      when: { not: { answer: { id: 'category', is: 'commercial' } } },
      severity: 'blocker',
      provisional: false,
      sourceUrl: FORM_2_URL,
    },
    {
      id: 'form_1a',
      label: 'Medical certificate (Form 1A)',
      help: 'From a registered medical practitioner. Required for a transport licence. Some states require a doctor on an approved list.',
      anyOf: [{ doc: 'form_1a' }],
      when: { answer: { id: 'category', is: 'commercial' } },
      severity: 'blocker',
      provisional: false,
      sourceUrl: FORM_2_URL,
    },
    {
      id: 'form_1a_40',
      label: 'Medical certificate (Form 1A)',
      help: 'The Form 2 list asks for Form 1A at 40 or more only when renewing, but the Sarathi learner licence FAQ says Form 1 goes with Form 1A. The acknowledgment slip for your application shows which your office wants.',
      anyOf: [{ doc: 'form_1a' }],
      when: { all: [{ ageAtLeast: 40 }, { not: { answer: { id: 'category', is: 'commercial' } } }] },
      severity: 'warning',
      provisional: true,
      sourceUrl: LL_FAQ_URL,
    },
    {
      id: 'photos',
      label: 'Passport-size photographs',
      anyOf: [{ doc: 'photos' }],
      severity: 'blocker',
      provisional: false,
      sourceUrl: FORM_2_URL,
    },
  ]
}

// ---- passport date-of-birth rule (verified, see src/rules/services/passport-*.ts)

export const PASSPORT_DOB_CUTOFF = '2023-10-01'

export const PASSPORT_DOB_BEFORE_CUTOFF: Acceptable[] = [
  { doc: 'birth_certificate' },
  { doc: 'school_certificate' },
  { doc: 'pan', exactDob: true },
  { doc: 'driving_licence', exactDob: true },
  { doc: 'voter_id', exactDob: true },
  { doc: 'service_record', exactDob: true },
  { doc: 'lic_policy' },
]

export const PASSPORT_ADDRESS_PROOF: Acceptable[] = [
  { doc: 'utility_bill', note: 'Water, telephone (landline or postpaid), electricity or gas.' },
  { doc: 'bank_passbook', note: 'Scheduled public, private or regional rural bank only.' },
  { doc: 'rent_agreement', note: 'Registered or unregistered.' },
  { doc: 'aadhaar' },
  { doc: 'voter_id' },
  { doc: 'employer_letter', note: 'Only a public limited company, on letterhead with its seal.' },
]

const PASSPORT_DOB_URL = 'https://www.passportindia.gov.in/psp/ListDOB'

/** The two date-of-birth variants: births on or after 1 Oct 2023 accept only a birth certificate. */
export function passportDobRequirements(idPrefix: string, severity: Severity, extraWhen?: Requirement['when'], provisional = false): Requirement[] {
  const wrap = (c: Requirement['when']) => (extraWhen ? { all: [extraWhen, ...(c ? [c] : [])] } : c)
  return [
    {
      id: `${idPrefix}_born_after_cutoff`,
      label: 'Proof of date of birth',
      help: 'For anyone born on or after 1 October 2023 only a birth certificate is listed. A school record, Aadhaar or an affidavit is not a substitute.',
      anyOf: [{ doc: 'birth_certificate' }],
      when: wrap({ bornOnOrAfter: PASSPORT_DOB_CUTOFF }),
      severity,
      provisional,
      sourceUrl: PASSPORT_DOB_URL,
    },
    {
      id: `${idPrefix}_born_before_cutoff`,
      label: 'Proof of date of birth',
      help: 'Any one of these. PAN, driving licence, voter ID and service record count only if they show the exact date. Aadhaar is not accepted as proof of date of birth.',
      anyOf: PASSPORT_DOB_BEFORE_CUTOFF,
      when: wrap({ bornBefore: PASSPORT_DOB_CUTOFF }),
      severity,
      provisional,
      sourceUrl: PASSPORT_DOB_URL,
    },
  ]
}

export const PASSPORT_STANDING_NOTES = [
  'Passport Seva calls its document lists indicative, and the passport officer decides each case.',
  'A date or name that differs between documents commonly causes problems at the counter or during police verification, so settle which is correct before booking.',
  'We check what you tell us. We do not see the documents, so we cannot tell whether a photo, signature or stamp is acceptable, or whether a document is genuine.',
]

export const PASSPORT_SOURCE_NOTE =
  'Carried over from the Passport Mitra (devfest) rule files, which a person compared with the Passport Seva pages on 10 Oct 2026. Passport Seva changes its lists, so re-check the linked page before relying on this.'

export const PASSPORT_RETRIEVED = '2026-10-10'
