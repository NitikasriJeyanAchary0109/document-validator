import { parseDate } from '../core/dates'
import type { ProvidedDoc } from '../core/engine'
import { validateNumber } from '../core/validators'
import { DOCS, FIELD_LABELS, FIELD_PLACEHOLDERS, docLabel } from '../rules/documents'
import type { DocTypeId, FieldKey } from '../rules/types'

interface Props {
  docs: ProvidedDoc[]
  /** Types that can be added for this service, for the "add another" menu. */
  addable: DocTypeId[]
  onAdd: (type: DocTypeId) => void
  onRemove: (id: string) => void
  onField: (id: string, field: FieldKey, value: string) => void
}

const DATE_FIELDS: FieldKey[] = ['dob', 'issueDate', 'expiryDate']

export function DocCards({ docs, addable, onAdd, onRemove, onField }: Props) {
  return (
    <section aria-labelledby="docs-h" className="panel">
      <h2 id="docs-h">Your documents</h2>
      <p className="hint">Type what is printed on each document. This stays in this tab: nothing is saved or sent anywhere.</p>
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
              <div className="grid">
                {DOCS[d.type].fields.map((f) => (
                  <FieldInput key={f} doc={d} field={f} onChange={(v) => onField(d.id, f, v)} />
                ))}
              </div>
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

function FieldInput({ doc, field, onChange }: { doc: ProvidedDoc; field: FieldKey; onChange: (v: string) => void }) {
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
