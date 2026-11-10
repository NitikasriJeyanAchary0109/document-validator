import { parseDate } from '../core/dates'
import type { Service } from '../rules/types'

interface Props {
  service: Service
  dob: string
  asOf: string
  answers: Record<string, string>
  onDob: (v: string) => void
  onAsOf: (v: string) => void
  onAnswer: (id: string, value: string) => void
}

export function Basics({ service, dob, asOf, answers, onDob, onAsOf, onAnswer }: Props) {
  const dobBad = dob.trim() !== '' && !parseDate(dob)
  return (
    <section aria-labelledby="basics-h" className="panel">
      <h2 id="basics-h">About you</h2>
      <div className="row">
        <label className="field">
          <span className="label">Your date of birth</span>
          <input value={dob} onChange={(e) => onDob(e.target.value)} placeholder="DD/MM/YYYY" inputMode="numeric" autoComplete="off" aria-invalid={dobBad} aria-describedby={dobBad ? 'dob-err' : undefined} />
          {dobBad && (
            <span id="dob-err" className="hint hint-bad">
              Enter it as DD/MM/YYYY.
            </span>
          )}
        </label>
        <label className="field">
          <span className="label">Appointment date</span>
          <input type="date" value={asOf} onChange={(e) => onAsOf(e.target.value)} />
          <span className="hint">Rules about age and waiting periods are checked on this day.</span>
        </label>
      </div>

      {service.questions.map((q) => (
        <fieldset key={q.id} className="question">
          <legend>{q.label}</legend>
          {q.help && <p className="hint">{q.help}</p>}
          <div className="options">
            {q.options.map((o) => (
              <label key={o.value} className={`option${answers[q.id] === o.value ? ' option-on' : ''}`}>
                <input type="radio" name={q.id} value={o.value} checked={answers[q.id] === o.value} onChange={() => onAnswer(q.id, o.value)} />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </section>
  )
}
