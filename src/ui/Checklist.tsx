import type { ChecklistItem } from '../core/engine'
import { docLabel } from '../rules/documents'
import type { DocTypeId, Service } from '../rules/types'

interface Props {
  service: Service
  items: ChecklistItem[]
  /** Types already added, so the quick-add buttons say so. */
  added: Set<DocTypeId>
  onAdd: (type: DocTypeId) => void
}

export function Checklist({ service, items, added, onAdd }: Props) {
  const have = items.filter((i) => i.status === 'have').length
  return (
    <section aria-labelledby="need-h" className="panel">
      <div className="panel-head">
        <h2 id="need-h">What you will need</h2>
        <span className="count" aria-live="polite">
          {have} of {items.length} covered
        </span>
      </div>
      {items.length === 0 && <p className="hint">Answer the questions above and the list appears here.</p>}
      <ul className="checklist" role="list">
        {items.map((item) => {
          const req = service.requirements.find((r) => r.id === item.id)
          return (
            <li key={item.id} className={`check check-${item.status}`}>
              <div className="check-main">
                <span className={`mark mark-${item.status}`} aria-hidden="true">
                  {item.status === 'have' ? '✓' : item.severity === 'info' ? 'i' : '!'}
                </span>
                <div>
                  <div className="check-title">
                    {item.label}
                    {item.severity !== 'blocker' && <span className="tag">{item.severity === 'warning' ? 'often asked' : 'optional'}</span>}
                    {item.provisional && <span className="tag tag-warn">unverified</span>}
                  </div>
                  <div className="check-sub">
                    {item.status === 'have' && item.via ? `Covered by your ${docLabel(item.via).toLowerCase()}.` : `Accepted: ${item.accepted}.`}
                  </div>
                  {item.help && item.status === 'missing' && <div className="check-help">{item.help}</div>}
                </div>
              </div>
              {item.status === 'missing' && req && (
                <div className="quick" role="group" aria-label={`Add a document for ${item.label}`}>
                  {req.anyOf.map((a) => (
                    <button key={a.doc} type="button" className="chip" onClick={() => onAdd(a.doc)} disabled={added.has(a.doc) && !a.exactDob}>
                      {added.has(a.doc) ? '✓ ' : '+ '}
                      {docLabel(a.doc)}
                    </button>
                  ))}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
