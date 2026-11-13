import { CATEGORY_LABELS, SERVICES } from '../rules'
import type { ServiceCategory } from '../rules/types'

export function ServicePicker({ onPick }: { onPick: (id: string) => void }) {
  const groups = (Object.keys(CATEGORY_LABELS) as ServiceCategory[]).map((c) => ({ category: c, services: SERVICES.filter((s) => s.category === c) }))
  return (
    <section aria-labelledby="pick-h">
      <h1 id="pick-h">What are you going in for?</h1>
      <p className="lede">Pick one. We will list what to bring and check what you have.</p>
      {groups.map((g) => {
        // One quiet note per group instead of a badge on every card.
        const unverified = g.services.every((s) => s.status !== 'verified')
        return (
          <div key={g.category} className="group">
            <h2 className="group-h">
              {CATEGORY_LABELS[g.category]}
              {unverified && <span className="group-note">rules still being verified</span>}
            </h2>
            <ul className="list" role="list">
              {g.services.map((s) => (
                <li key={s.id}>
                  <button type="button" className="list-btn" onClick={() => onPick(s.id)}>
                    <span className="list-text">
                      <span className="list-title">{s.title}</span>
                      <span className="list-sub">{s.summary}</span>
                    </span>
                    <span className="chev" aria-hidden="true">
                      ›
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </section>
  )
}
