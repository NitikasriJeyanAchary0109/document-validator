import { RETRIEVED_RTO, RTO_ADDRESS_PROOF, RTO_ID_PROOF, RTO_SOURCE_NOTE, RTO_STANDING_NOTES, VAHAN } from '../common'
import type { Service } from '../types'

export const vehicleRegistration: Service = {
  id: 'vehicle_registration',
  category: 'rto',
  title: 'New vehicle registration',
  summary: 'Register a brand-new car or two-wheeler bought from a dealer.',
  officialUrl: VAHAN,
  status: 'provisional',
  retrieved: RETRIEVED_RTO,
  sourceNote: RTO_SOURCE_NOTE,
  questions: [
    {
      id: 'financed',
      label: 'Did you buy the vehicle on a loan?',
      help: 'A loan adds a hypothecation entry for the lender.',
      options: [
        { value: 'yes', label: 'Yes, there is a loan' },
        { value: 'no', label: 'No loan' },
      ],
    },
  ],
  requirements: [
    { id: 'form_20', label: 'Application for registration (Form 20)', anyOf: [{ doc: 'form_20' }], severity: 'blocker', provisional: true, sourceUrl: VAHAN },
    { id: 'form_21', label: 'Sale certificate (Form 21)', help: 'The dealer provides this.', anyOf: [{ doc: 'form_21' }], severity: 'blocker', provisional: true, sourceUrl: VAHAN },
    { id: 'form_22', label: 'Roadworthiness certificate (Form 22)', help: 'The dealer or manufacturer provides this.', anyOf: [{ doc: 'form_22' }], severity: 'blocker', provisional: true, sourceUrl: VAHAN },
    { id: 'invoice', label: 'Invoice from the dealer', anyOf: [{ doc: 'invoice' }], severity: 'blocker', provisional: true, sourceUrl: VAHAN },
    { id: 'insurance', label: 'Valid vehicle insurance', anyOf: [{ doc: 'insurance' }], severity: 'blocker', provisional: true, sourceUrl: VAHAN },
    { id: 'id_proof', label: 'Proof of identity', anyOf: RTO_ID_PROOF, severity: 'blocker', provisional: true, sourceUrl: VAHAN },
    { id: 'address_proof', label: 'Proof of address', anyOf: RTO_ADDRESS_PROOF, severity: 'blocker', provisional: true, sourceUrl: VAHAN },
    { id: 'pan_or_form60', label: 'PAN card, or Form 60 if you have no PAN', anyOf: [{ doc: 'pan' }, { doc: 'form_60' }], severity: 'blocker', provisional: true, sourceUrl: VAHAN },
    {
      id: 'form_34',
      label: 'Hypothecation entry (Form 34)',
      help: "Signed by the lender. Needed when the vehicle is bought on a loan.",
      anyOf: [{ doc: 'form_34' }],
      when: { answer: { id: 'financed', is: 'yes' } },
      severity: 'blocker',
      provisional: true,
      sourceUrl: VAHAN,
    },
    {
      id: 'puc',
      label: 'Pollution under control (PUC) certificate',
      help: 'Often not asked for a brand-new vehicle. Some guides list it, so check with the dealer.',
      anyOf: [{ doc: 'puc' }],
      severity: 'info',
      provisional: true,
      sourceUrl: VAHAN,
    },
  ],
  eligibility: [],
  dateWindows: [],
  carry: [
    'The dealer often files the application on Vahan. Ask them for the application number and receipt.',
    'Pay the registration fee and road tax as your state requires.',
    'Carry the originals of every document and the vehicle if your RTO asks to inspect it.',
  ],
  notes: [
    ...RTO_STANDING_NOTES,
    'The Motor Vehicles Act leaves the time limit for registering a new vehicle to the Central Rules, which we could not read. Dealers normally file it for you.',
    'Guides disagree on whether a new vehicle can be registered online end to end. Ask the dealer how it works in your state.',
    'Road tax, high-security number plates and temporary registration vary by state. We do not check them.',
  ],
}
