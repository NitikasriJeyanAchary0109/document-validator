// Source: UIDAI "List of Acceptable Documents for Enrolment and Update", List IV (update of information for an Aadhaar
// holder of any age). Read in full on 2026-11-11. Name, address and date of birth updates only; the list also covers
// relationship, foreign nationals and head-of-family updates, which we do not model.
import type { Acceptable, Service } from '../types'

const LIST_URL = 'https://backend.uidai.gov.in/get/files/media/document/2026-05/List_of_Supporting_Document_for_Aadhaar_Enrolment_and_Update.pdf'
const PAGE_URL = 'https://uidai.gov.in/hi/updating-data-on-aadhaar'
const VALID = 'It must be currently valid and in your name.'

const NAME_PROOF: Acceptable[] = [
  { doc: 'passport' },
  { doc: 'ration_card' },
  { doc: 'voter_id', note: 'Only if its details are shown online on the Election Commission of India website.' },
  { doc: 'driving_licence' },
  { doc: 'service_id' },
  { doc: 'pension_id' },
  { doc: 'kisan_passbook' },
  { doc: 'health_card' },
  { doc: 'mgnrega_card' },
  { doc: 'marriage_certificate', note: 'If it has no photograph, also bring a photo ID that shows your old name.' },
  { doc: 'caste_certificate' },
  { doc: 'school_certificate', note: 'A marksheet or certificate from a recognised Board or university.' },
  { doc: 'degree_certificate', note: 'A marksheet or certificate from a recognised university or institution.' },
  { doc: 'gazette_notification', note: 'For a change of first name or full name.' },
]

const ADDRESS_PROOF: Acceptable[] = [
  { doc: 'passport' },
  { doc: 'ration_card' },
  { doc: 'voter_id', note: 'Only if its details are shown online on the Election Commission of India website.' },
  { doc: 'service_id' },
  { doc: 'pension_id' },
  { doc: 'kisan_passbook' },
  { doc: 'mgnrega_card' },
  { doc: 'marriage_certificate' },
  { doc: 'caste_certificate' },
  { doc: 'bank_passbook', note: 'Scheduled commercial or State cooperative bank, with your name and photograph, cross-stamped and signed by a bank official. A Post Office passbook also counts.' },
  { doc: 'bank_statement', note: 'Not older than 3 months.' },
  { doc: 'utility_bill', note: 'Electricity, water, landline, post-paid mobile, broadband or gas bill, not older than 3 months.' },
  { doc: 'property_tax', note: 'Not older than 1 year.' },
  { doc: 'rent_agreement', note: 'A registered sale agreement or gift deed, or a registered or unregistered rent, lease or leave and licence agreement.' },
  { doc: 'life_insurance', note: 'Valid up to 1 year from the date of issue.' },
]

const DOB_PROOF_ADULT: Acceptable[] = [
  { doc: 'birth_certificate' },
  { doc: 'passport' },
  { doc: 'service_id' },
  { doc: 'pension_id' },
  { doc: 'school_certificate', note: 'A marksheet or certificate from a recognised Board or university.' },
  { doc: 'degree_certificate' },
]

const when = (v: string) => ({ answer: { id: 'update', is: v } })

