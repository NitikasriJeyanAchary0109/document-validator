// What we know about each kind of document: how to label it, which fields to ask for, and how to check its number.
import type { NumberKind } from '../core/validators'
import type { DocTypeId, FieldKey } from './types'

export type DocGroup = 'identity' | 'birth' | 'address' | 'vehicle' | 'forms'

export interface DocDef {
  label: string
  group: DocGroup
  /** Fields the user fills in. Empty means tick-only ("I have this"). */
  fields: FieldKey[]
  numberKind?: NumberKind
  /** Label for the "number" field, when the document has one. */
  numberLabel?: string
  hint?: string
}

export const DOCS: Record<DocTypeId, DocDef> = {
  aadhaar: { label: 'Aadhaar', group: 'identity', fields: ['name', 'dob', 'address', 'number'], numberKind: 'aadhaar', numberLabel: 'Aadhaar number', hint: 'Only used here to check the number. Nothing is stored.' },
  pan: { label: 'PAN card', group: 'identity', fields: ['name', 'fatherName', 'dob', 'number'], numberKind: 'pan', numberLabel: 'PAN' },
  passport: { label: 'Passport', group: 'identity', fields: ['name', 'dob', 'number', 'expiryDate'], numberKind: 'passport', numberLabel: 'Passport number' },
  driving_licence: { label: 'Driving licence', group: 'identity', fields: ['name', 'dob', 'address', 'number', 'issueDate', 'expiryDate'], numberKind: 'driving_licence', numberLabel: 'Licence number' },
  learner_licence: { label: "Learner's licence", group: 'identity', fields: ['name', 'dob', 'number', 'issueDate', 'expiryDate'], numberKind: 'plain', numberLabel: "Learner's licence number" },
  voter_id: { label: 'Voter ID (EPIC)', group: 'identity', fields: ['name', 'dob', 'address', 'number'], numberKind: 'voter_id', numberLabel: 'EPIC number' },
  birth_certificate: { label: 'Birth certificate', group: 'birth', fields: ['name', 'fatherName', 'dob'], hint: 'Issued by the Registrar of Births and Deaths or a municipal body.' },
  school_certificate: { label: 'School leaving or Class 10 certificate', group: 'birth', fields: ['name', 'fatherName', 'dob'] },
  degree_certificate: { label: 'Degree or diploma certificate', group: 'birth', fields: ['name'] },
  income_tax_proof: { label: 'Income tax assessment or return', group: 'birth', fields: ['name'] },
  lic_policy: { label: 'LIC or public-company insurance policy bond', group: 'birth', fields: ['name', 'dob'] },
  service_record: { label: 'Service record or pension payment order', group: 'birth', fields: ['name', 'dob'], hint: 'Government servants only, attested by the department.' },
  utility_bill: { label: 'Electricity, water, gas or telephone bill', group: 'address', fields: ['name', 'address', 'issueDate'] },
  rent_agreement: { label: 'Rent agreement', group: 'address', fields: ['name', 'address'] },
  bank_passbook: { label: 'Bank passbook with photo', group: 'address', fields: ['name', 'address'], hint: 'Nationalised, scheduled private or regional rural bank.' },
  employer_letter: { label: 'Employer certificate on letterhead', group: 'address', fields: ['name', 'address'] },
  bank_statement: { label: 'Bank or credit card statement', group: 'address', fields: ['name', 'address', 'issueDate'], hint: 'With the bank stamp and an official signature. Add the statement date.' },
  property_tax: { label: 'Property tax receipt', group: 'address', fields: ['name', 'address', 'issueDate'] },
  life_insurance: { label: 'Life or medical insurance policy', group: 'address', fields: ['name', 'address', 'issueDate'], hint: 'Add the date the policy was issued.' },
  ration_card: { label: 'Ration or PDS photo card (e-Ration card)', group: 'identity', fields: ['name', 'address'] },
  service_id: { label: 'Service photo ID card (Government, PSU or statutory body)', group: 'identity', fields: ['name', 'dob'] },
  pension_id: { label: 'Pensioner or freedom fighter photo ID, or pension payment order', group: 'identity', fields: ['name', 'dob'] },
  kisan_passbook: { label: 'Kisan photo passbook', group: 'identity', fields: ['name', 'address'] },
  health_card: { label: 'CGHS, ECHS, ESIC or Mediclaim card (Government or PSU)', group: 'identity', fields: ['name'] },
  mgnrega_card: { label: 'MGNREGA job card and State domicile certificate', group: 'identity', fields: ['name', 'address'], hint: 'UIDAI lists these together in one row. Ask whether you need both.' },
  marriage_certificate: { label: 'Marriage certificate (Central or State Government)', group: 'identity', fields: ['name'] },
  caste_certificate: { label: 'ST, SC or OBC certificate (Central or State Government)', group: 'identity', fields: ['name', 'address'] },
  gazette_notification: { label: 'Gazette notification of a change of name', group: 'identity', fields: ['name'] },
  rc: { label: 'Registration certificate (RC)', group: 'vehicle', fields: ['name', 'number', 'expiryDate'], numberKind: 'vehicle', numberLabel: 'Registration number' },
  insurance: { label: 'Vehicle insurance', group: 'vehicle', fields: ['name', 'expiryDate'] },
  puc: { label: 'Pollution under control (PUC) certificate', group: 'vehicle', fields: ['expiryDate'] },
  invoice: { label: 'Invoice from the dealer', group: 'vehicle', fields: [] },
  photos: { label: 'Passport-size photographs', group: 'forms', fields: [] },
  form_1: { label: 'Form 1: declaration of physical fitness', group: 'forms', fields: [] },
  form_1a: { label: 'Form 1A: medical certificate', group: 'forms', fields: [], hint: 'From a registered medical practitioner.' },
  form_5: { label: 'Form 5: driving school training certificate', group: 'forms', fields: [] },
  form_20: { label: 'Form 20: application for registration', group: 'forms', fields: [] },
  form_21: { label: 'Form 21: sale certificate', group: 'forms', fields: [], hint: 'The dealer provides this.' },
  form_22: { label: 'Form 22: roadworthiness certificate', group: 'forms', fields: [], hint: 'The dealer or manufacturer provides this.' },
  form_28: { label: 'Form 28: no-objection certificate (NOC)', group: 'forms', fields: [] },
  form_29: { label: 'Form 29: notice of transfer (seller)', group: 'forms', fields: [] },
  form_30: { label: 'Form 30: application for transfer (buyer)', group: 'forms', fields: [] },
  form_34: { label: 'Form 34: hypothecation entry', group: 'forms', fields: [], hint: 'Needed when the vehicle is bought on a loan.' },
  form_35: { label: 'Form 35: hypothecation termination', group: 'forms', fields: [], hint: 'With the lender\'s no-objection letter.' },
  form_60: { label: 'Form 60 (if no PAN)', group: 'forms', fields: [] },
  guardian_consent: { label: 'Parent or guardian consent', group: 'forms', fields: [] },
  annexure_c: { label: 'Annexure C: declaration by one parent', group: 'forms', fields: [] },
  annexure_d: { label: 'Annexure D: consent by both parents', group: 'forms', fields: [] },
  annexure_f: { label: 'Annexure F: affidavit for a lost or damaged passport', group: 'forms', fields: [] },
  police_report: { label: 'Police report (original)', group: 'forms', fields: [] },
  police_complaint: { label: 'Copy of your police complaint', group: 'forms', fields: [] },
  affidavit: { label: 'Affidavit (First Class Judicial Magistrate or Notary Public)', group: 'forms', fields: [] },
  newspaper_ad: { label: 'Copy of the newspaper advertisement', group: 'forms', fields: [] },
  parent_passport: { label: "Parents' passports", group: 'forms', fields: [] },
}

export const docLabel = (id: DocTypeId) => DOCS[id].label

export const FIELD_LABELS: Record<FieldKey, string> = {
  name: 'Name as printed',
  fatherName: "Father's name as printed",
  dob: 'Date of birth',
  address: 'Address as printed',
  number: 'Number',
  issueDate: 'Issue date',
  expiryDate: 'Valid until',
}

export const FIELD_PLACEHOLDERS: Partial<Record<FieldKey, string>> = {
  dob: 'DD/MM/YYYY',
  issueDate: 'DD/MM/YYYY',
  expiryDate: 'DD/MM/YYYY',
}

/** Documents that identify a person, in the order we trust them as the reference when comparing names. */
export const REFERENCE_ORDER: DocTypeId[] = ['passport', 'aadhaar', 'pan', 'driving_licence', 'voter_id', 'birth_certificate', 'school_certificate', 'learner_licence']
