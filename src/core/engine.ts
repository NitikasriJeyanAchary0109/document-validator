// The checker. It knows nothing about specific services: everything it asks for comes from a Service (src/rules).
// Wording rule: say "commonly causes problems", never "will be rejected", and never promise an outcome or a timeline.
import { DOCS, FIELD_LABELS, REFERENCE_ORDER, docLabel } from '../rules/documents'
import type { Acceptable, Condition, DocTypeId, FieldKey, Requirement, Service, Severity } from '../rules/types'
import { ageOn, compareFull, daysBetween, formatDate, isFull, parseDate, parseFullDate, today, type FullDate } from './dates'
import { compareAddresses, compareNames } from './names'
import { validateNumber } from './validators'

export interface ProvidedDoc {
  id: string
  type: DocTypeId
  fields: Partial<Record<FieldKey, string>>
  /** For tick-only documents (forms, photographs): the user says they have it. */
  present?: boolean
}

export interface CheckInput {
  service: Service
  /** The applicant's date of birth as typed: DD/MM/YYYY or YYYY-MM-DD. */
  dob: string
  /** Appointment date (YYYY-MM-DD or DD/MM/YYYY). Defaults to today. */
  asOf?: string
  answers: Record<string, string>
  docs: ProvidedDoc[]
}

export type IssueKind = 'input' | 'missing' | 'eligibility' | 'timing' | 'expiry' | 'format' | 'consistency'

export interface Issue {
  id: string
  kind: IssueKind
  severity: Severity
  title: string
  found: string
  why: string
  fix: string
  /** True when the rule behind this has not been compared with the official page by a person. */
  provisional: boolean
  sourceUrl?: string
}

export type Verdict = 'not_ready' | 'almost_ready' | 'ready'

export interface ChecklistItem {
  id: string
  label: string
  status: 'have' | 'missing'
  severity: Severity
  /** The document that satisfied it. */
  via?: DocTypeId
  /** Plain-language list of what is accepted. */
  accepted: string
  help?: string
  provisional: boolean
}

export interface Report {
  verdict: Verdict
  issues: Issue[]
  checklist: ChecklistItem[]
  carry: string[]
  notes: string[]
  /** Age on the appointment date; null when the date of birth could not be read. */
  age: number | null
  asOf: string
}

const WHY: Record<Severity, string> = {
  blocker: 'Counters commonly ask for this, and applications without it commonly run into problems.',
  warning: 'This commonly causes delays or extra questions at the counter.',
  info: 'Worth checking before you go.',
}

const SEVERITY_ORDER: Record<Severity, number> = { blocker: 0, warning: 1, info: 2 }

// ---------------------------------------------------------------- helpers

export function hasContent(doc: ProvidedDoc): boolean {
  const fields = DOCS[doc.type].fields
  if (fields.length === 0) return !!doc.present
  return fields.some((f) => doc.fields[f]?.trim())
}

interface Context {
  age: number | null
  dob: FullDate | null
  answers: Record<string, string>
}

export function holds(c: Condition | undefined, ctx: Context): boolean {
  if (!c) return true
  if (c.all && !c.all.every((x) => holds(x, ctx))) return false
  if (c.any && !c.any.some((x) => holds(x, ctx))) return false
  if (c.not && holds(c.not, ctx)) return false
  if (c.ageAtLeast !== undefined && !(ctx.age !== null && ctx.age >= c.ageAtLeast)) return false
  if (c.ageBelow !== undefined && !(ctx.age !== null && ctx.age < c.ageBelow)) return false
  if (c.bornOnOrAfter !== undefined) {
    const lim = parseFullDate(c.bornOnOrAfter)
    if (!lim || !ctx.dob || compareFull(ctx.dob, lim) < 0) return false
  }
  if (c.bornBefore !== undefined) {
    const lim = parseFullDate(c.bornBefore)
    if (!lim || !ctx.dob || compareFull(ctx.dob, lim) >= 0) return false
  }
  if (c.answer) {
    const v = ctx.answers[c.answer.id]
    const ok = Array.isArray(c.answer.is) ? v !== undefined && c.answer.is.includes(v) : v === c.answer.is
    if (!ok) return false
  }
  return true
}