export const aadhaarUpdate: Service = {
  id: 'aadhaar_update',
  category: 'aadhaar',
  title: 'Aadhaar update: name, address or date of birth',
  summary: 'Change the name, address or date of birth on your Aadhaar. Check your supporting documents against the UIDAI list.',
  officialUrl: PAGE_URL,
  status: 'verified',
  retrieved: '2026-11-11',
  sourceNote:
    'From the UIDAI "List of Acceptable Documents for Enrolment and Update" (List IV, update of information), read on uidai.gov.in on 11 Nov 2026. UIDAI changes this list, so re-check the linked page. Only name, address and date of birth updates are covered here.',
  questions: [
    {
      id: 'update',
      label: 'What do you want to update?',
      help: 'Pick one. If you need more than one, check each separately.',
      options: [
        { value: 'name', label: 'My name' },
        { value: 'address', label: 'My address' },
        { value: 'dob', label: 'My date of birth' },
      ],
    },
  ],
  requirements: [
    {
      id: 'name_proof',
      label: 'Proof of identity showing your name and photograph',
      help: `The name on this document is copied into your Aadhaar as written. ${VALID}`,
      anyOf: NAME_PROOF,
      when: when('name'),
      severity: 'blocker',
      sourceUrl: LIST_URL,
    },
    {
      id: 'address_proof',
      label: 'Proof of address in India',
      help: `Showing your name and address. ${VALID}`,
      anyOf: ADDRESS_PROOF,
      when: when('address'),
      severity: 'blocker',
      sourceUrl: LIST_URL,
    },
    {
      id: 'dob_proof_minor',
      label: 'Birth certificate',
      help: 'For a resident Indian under 18, a birth certificate issued under the Registration of Births and Deaths Act, 1969 is mandatory as proof of date of birth.',
      anyOf: [{ doc: 'birth_certificate' }],
      when: { all: [when('dob'), { ageBelow: 18 }] },
      severity: 'blocker',
      sourceUrl: LIST_URL,
    },
    {
      id: 'dob_proof_adult',
      label: 'Proof of date of birth',
      help: 'Any one of these, showing your name and date of birth.',
      anyOf: DOB_PROOF_ADULT,
      when: { all: [when('dob'), { ageAtLeast: 18 }] },
      severity: 'blocker',
      sourceUrl: LIST_URL,
    },
  ],
  eligibility: [],
  dateWindows: [
    { id: 'bill_age', doc: 'utility_bill', field: 'issueDate', okMax: 92, severity: 'warning', sourceUrl: LIST_URL, tooHigh: { found: 'Your bill is dated {date}, {days} days before the appointment.', why: 'UIDAI accepts electricity, water, telephone, broadband and gas bills not older than 3 months.', fix: 'Bring a more recent bill.' } },
    { id: 'statement_age', doc: 'bank_statement', field: 'issueDate', okMax: 92, severity: 'warning', sourceUrl: LIST_URL, tooHigh: { found: 'Your statement is dated {date}, {days} days before the appointment.', why: 'UIDAI accepts a bank or credit card statement not older than 3 months.', fix: 'Bring a more recent statement.' } },
    { id: 'property_tax_age', doc: 'property_tax', field: 'issueDate', okMax: 365, severity: 'warning', sourceUrl: LIST_URL, tooHigh: { found: 'Your receipt is dated {date}, {days} days before the appointment.', why: 'UIDAI accepts a property tax receipt not older than 1 year.', fix: 'Bring a more recent receipt.' } },
    { id: 'policy_age', doc: 'life_insurance', field: 'issueDate', okMax: 365, severity: 'warning', sourceUrl: LIST_URL, tooHigh: { found: 'Your policy was issued on {date}, {days} days before the appointment.', why: 'UIDAI accepts a life or medical insurance policy valid up to 1 year from the date of issue.', fix: 'Bring a document issued within the last year.' } },
  ],
  carry: [
    'Take your current Aadhaar number or card, and the original of each supporting document.',
    'Book an appointment at an Aadhaar Seva Kendra or enrolment centre, or follow the online update option on the UIDAI page if your type of update allows it.',
    'The name and date of birth must be the same across every document you submit.',
  ],
  notes: [
    'We check what you tell us. We do not see the documents, so we cannot tell whether a photo, stamp or signature is acceptable, or whether a document is genuine.',
    'UIDAI also accepts a certificate in its own format from listed officials (such as a Tehsildar or Gazetted Officer) as proof of address, and a family head can share their address for a head-of-family update. Neither is modelled here: see the official list.',
    'There are limits on how many times a name or gender can be updated, and special steps for a date of birth that was recorded as declared or approximate. UIDAI sets these in its own procedures, linked from the official list.',
    'If you earlier submitted a birth certificate as date-of-birth proof, UIDAI asks for the corrected certificate with the same registration number. If you submitted another document, bring a corrected version of it or a birth certificate.',
    'A woman updating a date of birth after changing her name on marriage can use documents issued before the marriage together with evidence of the name change.',
    'For a non-resident Indian under 18, a birth certificate or Indian passport is accepted for date of birth. This tool assumes you are a resident.',
  ],
}
