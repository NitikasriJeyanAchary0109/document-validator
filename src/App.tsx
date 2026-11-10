import { useEffect, useMemo, useRef, useState } from 'react'
import { today, toIso } from './core/dates'
import { checkDocuments, type ProvidedDoc } from './core/engine'
import { getService } from './rules'
import { DOCS } from './rules/documents'
import type { DocTypeId, FieldKey } from './rules/types'
import { Basics } from './ui/Basics'
import { Checklist } from './ui/Checklist'
import { DocCards } from './ui/DocCards'
import { Result } from './ui/Result'
import { ServicePicker } from './ui/ServicePicker'

let nextId = 1
const newId = () => `doc${nextId++}`

export function App() {
  const [serviceId, setServiceId] = useState<string | null>(null)
  const [dob, setDob] = useState('')
  const [asOf, setAsOf] = useState(() => toIso(today()))
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [docs, setDocs] = useState<ProvidedDoc[]>([])
  const [checked, setChecked] = useState(false)
  const resultRef = useRef<HTMLDivElement>(null)

  const service = serviceId ? getService(serviceId) : undefined
  const report = useMemo(() => (service ? checkDocuments({ service, dob, asOf, answers, docs }) : null), [service, dob, asOf, answers, docs])

  const added = useMemo(() => new Set(docs.map((d) => d.type)), [docs])
  const addable = useMemo<DocTypeId[]>(() => {
    if (!service || !report) return []
    const applicable = new Set(report.checklist.map((c) => c.id))
    const types = new Set<DocTypeId>()
    for (const r of service.requirements) if (applicable.has(r.id)) for (const a of r.anyOf) types.add(a.doc)
    return [...types].filter((t) => DOCS[t].fields.length > 0 || !added.has(t))
  }, [service, report, added])

  // Scroll to the result the first time it is shown.
  useEffect(() => {
    if (checked) resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [checked])

  function pickService(id: string) {
    setServiceId(id)
    setAnswers({})
    setChecked(false)
    window.scrollTo({ top: 0 })
  }

  function startOver() {
    setServiceId(null)
    setDob('')
    setAsOf(toIso(today()))
    setAnswers({})
    setDocs([])
    setChecked(false)
    window.scrollTo({ top: 0 })
  }

  function addDoc(type: DocTypeId) {
    const id = newId()
    const tickOnly = DOCS[type].fields.length === 0
    setDocs((d) => [...d, { id, type, fields: {}, present: tickOnly ? true : undefined }])
    if (!tickOnly) setTimeout(() => document.getElementById(`${id}-${DOCS[type].fields[0]}`)?.focus(), 0)
  }

  const setField = (id: string, field: FieldKey, value: string) => setDocs((ds) => ds.map((d) => (d.id === id ? { ...d, fields: { ...d.fields, [field]: value } } : d)))

  const missingBlockers = report?.checklist.filter((c) => c.status === 'missing' && c.severity === 'blocker').length ?? 0

  return (
    <>
      <header className="top">
        <div className="wrap top-in">
          <a className="brand" href="./" onClick={(e) => { e.preventDefault(); startOver() }}>
            <span className="brand-mark" aria-hidden="true">✓</span>
            <span>Ready for the counter</span>
          </a>
          <span className="pill" title="Nothing you type is uploaded, stored or logged">
            <span aria-hidden="true">🔒</span> Stays on your device
          </span>
        </div>
      </header>

      <main className="wrap" id="main">
        {!service && (
          <>
            <div className="hero">
              <h1>Check your papers before the appointment</h1>
              <p>For RTO and passport visits. Tell us what you are going in for, enter what your documents say, and we flag what commonly causes problems at the counter.</p>
            </div>
            <ServicePicker onPick={pickService} />
          </>
        )}

        {service && report && (
          <>
            <nav className="crumbs" aria-label="Progress">
              <button type="button" className="link-btn" onClick={() => { setServiceId(null); setChecked(false) }}>
                ← All services
              </button>
              <button type="button" className="link-btn" onClick={startOver}>
                Start over
              </button>
            </nav>
            <h1 className="service-h">{service.title}</h1>

            <Basics service={service} dob={dob} asOf={asOf} answers={answers} onDob={setDob} onAsOf={setAsOf} onAnswer={(id, v) => setAnswers((a) => ({ ...a, [id]: v }))} />
            <Checklist service={service} items={report.checklist} added={added} onAdd={addDoc} />
            <DocCards docs={docs} addable={addable} onAdd={addDoc} onRemove={(id) => setDocs((ds) => ds.filter((d) => d.id !== id))} onField={setField} />

            <div ref={resultRef} className="result-anchor">
              {checked ? (
                <Result service={service} report={report} />
              ) : (
                <div className="cta">
                  <p>
                    {missingBlockers > 0
                      ? `${missingBlockers} required item${missingBlockers === 1 ? '' : 's'} still not covered. You can check anyway.`
                      : 'Ready when you are.'}
                  </p>
                  <button type="button" className="btn btn-primary" onClick={() => setChecked(true)}>
                    Check my documents
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      <footer className="foot wrap">
        <p>
          An unofficial pre-check, not affiliated with any government department. It checks what you type against published rules, which change and differ by state and office. The officer at the counter makes the decision. Nothing is uploaded,
          stored or logged.
        </p>
      </footer>
    </>
  )
}
