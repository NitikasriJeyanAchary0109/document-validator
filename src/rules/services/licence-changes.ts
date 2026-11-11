// Source: the Form 2 annexure on parivahan.gov.in (list of documents), which covers duplicate licence, change of address
// and change of name. Read 2026-11-10. Form 2 does not say which of the name-change papers is needed, so that one
// requirement is marked unverified.
import { FORM_2_URL, RETRIEVED_RTO, RTO_ADDRESS_PROOF, RTO_STANDING_NOTES, SARATHI } from '../common'
import type { Service } from '../types'

const when = (v: string) => ({ answer: { id: 'change', is: v } })

export const licenceChanges: Service = {
  id: 'licence_changes',
  category: 'rto',
  title: 'Driving licence: duplicate, change of address or name',
  summary: 'Replace a lost or damaged driving licence, or update the address or name printed on it.',
  officialUrl: SARATHI,
  status: 'provisional',
  retrieved: RETRIEVED_RTO,
  sourceNote:
    'Documents come from the Form 2 annexure on parivahan.gov.in, read on 10 Nov 2026. Fees, forms and extra steps (for example a medical certificate or an address in the same State) were not on it and vary by State, so they are not checked.',
  questions: [
    {
      id: 'change',
      label: 'What do you need?',
      options: [
        { value: 'duplicate', label: 'A duplicate: my licence is lost, damaged or defaced' },
        { value: 'address', label: 'Change or correct the address' },
        { value: 'name', label: 'Change or correct the name' },
      ],
    },
  ],
  requirements: [
    {
      id: 'licence',
      label: 'Your driving licence',
      help: 'Form 2 asks for the particulars of your existing licence. If you have lost it, enter the number from an old copy and leave the dates blank.',
      anyOf: [{ doc: 'driving_licence' }],
      severity: 'warning',
      provisional: false,
      sourceUrl: FORM_2_URL,
    },
    {
      id: 'police_complaint',
      label: 'Copy of the police complaint',
      help: 'Form 2 lists a copy of the complaint made when a licence was lost, mutilated, defaced or damaged.',
      anyOf: [{ doc: 'police_complaint' }],
      when: when('duplicate'),
      severity: 'blocker',
      provisional: false,
      sourceUrl: FORM_2_URL,
    },
    {
      id: 'address_proof',
      label: 'Proof of address',
      help: 'Form 2 asks for proof of address when you change the address on a licence.',
      anyOf: RTO_ADDRESS_PROOF,
      when: when('address'),
      severity: 'blocker',
      provisional: false,
      sourceUrl: FORM_2_URL,
    },
    {
      id: 'name_papers',
      label: 'Papers supporting the change of name',
      help: 'Form 2 lists an affidavit sworn before a First Class Judicial Magistrate or a Notary Public, a marriage certificate, and a copy of a newspaper advertisement. It does not say which apply to you, so ask your RTO.',
      anyOf: [{ doc: 'affidavit' }, { doc: 'marriage_certificate' }, { doc: 'newspaper_ad' }],
      when: when('name'),
      severity: 'warning',
      provisional: true,
    },
  ],
  eligibility: [],
  dateWindows: [],
  expiryExempt: ['driving_licence'],
  carry: [
    'Fill in Form 2 (the application form) online on Sarathi or on paper. It covers duplicate licence, change of address and change of name.',
    'Carry the original of every document, and photocopies if your RTO asks for them.',
  ],
  notes: [
    ...RTO_STANDING_NOTES,
    'We do not check whether your licence has expired. If it has, you may need to renew it first: ask your RTO.',
  ],
}
