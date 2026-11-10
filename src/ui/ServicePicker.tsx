import { CATEGORY_LABELS, SERVICES } from '../rules'
import type { ServiceCategory } from '../rules/types'

export function ServicePicker({ onPick }: { onPick: (id: string) => void }) {
  const groups = (Object.keys(CATEGORY_LABELS) as ServiceCategory[]).map((c) => ({ category: c, services: SERVICES.filter((s) => s.category === c) }))
  return (
    <section aria-labelledby="pick-h">
      <h2 id="pick-h">What are you going in for?</h2>
      <p className="lede">Pick the service. We will list what to bring and check what you have against it, before you spend a morning in a queue.</p>
      {groups.map((g) => (
        <div key={g.category} className="group">
          <h3 className="group-h">{CATEGORY_LABELS[g.category]}</h3>
          <ul className="cards" role="list">
            {g.services.map((s) => (
              <li key={s.id}>
                <button type="button" className="card service-card" onClick={() => onPick(s.id)}>
                  <span className="card-title">{s.title}</span>
                  <span className="card-sub">{s.summary}</span>
                  <span className={`badge ${s.status === 'verified' ? 'badge-ok' : 'badge-warn'}`}>{s.status === 'verified' ? 'Rules checked against the official page' : 'Rules not yet verified'}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}
