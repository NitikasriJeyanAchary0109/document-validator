// The shape of a service's rules. Rules are DATA: to change what a service asks for, edit its file in
// src/rules/services/. The engine (src/core/engine.ts) never mentions a specific service.

export type FieldKey = 'name' | 'fatherName' | 'dob' | 'address' | 'number' | 'issueDate' | 'expiryDate'

export type DocTypeId =
  // identity, age and address
  | 'aadhaar'
  | 'pan'
  | 'passport'
  | 'driving_licence'
  | 'learner_licence'
  | 'voter_id'
  | 'birth_certificate'
  | 'school_certificate'
  | 'degree_certificate'
  | 'income_tax_proof'
  | 'lic_policy'
  | 'service_record'
  | 'utility_bill'
  | 'rent_agreement'
  | 'bank_passbook'
  | 'employer_letter'
  | 'bank_statement'
  | 'property_tax'
  | 'life_insurance'
  // other identity documents on the UIDAI list
  | 'ration_card'
  | 'service_id'
  | 'pension_id'
  | 'kisan_passbook'
  | 'health_card'
  | 'mgnrega_card'
  | 'marriage_certificate'
  | 'caste_certificate'
  | 'gazette_notification'
  // vehicle papers
  | 'rc'
  | 'insurance'
  | 'puc'
  | 'invoice'
  // forms and supporting papers (tick-only: we cannot read what is inside)
  | 'photos'
  | 'form_1'
  | 'form_1a'
  | 'form_5'
  | 'form_20'
  | 'form_21'
  | 'form_22'
  | 'form_28'
  | 'form_29'
  | 'form_30'
  | 'form_34'
  | 'form_35'
  | 'form_60'
  | 'guardian_consent'
  | 'annexure_c'
  | 'annexure_d'
  | 'annexure_f'
  | 'police_report'
  | 'police_complaint'
  | 'affidavit'
  | 'newspaper_ad'
  | 'parent_passport'

export interface Condition {
  all?: Condition[]
  any?: Condition[]
  not?: Condition
  ageAtLeast?: number
  ageBelow?: number
  /** ISO date YYYY-MM-DD. */
  bornOnOrAfter?: string
  bornBefore?: string
  answer?: { id: string; is: string | string[] }
}

export interface Option {
  value: string
  label: string
}

export interface Question {
  id: string
  label: string
  help?: string
  options: Option[]
}

export interface Acceptable {
  doc: DocTypeId
  /** The document must show a complete date of birth (day, month and year), not only a year or an age. */
  exactDob?: boolean
  /** The document counts only for applicants of at least this age on the appointment date. */
  minAge?: number
  note?: string
}

export type Severity = 'blocker' | 'warning' | 'info'

export interface Requirement {
  id: string
  /** e.g. "Proof of date of birth". */
  label: string
  help?: string
  anyOf: Acceptable[]
  when?: Condition
  /** Severity of the issue raised when nothing acceptable has been added. */
  severity: Severity
  /** Why it matters; shown when the item is missing. */
  why?: string
  /** True until a person has compared this rule with the official page. */
  provisional?: boolean
  sourceUrl?: string
}

/** A problem when `violatedWhen` holds: age limits and similar eligibility rules. */
export interface EligibilityRule {
  id: string
  violatedWhen: Condition
  severity: Severity
  found: string
  why: string
  fix: string
  provisional?: boolean
  sourceUrl?: string
}

export interface WindowMessage {
  found: string
  why: string
  fix: string
}

/**
 * Checks a date on a document against the appointment date. "Days ago" = appointment date minus the document's date,
 * so an expiry date in the future gives a negative number. The date is fine when okMin <= daysAgo <= okMax;
 * `tooLow` applies below okMin and `tooHigh` above okMax. Messages may use {days} and {date}.
 */
export interface DateWindow {
  id: string
  doc: DocTypeId
  field: 'issueDate' | 'expiryDate'
  okMin?: number
  okMax?: number
  /** `tooHigh` applies only up to this many days; beyond it another window takes over. */
  tooHighUpTo?: number
  severity: Severity
  tooLow?: WindowMessage
  tooHigh?: WindowMessage
  provisional?: boolean
  sourceUrl?: string
}

export type ServiceCategory = 'rto' | 'passport' | 'aadhaar'

export interface Service {
  id: string
  category: ServiceCategory
  title: string
  summary: string
  officialUrl: string
  /** 'verified': compared with the live official page by a person. 'provisional': not yet. */
  status: 'verified' | 'provisional'
  /** When the rules were last checked or collected (ISO date). */
  retrieved: string
  /** Where the rules came from and how far to trust them. */
  sourceNote: string
  questions: Question[]
  requirements: Requirement[]
  eligibility: EligibilityRule[]
  dateWindows: DateWindow[]
  /** Documents allowed to be expired on the appointment date (e.g. the old passport in a re-issue). */
  expiryExempt?: DocTypeId[]
  /** Things to do or bring that are not documents we can check (online form first, fee receipt, originals). */
  carry: string[]
  /** What we do not check, and where the rules vary. Always shown. */
  notes: string[]
}
