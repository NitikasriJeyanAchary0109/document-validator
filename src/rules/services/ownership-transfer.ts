import { RETRIEVED_RTO, RTO_ADDRESS_PROOF, RTO_ID_PROOF, RTO_SOURCE_NOTE, RTO_STANDING_NOTES, VAHAN } from '../common'
import type { Service } from '../types'

export const ownershipTransfer: Service = {
  id: 'ownership_transfer',
  category: 'rto',
  title: 'Vehicle ownership transfer',
  summary: 'Transfer a used car or two-wheeler to a new owner (the buyer).',
  officialUrl: VAHAN,
  status: 'provisional',
  retrieved: RETRIEVED_RTO,
  sourceNote: RTO_SOURCE_NOTE,
  questions: [
    {
      id: 'financed',
      label: 'Is there a loan recorded on the RC?',
      help: 'If the registration certificate shows a lender, the loan must be cleared on record first.',
      options: [
        { value: 'yes', label: 'Yes, a lender is shown' },
        { value: 'no', label: 'No loan' },
      ],
    },
    {
      id: 'location',
      label: 'Is the buyer in the same state as the registration?',
      options: [
        { value: 'same_state', label: 'Same state' },
        { value: 'other_state', label: 'A different state' },
      ],
    },
  ],
  requirements: [
    {
      id: 'rc',
      label: 'Registration certificate (RC)',
      help: 'The original. Add the registration number and the valid-until date.',
      anyOf: [{ doc: 'rc' }],
      severity: 'blocker',
      provisional: true,
      sourceUrl: VAHAN,
    },
    { id: 'form_29', label: 'Notice of transfer (Form 29), signed by the seller', anyOf: [{ doc: 'form_29' }], severity: 'blocker', provisional: true, sourceUrl: VAHAN },
    { id: 'form_30', label: 'Application for transfer (Form 30), signed by the buyer', anyOf: [{ doc: 'form_30' }], severity: 'blocker', provisional: true, sourceUrl: VAHAN },
    { id: 'insurance', label: 'Valid vehicle insurance', anyOf: [{ doc: 'insurance' }], severity: 'blocker', provisional: true, sourceUrl: VAHAN },
    { id: 'puc', label: 'Valid pollution under control (PUC) certificate', anyOf: [{ doc: 'puc' }], severity: 'blocker', provisional: true, sourceUrl: VAHAN },
    { id: 'id_proof', label: "Buyer's proof of identity", anyOf: RTO_ID_PROOF, severity: 'blocker', provisional: true, sourceUrl: VAHAN },
    { id: 'address_proof', label: "Buyer's proof of address", anyOf: RTO_ADDRESS_PROOF, severity: 'blocker', provisional: true, sourceUrl: VAHAN },
    { id: 'pan_or_form60', label: "Buyer's PAN card, or Form 60 if no PAN", anyOf: [{ doc: 'pan' }, { doc: 'form_60' }], severity: 'warning', provisional: true, sourceUrl: VAHAN },
    {
      id: 'form_35',
      label: 'Hypothecation termination (Form 35) with the lender\'s no-objection letter',
      anyOf: [{ doc: 'form_35' }],
      when: { answer: { id: 'financed', is: 'yes' } },
      severity: 'blocker',
      provisional: true,
      sourceUrl: VAHAN,
    },
    {
      id: 'form_28',
      label: 'No-objection certificate (Form 28) from the registering RTO',
      help: 'For moving the vehicle to another state. A physical inspection is also commonly required.',
      anyOf: [{ doc: 'form_28' }],
      when: { answer: { id: 'location', is: 'other_state' } },
      severity: 'blocker',
      provisional: true,
      sourceUrl: VAHAN,
    },
  ],
  eligibility: [],
  dateWindows: [],
  carry: [
    'The buyer and the seller both usually sign. Ask your RTO whether both must attend.',
    'Time limits, from a secondary copy of the Motor Vehicles Act section 50 and not yet confirmed on a government site: the seller reports the sale within 14 days (45 days if the vehicle is registered in another state with a no-objection certificate), and the buyer applies within 30 days of the transfer.',
    'Carry the originals of every document and the vehicle if an inspection is needed.',
  ],
  notes: [
    ...RTO_STANDING_NOTES,
    'We do not check the deadlines because the sale date is not one of the fields we take. Guides also quote 14 and 90 days for the buyer, which we could not find in the Act copy we read, which says 30 days.',
    'Some guides say Form 35 is not needed if the loan is already cleared on record. Ask your RTO.',
    'Fees, tax clearance and inspection rules vary by state.',
  ],
}
