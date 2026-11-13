import type { ChecklistItem } from '../core/engine'
import { docLabel } from '../rules/documents'
import type { DocTypeId, Service } from '../rules/types'

interface Props {
  service: Service
  items: ChecklistItem[]
  /** Types already added, so a document is not offered twice. */
  added: Set<DocTypeId>
  onAdd: (type: DocTypeId) => void
}

/** What to bring: one row per requirement, with a single menu of the documents that count for it. */
export function Checklist({ service, items, added, onAdd }: Props) {
  const have = items.filter((i) => i.status === 'have').length
  return (
    <section aria-labelledby="need-h" className="block">
      <div className="block-head">
        <h2 id="need-h" className="block-h">
          What to bring
        </h2>
        {items.length > 0 && (
          <span className="count" aria-live="polite">
            {have} of {items.length} covered
          </span>
        )}
      </div>
      {items.length === 0 && <p className="hint">Answer the questions above and the list appears here.</p>}
      <ul className="rows" role="list">
        {items.map((item) => {
          const req = service.requirements.find((r) => r.id === item.id)
          const missing = item.status === 'missing'
          const notes = req?.anyOf.filter((a) => a.note) ?? []
          return (
            <li key={item.id} className={`need need-${item.status}`}>
              <div className="need-main">
                <span className={`mark mark-${item.status}`} aria-hidden="true">
                  {item.status === 'have' ? '✓' : ''}
                </span>
                <div className="need-text">
                  <div className="need-title">
                    {item.label}
                    {item.severity !== 'blocker' && <span className="soft"> · {item.severity === 'warning' ? 'often asked' : 'optional'}</span>}
                  </div>
                  {item.status === 'have' && item.via && <div className="need-sub">Using your {docLabel(item.via)}</div>}
                  {missing && item.help && <div className="need-sub">{item.help}</div>}
                </div>
              </div>
              {missing && req && (
                <>
                  <label className="add-menu">
                    <span className="sr-only">Add a document for {item.label}</span>
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) onAdd(e.target.value as DocTypeId)
                      }}
                    >
                      <option value="">Add a document…</option>
                      {req.anyOf.map((a) => (
                        <option key={a.doc} value={a.doc} disabled={added.has(a.doc) && !a.exactDob}>
                          {docLabel(a.doc)}
                          {added.has(a.doc) && !a.exactDob ? ' (added)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  {notes.length > 0 && (
                    <details className="more">
                      <summary>Conditions</summary>
                      <ul>
                        {notes.map((a) => (
                          <li key={a.doc}>
                            <strong>{docLabel(a.doc)}:</strong> {a.note}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
