import { useEffect, useMemo, useRef, useState } from 'react'
import { today, toIso } from './core/dates'
import { checkDocuments, type ProvidedDoc } from './core/engine'
import { getService } from './rules'
import { DOCS } from './rules/documents'
import type { DocTypeId, FieldKey } from './rules/types'
import { Basics } from './ui/Basics'
import { Checklist } from './ui/Checklist'
import { disposeOcr, readFields } from './ocr/read'
import { DocCards, type ScanState } from './ui/DocCards'
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
  const [scans, setScans] = useState<Record<string, ScanState | undefined>>({})
  const resultRef = useRef<HTMLDivElement>(null)

  const service = serviceId ? getService(serviceId) : undefined
  const report = useMemo(() => (service ? checkDocuments({ service, dob, asOf, answers, docs }) : null), [service, dob, asOf, answers, docs])

  const added = useMemo(() => new Set(docs.map((d) => d.type)), [docs])
  // Scroll to the result the first time it is shown.
  useEffect(() => {
    if (checked) resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [checked])

  // Free the OCR engine's memory when the page goes away.
  useEffect(() => () => void disposeOcr(), [])

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
    setScans({})
    setChecked(false)
    window.scrollTo({ top: 0 })
  }

  function addDoc(type: DocTypeId) {
    const id = newId()
    const tickOnly = DOCS[type].fields.length === 0
    setDocs((d) => [...d, { id, type, fields: {}, present: tickOnly ? true : undefined }])
    if (!tickOnly) setTimeout(() => document.getElementById(`${id}-${DOCS[type].fields[0]}`)?.focus(), 0)
  }

  const setField = (id: string, field: FieldKey, value: string) => {
    setDocs((ds) => ds.map((d) => (d.id === id ? { ...d, fields: { ...d.fields, [field]: value } } : d)))
    // Once the person has looked at a field and changed it, it no longer needs the "check this" mark.
    setScans((s) => {
      const cur = s[id]
      return cur?.status === 'done' && cur.check.includes(field) ? { ...s, [id]: { ...cur, check: cur.check.filter((f) => f !== field) } } : s
    })
  }

  async function scanDoc(id: string, file: File) {
    const type = docs.find((d) => d.id === id)?.type
    if (!type) return
    setScans((s) => ({ ...s, [id]: { status: 'reading', progress: 0 } }))
    try {
      const { fields, check } = await readFields(type, file, (progress) => setScans((s) => (s[id]?.status === 'reading' ? { ...s, [id]: { status: 'reading', progress } } : s)))
      const found = Object.keys(fields).length
      if (found === 0) {
        setScans((s) => ({ ...s, [id]: { status: 'empty' } }))
        return
      }
      setDocs((ds) => ds.map((d) => (d.id === id ? { ...d, fields: { ...d.fields, ...fields } } : d)))
      setScans((s) => ({ ...s, [id]: { status: 'done', found, check } }))
    } catch {
      setScans((s) => ({ ...s, [id]: { status: 'error' } }))
    }
  }

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
        {!service && <ServicePicker onPick={pickService} />}

        {service && report && (
          <>
            <nav className="crumbs" aria-label="Back">
              <button type="button" className="link-btn" onClick={startOver}>
                ← All services
              </button>
            </nav>
            <h1 className="service-h">{service.title}</h1>
            {service.status === 'provisional' && <p className="hint">Some of these rules are still being verified.</p>}

            <Basics service={service} dob={dob} asOf={asOf} todayIso={toIso(today())} answers={answers} onDob={setDob} onAsOf={setAsOf} onAnswer={(id, v) => setAnswers((a) => ({ ...a, [id]: v }))} />
            <Checklist service={service} items={report.checklist} added={added} onAdd={addDoc} />
            <DocCards docs={docs} onRemove={(id) => setDocs((ds) => ds.filter((d) => d.id !== id))} onField={setField} onScan={scanDoc} scans={scans} />

            <div ref={resultRef} className="result-anchor">
              {checked ? (
                <Result service={service} report={report} />
              ) : (
                <div className="cta">
                  <button type="button" className="btn btn-primary" onClick={() => setChecked(true)}>
                    Check my documents
                  </button>
                  {missingBlockers > 0 && <p className="hint">{missingBlockers} still to add. You can check anyway.</p>}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      <footer className="foot wrap">
        <p>An unofficial pre-check, not affiliated with any government department. The office makes the decision.</p>
      </footer>
    </>
  )
}
