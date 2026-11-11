import { parseDate } from '../core/dates'
import type { ProvidedDoc } from '../core/engine'
import { validateNumber } from '../core/validators'
import { DOCS, FIELD_LABELS, FIELD_PLACEHOLDERS, docLabel } from '../rules/documents'
import type { DocTypeId, FieldKey } from '../rules/types'

export type ScanState =
  | { status: 'reading'; progress: number }
  | { status: 'done'; found: number; check: FieldKey[] }
  | { status: 'empty' }
  | { status: 'error' }

interface Props {
  docs: ProvidedDoc[]
  /** Types that can be added for this service, for the "add another" menu. */
  addable: DocTypeId[]
  onAdd: (type: DocTypeId) => void
  onRemove: (id: string) => void
  onField: (id: string, field: FieldKey, value: string) => void
  /** Read this document's fields from a photo, on this device. */
  onScan: (id: string, file: File) => void
  scans: Record<string, ScanState | undefined>
}

const DATE_FIELDS: FieldKey[] = ['dob', 'issueDate', 'expiryDate']

export function DocCards({ docs, addable, onAdd, onRemove, onField, onScan, scans }: Props) {
  return (
    <section aria-labelledby="docs-h" className="panel">
      <h2 id="docs-h">Your documents</h2>
      <p className="hint">Type what is printed on each document, or read it from a photo. Photos are read on this device and thrown away: nothing is saved or sent anywhere.</p>
      {docs.length === 0 && <p className="empty">No documents added yet. Use the buttons in the list above, or the menu below.</p>}
      <ul className="docs" role="list">
        {docs.map((d) => (
          <li key={d.id} className="doc" id={`doc-${d.id}`}>
            <div className="doc-head">
              <h3>{docLabel(d.type)}</h3>
              <button type="button" className="link-btn" onClick={() => onRemove(d.id)} aria-label={`Remove ${docLabel(d.type)}`}>
                Remove
              </button>
            </div>
            {DOCS[d.type].hint && <p className="hint">{DOCS[d.type].hint}</p>}
            {DOCS[d.type].fields.length === 0 ? (
              <p className="tick">✓ You have this.</p>
            ) : (
              <>
                <ScanBar doc={d} state={scans[d.id]} onScan={onScan} />
                <div className="grid">
                  {DOCS[d.type].fields.map((f) => (
                    <FieldInput key={f} doc={d} field={f} onChange={(v) => onField(d.id, f, v)} recheck={scans[d.id]?.status === 'done' && (scans[d.id] as Extract<ScanState, { status: 'done' }>).check.includes(f)} />
                  ))}
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      {addable.length > 0 && (
        <label className="field add">
          <span className="label">Add another document</span>
          <select value="" onChange={(e) => e.target.value && onAdd(e.target.value as DocTypeId)}>
            <option value="">Choose a document…</option>
            {addable.map((t) => (
              <option key={t} value={t}>
                {docLabel(t)}
              </option>
            ))}
          </select>
        </label>
      )}
    </section>
  )
}

function ScanBar({ doc, state, onScan }: { doc: ProvidedDoc; state: ScanState | undefined; onScan: (id: string, file: File) => void }) {
  const inputId = `${doc.id}-photo`
  const busy = state?.status === 'reading'
  return (
    <div className="scan">
      <label className={`btn btn-ghost scan-btn${busy ? ' is-busy' : ''}`} htmlFor={inputId}>
        {busy ? 'Reading…' : state ? 'Read another photo' : 'Read from a photo'}
      </label>
      <input
        id={inputId}
        className="sr-only"
        type="file"
        accept="image/*"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) onScan(doc.id, file)
        }}
      />
      <span className="scan-note" role="status" aria-live="polite">
        {state?.status === 'reading' && `Reading on this device… ${Math.round(state.progress * 100)}%`}
        {state?.status === 'done' && (state.check.length > 0 ? `Filled ${state.found} field${state.found === 1 ? '' : 's'}. Check the marked ones against your document.` : `Filled ${state.found} field${state.found === 1 ? '' : 's'}. Check each against your document.`)}
        {state?.status === 'empty' && 'Could not read anything useful. Try a flat, well-lit photo of the front, or type the details.'}
        {state?.status === 'error' && 'Could not read that photo. Try another, or type the details.'}
        {!state && 'Front of the document, flat and well lit.'}
      </span>
    </div>
  )
}

function FieldInput({ doc, field, onChange, recheck }: { doc: ProvidedDoc; field: FieldKey; onChange: (v: string) => void; recheck: boolean }) {
  const def = DOCS[doc.type]
  const value = doc.fields[field] ?? ''
  const label = field === 'number' ? (def.numberLabel ?? 'Number') : FIELD_LABELS[field]
  const inputId = `${doc.id}-${field}`
  let hint: { text: string; bad: boolean } | null = null
  if (value.trim()) {
    if (field === 'number' && def.numberKind) {
      const r = validateNumber(def.numberKind, value)
      hint = r.status === 'valid' ? { text: 'Looks like the right format.', bad: false } : { text: r.reason ?? 'Check this number.', bad: true }
    } else if (DATE_FIELDS.includes(field) && !parseDate(value)) {
      hint = { text: 'Use DD/MM/YYYY.', bad: true }
    }
    if (!hint && recheck) hint = { text: 'Read from the photo and not certain. Check it against the document.', bad: true }
  }
  const wide = field === 'address' || field === 'name' || field === 'fatherName'
  return (
    <div className={`field${wide ? ' wide' : ''}`}>
      <label htmlFor={inputId} className="label">
        {label}
      </label>
      {field === 'address' ? (
        <textarea id={inputId} rows={2} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" />
      ) : (
        <input
          id={inputId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={FIELD_PLACEHOLDERS[field]}
          inputMode={DATE_FIELDS.includes(field) ? 'numeric' : undefined}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={hint?.bad || undefined}
          aria-describedby={hint ? `${inputId}-hint` : undefined}
        />
      )}
      {hint && (
        <span id={`${inputId}-hint`} className={`hint ${hint.bad ? 'hint-bad' : 'hint-ok'}`}>
          {hint.text}
        </span>
      )}
    </div>
  )
}
