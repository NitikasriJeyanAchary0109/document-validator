import { PASSPORT_ADDRESS_PROOF, PASSPORT_RETRIEVED, PASSPORT_SOURCE_NOTE, PASSPORT_STANDING_NOTES, passportDobRequirements } from '../common'
import type { Service } from '../types'

const REISSUE = 'https://www.passportindia.gov.in/psp/docAdvisor/reissuePassport'
const ADDRESS = 'https://www.passportindia.gov.in/psp/ListDocuments'
const LOST = 'https://www.passportindia.gov.in/psp/FaqLostDamagedPassports'

const lost = { answer: { id: 'reason', is: 'lost_damaged' } }
const notLost = { answer: { id: 'reason', is: ['expiry_or_pages', 'change_details'] } }

export const passportReissue: Service = {
  id: 'passport_reissue',
  category: 'passport',
  title: 'Passport: re-issue (renewal, lost, damaged)',
  summary: 'Replace an existing passport that is expiring, full, lost or damaged.',
  officialUrl: REISSUE,
  status: 'verified',
  retrieved: PASSPORT_RETRIEVED,
  sourceNote: `${PASSPORT_SOURCE_NOTE} The lost-or-damaged list is verified; the list for a plain renewal is not (marked unverified below).`,
  questions: [
    {
      id: 'reason',
      label: 'Why are you applying for a new passport?',
      options: [
        { value: 'expiry_or_pages', label: 'It is expiring, expired or out of pages' },
        { value: 'lost_damaged', label: 'It is lost, stolen or damaged' },
        { value: 'change_details', label: 'I need to change a detail (name, date of birth, address)' },
      ],
    },
  ],
  requirements: [
    {
      id: 'old_passport',
      label: 'Your old passport',
      help: 'The original, plus self-attested copies of the first two and last two pages, including the ECR or non-ECR page.',
      anyOf: [{ doc: 'passport' }],
      when: notLost,
      severity: 'blocker',
      provisional: true,
      sourceUrl: REISSUE,
    },
    { id: 'address_proof', label: 'Proof of present address', anyOf: PASSPORT_ADDRESS_PROOF, when: notLost, severity: 'warning', provisional: true, sourceUrl: ADDRESS },
    { id: 'address_proof_lost', label: 'Proof of present address', anyOf: PASSPORT_ADDRESS_PROOF, when: lost, severity: 'blocker', sourceUrl: LOST },
    ...passportDobRequirements('dob_proof_lost', 'blocker', lost),
    { id: 'annexure_f', label: 'Affidavit on how the passport was lost or damaged (Annexure F)', anyOf: [{ doc: 'annexure_f' }], when: lost, severity: 'blocker', sourceUrl: LOST },
    { id: 'police_report', label: 'Police report (original)', help: 'Report a loss to the police straight away.', anyOf: [{ doc: 'police_report' }], when: lost, severity: 'blocker', sourceUrl: LOST },
    {
      id: 'old_passport_copy',
      label: 'Copy of the old passport, if you have one',
      help: 'Self-attested copies of the first two and last two pages. Not compulsory, but the form asks for its number, issue and expiry dates.',
      anyOf: [{ doc: 'passport' }],
      when: lost,
      severity: 'info',
      sourceUrl: LOST,
    },
  ],
  eligibility: [
    {
      id: 'change_details',
      violatedWhen: { answer: { id: 'reason', is: 'change_details' } },
      severity: 'warning',
      found: 'Changing a name, date of birth or other detail needs extra supporting papers that depend on the change.',
      why: 'The standard re-issue list does not cover them.',
      fix: 'Open the document list for your specific change on Passport Seva and bring those papers too.',
      provisional: true,
      sourceUrl: REISSUE,
    },
  ],
  dateWindows: [],
  expiryExempt: ['passport'],
  carry: [
    'Fill in the application on Passport Seva as a re-issue and note your Application Reference Number (ARN).',
    'Pay the fee online before you can book an appointment.',
    'Bring the original of every document and one set of self-attested photocopies.',
    'No duplicate passport is issued: a lost or damaged passport is replaced by a new one with a new number.',
  ],
  notes: [...PASSPORT_STANDING_NOTES, 'Tatkaal is not available for lost or stolen passports.'],
}