// Lower-case the first letter for use mid-sentence, except proper nouns and form names ("your Aadhaar", "PAN card", "Form 1").
const KEEP_CASE = /^(Aadhaar|PAN\b|PUC|LIC|EPIC|Voter ID|Form \d|Annexure|Employer certificate on letterhead)/
const lowerFirst = (s: string) => (KEEP_CASE.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1))

function acceptedText(anyOf: Acceptable[]): string {
  return anyOf
    .map((a) => docLabel(a.doc) + (a.exactDob ? ' (must show the full date of birth)' : '') + (a.minAge ? ` (age ${a.minAge} or over)` : ''))
    .join('; ')
}

function fill(text: string, params: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`))
}

// ---------------------------------------------------------------- the check

export function checkDocuments(input: CheckInput): Report {
  const { service, answers } = input
  const issues: Issue[] = []
  const provisionalOf = (p?: boolean) => p ?? service.status === 'provisional'
  // An unverified rule never carries a source link: pointing at an official page we did not read would look like a citation.
  const push = (i: Omit<Issue, 'provisional'> & { provisional?: boolean }) => {
    const provisional = provisionalOf(i.provisional)
    issues.push({ ...i, provisional, sourceUrl: provisional ? undefined : (i.sourceUrl ?? service.officialUrl) })
  }

  const asOfFull = parseFullDate(input.asOf) ?? today()
  const dob = parseFullDate(input.dob)
  const age = dob ? ageOn(dob, asOfFull) : null
  const ctx: Context = { age, dob, answers }
  const docs = input.docs.filter(hasContent)

  // ---- the applicant's own inputs
  if (!input.dob.trim()) {
    push({ id: 'dob_missing', kind: 'input', severity: 'blocker', title: 'Add your date of birth', found: 'No date of birth entered.', why: 'Age decides which documents and rules apply.', fix: 'Enter your full date of birth above.', provisional: false })
  } else if (!dob) {
    const partial = parseDate(input.dob)
    push({
      id: 'dob_unreadable',
      kind: 'input',
      severity: 'blocker',
      title: 'Check your date of birth',
      found: partial && !isFull(partial) ? 'Only a year was entered.' : 'The date of birth could not be read.',
      why: 'Age decides which documents and rules apply.',
      fix: 'Enter it as DD/MM/YYYY.',
      provisional: false,
    })
  } else if (compareFull(dob, asOfFull) > 0) {
    push({ id: 'dob_future', kind: 'input', severity: 'blocker', title: 'Check your date of birth', found: 'The date of birth is after the appointment date.', why: 'Age decides which documents and rules apply.', fix: 'Correct the date of birth or the appointment date.', provisional: false })
  }

  for (const q of service.questions) {
    if (!answers[q.id]) {
      push({ id: `unanswered:${q.id}`, kind: 'input', severity: 'blocker', title: 'Answer a question', found: q.label, why: 'The answer decides which documents apply to you.', fix: 'Choose an answer above.', provisional: false })
    }
  }

  // ---- eligibility (age limits and similar)
  for (const rule of service.eligibility) {
    if (holds(rule.violatedWhen, ctx)) {
      push({ id: `eligibility:${rule.id}`, kind: 'eligibility', severity: rule.severity, title: 'Eligibility', found: rule.found, why: rule.why, fix: rule.fix, provisional: rule.provisional, sourceUrl: rule.sourceUrl })
    }
  }

  // ---- required documents
  const checklist: ChecklistItem[] = []
  for (const req of service.requirements) {
    if (!holds(req.when, ctx)) continue
    const { have, nearMiss } = satisfy(req, docs, age)
    checklist.push({ id: req.id, label: req.label, status: have ? 'have' : 'missing', severity: req.severity, via: have?.type, accepted: acceptedText(req.anyOf), help: req.help, provisional: provisionalOf(req.provisional) })
    if (have) continue
    const notes = req.anyOf.filter((a) => a.note).map((a) => `${docLabel(a.doc)}: ${a.note}`)
    push({
      id: `missing:${req.id}`,
      kind: 'missing',
      severity: req.severity,
      title: `Missing: ${lowerFirst(req.label)}`,
      found: nearMiss.length ? nearMiss.join(' ') : `No ${lowerFirst(req.label)} has been added.`,
      why: req.why ?? WHY[req.severity],
      fix: `${req.anyOf.length === 1 ? 'Bring' : 'Bring one of'}: ${acceptedText(req.anyOf)}.${notes.length ? ` ${notes.join(' ')}` : ''}`,
      provisional: req.provisional,
      sourceUrl: req.sourceUrl,
    })
  }

  // ---- per-document checks: unreadable dates, number format, expiry
  const windowed = new Set(service.dateWindows.filter((w) => w.field === 'expiryDate').map((w) => w.doc))
  for (const d of docs) {
    const def = DOCS[d.type]
    for (const f of ['dob', 'issueDate', 'expiryDate'] as const) {
      const v = d.fields[f]?.trim()
      if (v && !parseDate(v)) {
        push({ id: `date_unreadable:${d.id}:${f}`, kind: 'format', severity: 'warning', title: `Check the ${FIELD_LABELS[f].toLowerCase()} on your ${lowerFirst(def.label)}`, found: 'The date could not be read.', why: 'We cannot check timing or consistency without a readable date.', fix: 'Enter it as DD/MM/YYYY.', provisional: false })
      }
    }
    const num = d.fields.number?.trim()
    if (def.numberKind && num) {
      const r = validateNumber(def.numberKind, num)
      if (r.status !== 'valid') {
        push({
          id: `number:${d.id}`,
          kind: 'format',
          severity: r.status === 'invalid' ? 'warning' : 'info',
          title: `Check the number on your ${lowerFirst(def.label)}`,
          found: r.reason ?? 'The number does not look like the usual format.',
          why: 'A mistyped number on the application commonly causes a mismatch with the document.',
          fix: 'Compare with the document and retype it. If the document really shows this number, carry on.',
          provisional: false,
        })
      }
    }
    const exp = parseFullDate(d.fields.expiryDate)
    if (exp && !service.expiryExempt?.includes(d.type) && !windowed.has(d.type)) {
      const daysAgo = daysBetween(exp, asOfFull)
      if (daysAgo > 0) {
        push({ id: `expired:${d.id}`, kind: 'expiry', severity: 'blocker', title: `${def.label} has expired`, found: `It expired on ${formatDate(exp)}, before the appointment date.`, why: 'Expired documents are commonly not accepted as proof.', fix: 'Renew it first, or use another document that is still valid.', provisional: false })
      } else if (daysAgo >= -30) {
        push({ id: `expiring:${d.id}`, kind: 'expiry', severity: 'warning', title: `${def.label} expires soon`, found: `It is valid until ${formatDate(exp)}, within 30 days of the appointment.`, why: 'A document that lapses around the appointment date can cause trouble if the process takes longer than expected.', fix: 'Consider renewing it first.', provisional: false })
      }
    }
  }

  // ---- timing windows (learner's licence waiting period, renewal windows)
  for (const w of service.dateWindows) {
    for (const d of docs.filter((x) => x.type === w.doc)) {
      const raw = d.fields[w.field]?.trim()
      const date = parseFullDate(raw)
      if (!date) {
        if (!raw) push({ id: `window_missing:${w.id}:${d.id}`, kind: 'timing', severity: 'warning', title: `Add the ${FIELD_LABELS[w.field].toLowerCase()} of your ${lowerFirst(docLabel(w.doc))}`, found: 'This date is needed to check timing.', why: 'Some steps have a minimum or maximum time since this date.', fix: 'Enter the date printed on the document.', provisional: false })
        continue
      }
      const daysAgo = daysBetween(date, asOfFull)
      const tooHigh = w.okMax !== undefined && daysAgo > w.okMax && (w.tooHighUpTo === undefined || daysAgo <= w.tooHighUpTo)
      const msg = w.okMin !== undefined && daysAgo < w.okMin ? w.tooLow : tooHigh ? w.tooHigh : undefined
      if (!msg) continue
      const params = { days: Math.abs(daysAgo), date: formatDate(date) }
      push({ id: `timing:${w.id}:${d.id}`, kind: 'timing', severity: w.severity, title: 'Timing', found: fill(msg.found, params), why: fill(msg.why, params), fix: fill(msg.fix, params), provisional: w.provisional, sourceUrl: w.sourceUrl })
    }
  }

  checkConsistency(docs, input.dob, push)

  issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
  const verdict: Verdict = issues.some((i) => i.severity === 'blocker') ? 'not_ready' : issues.some((i) => i.severity === 'warning') ? 'almost_ready' : 'ready'

  return {
    verdict,
    issues,
    checklist,
    carry: service.carry,
    notes: service.notes,
    age,
    asOf: formatDate(asOfFull),
  }
}

function satisfy(req: Requirement, docs: ProvidedDoc[], age: number | null): { have?: ProvidedDoc; nearMiss: string[] } {
  const nearMiss: string[] = []
  for (const acc of req.anyOf) {
    if (acc.minAge !== undefined && !(age !== null && age >= acc.minAge)) continue
    for (const d of docs.filter((x) => x.type === acc.doc)) {
      if (acc.exactDob && !parseFullDate(d.fields.dob)) {
        nearMiss.push(`Your ${lowerFirst(docLabel(d.type))} does not show a full date of birth, so it may not count here.`)
        continue
      }
      return { have: d, nearMiss }
    }
  }
  return { nearMiss }
}

// ---------------------------------------------------------------- consistency across documents

type Push = (i: Omit<Issue, 'provisional'> & { provisional?: boolean }) => void

const ADDRESS_ORDER: DocTypeId[] = ['aadhaar', 'utility_bill', 'rent_agreement', 'bank_passbook', 'employer_letter', 'voter_id', 'driving_licence']

function ranked(docs: ProvidedDoc[], field: FieldKey, order: DocTypeId[]): ProvidedDoc[] {
  const rank = (t: DocTypeId) => {
    const i = order.indexOf(t)
    return i < 0 ? order.length : i
  }
  return docs.filter((d) => d.fields[field]?.trim()).sort((a, b) => rank(a.type) - rank(b.type))
}

function checkConsistency(docs: ProvidedDoc[], applicantDob: string, push: Push) {
  const label = (d: ProvidedDoc) => lowerFirst(DOCS[d.type].label)

  // names
  const named = ranked(docs, 'name', REFERENCE_ORDER)
  const nameRef = named[0]
  for (const d of named.slice(1)) {
    if (!nameRef || d.type === nameRef.type) continue
    const m = compareNames(nameRef.fields.name!, d.fields.name!)
    if (m === 'exact') continue
    const id = `name:${nameRef.type}:${d.type}`
    const base = { id, kind: 'consistency' as const, provisional: false }
    if (m === 'different') {
      push({ ...base, severity: 'blocker', title: 'Names do not match', found: `The name on your ${label(nameRef)} and your ${label(d)} are different.`, why: 'A name that differs between documents commonly causes problems at verification.', fix: 'Use documents that show the same name, or ask the office which supporting paper (marriage certificate, gazette notification or affidavit) explains the difference.' })
    } else {
      const found: Record<string, string> = {
        reordered: 'The same names appear in a different order.',
        partial: 'One document includes a middle name that the other leaves out.',
        initials: 'One document uses initials where the other has full names.',
        fuzzy: 'The names are very close but not identical, which looks like a spelling difference.',
      }
      push({ ...base, severity: 'warning', title: 'Names are written differently', found: `Your ${label(nameRef)} and your ${label(d)}: ${found[m]}`, why: 'Small differences between documents commonly cause extra questions at the counter.', fix: 'Decide which spelling is correct and check the application matches the document you rely on. Carry a supporting paper if you can.' })
    }
  }

  // PAN: the 5th character is normally the first letter of the surname
  for (const d of docs.filter((x) => x.type === 'pan')) {
    const pan = d.fields.number?.replace(/\s/g, '').toUpperCase() ?? ''
    const name = d.fields.name?.trim()
    if (name && /^[A-Z]{3}P[A-Z]\d{4}[A-Z]$/.test(pan)) {
      const parts = name.toUpperCase().split(/\s+/).filter(Boolean)
      const letters = new Set([parts[parts.length - 1]?.[0], parts[0]?.[0]])
      if (!letters.has(pan[4])) {
        push({ id: `pan_surname:${d.id}`, kind: 'consistency', severity: 'info', title: 'PAN and name', found: "The PAN's 5th letter does not match the first letter of the name you typed.", why: 'It normally matches the surname. It can differ if the name changed after the PAN was issued.', fix: 'Check you typed the name exactly as printed on the PAN card.', provisional: false })
      }
    }
  }

  // date of birth against the applicant's own entry
  const applicant = parseDate(applicantDob)
  if (applicant) {
    for (const d of docs.filter((x) => x.fields.dob?.trim())) {
      const dd = parseDate(d.fields.dob)
      if (!dd) continue
      const differs = isFull(applicant) && isFull(dd) ? compareFull(applicant, dd) !== 0 : applicant.year !== dd.year
      if (differs) {
        push({ id: `dob:${d.id}`, kind: 'consistency', severity: 'blocker', title: 'Dates of birth do not match', found: `The date of birth on your ${label(d)} differs from the one you entered.`, why: 'A date of birth that differs between documents commonly causes problems at the counter and during verification.', fix: 'Check which date is correct. If a document is wrong, the office can say how to correct it before you book.', provisional: false })
      }
    }
  }

  // father's name
  const fathers = ranked(docs, 'fatherName', ['pan', 'birth_certificate', 'school_certificate'])
  const fRef = fathers[0]
  for (const d of fathers.slice(1)) {
    if (!fRef || d.type === fRef.type) continue
    const m = compareNames(fRef.fields.fatherName!, d.fields.fatherName!)
    if (m === 'exact') continue
    push({ id: `father:${fRef.type}:${d.type}`, kind: 'consistency', severity: m === 'different' ? 'warning' : 'info', title: "Father's name differs", found: `The father's name on your ${label(fRef)} and your ${label(d)} ${m === 'different' ? 'is different' : 'is written differently'}.`, why: "Parents' names are often cross-checked against the birth or school record.", fix: 'Check which spelling is correct.', provisional: false })
  }

  // address
  const addressed = ranked(docs, 'address', ADDRESS_ORDER)
  const aRef = addressed[0]
  for (const d of addressed.slice(1)) {
    if (!aRef || d.type === aRef.type) continue
    const m = compareAddresses(aRef.fields.address!, d.fields.address!)
    if (m === 'match') continue
    push({ id: `address:${aRef.type}:${d.type}`, kind: 'consistency', severity: m === 'different' ? 'warning' : 'info', title: 'Addresses differ', found: `The address on your ${label(aRef)} and your ${label(d)} ${m === 'different' ? 'looks different' : 'is not written the same way'}.`, why: 'It is fine if you have moved, as long as the proof you rely on shows your present address.', fix: 'Use the document that shows where you live now as your address proof.', provisional: false })
  }
}
