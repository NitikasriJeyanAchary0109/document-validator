import { useState } from 'react'
import type { Issue, Report, Verdict } from '../core/engine'
import type { Service, Severity } from '../rules/types'
import { summaryText } from './summary'

const VERDICT: Record<Verdict, { title: string; sub: string; icon: string }> = {
  not_ready: { title: 'Not ready yet', sub: 'Some things commonly cause problems at the counter. Sort these out before you book or go.', icon: '✕' },
  almost_ready: { title: 'Almost ready', sub: 'Nothing is missing outright, but a few things are worth checking first.', icon: '!' },
  ready: { title: 'Looks ready', sub: 'Based on what you entered, nothing stands out. The office still decides.', icon: '✓' },
}

const SEVERITY_LABEL: Record<Severity, string> = { blocker: 'Fix before you go', warning: 'Worth checking', info: 'For information' }

export function Result({ service, report }: { service: Service; report: Report }) {
  const [copied, setCopied] = useState(false)
  const v = VERDICT[report.verdict]
  const counts = (['blocker', 'warning', 'info'] as Severity[]).map((s) => ({ s, n: report.issues.filter((i) => i.severity === s).length }))

  async function copy() {
    try {
      await navigator.clipboard.writeText(summaryText(service, report))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section id="result" aria-labelledby="result-h" className="result">
      <div className={`verdict verdict-${report.verdict}`} role="status" aria-live="polite">
        <span className="verdict-icon" aria-hidden="true">
          {v.icon}
        </span>
        <div>
          <h2 id="result-h">{v.title}</h2>
          <p>{v.sub}</p>
          <p className="verdict-meta">
            {service.title} · checked for {report.asOf}
            {report.age !== null && ` · age ${report.age} on that day`}
          </p>
        </div>
      </div>

      {service.status === 'provisional' && (
        <div className="banner banner-warn">
          <strong>Some of these rules are not yet verified.</strong> Items marked unverified could not be confirmed on a government site, so use this to prepare, then confirm the list on{' '}
          <a href={service.officialUrl} target="_blank" rel="noreferrer noopener">
            the official page
          </a>{' '}
          or with your RTO.
        </div>
      )}

      <div className="actions no-print">
        <button type="button" className="btn" onClick={copy}>
          {copied ? 'Copied' : 'Copy checklist'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => window.print()}>
          Print
        </button>
      </div>

      <h3 className="sec-h">
        What to fix{' '}
        <span className="count">
          {counts.map((c) => (c.n ? `${c.n} ${c.s === 'blocker' ? 'to fix' : c.s === 'warning' ? 'to check' : 'to note'}` : null)).filter(Boolean).join(' · ') || 'nothing found'}
        </span>
      </h3>
      {report.issues.length === 0 && <p className="empty">No problems found with what you entered.</p>}
      <ul className="issues" role="list">
        {report.issues.map((i) => (
          <IssueCard key={i.id} issue={i} />
        ))}
      </ul>

      <h3 className="sec-h">Bring on the day</h3>
      <ul className="bring" role="list">
        {report.checklist.map((c) => (
          <li key={c.id} className={c.status === 'have' ? 'have' : 'missing'}>
            <span aria-hidden="true">{c.status === 'have' ? '☑' : '☐'}</span> <span className="sr-only">{c.status === 'have' ? 'Have: ' : 'Still needed: '}</span>
            {c.label}
          </li>
        ))}
        {report.carry.map((line) => (
          <li key={line}>
            <span aria-hidden="true">☐</span> {line}
          </li>
        ))}
      </ul>

      <details className="notes">
        <summary>What this check does not cover</summary>
        <ul>
          {report.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
          <li>
            Source: {service.sourceNote}{' '}
            <a href={service.officialUrl} target="_blank" rel="noreferrer noopener">
              Official page
            </a>
            . Rules last collected {service.retrieved}.
          </li>
        </ul>
      </details>
    </section>
  )
}

function IssueCard({ issue }: { issue: Issue }) {
  return (
    <li className={`issue issue-${issue.severity}`}>
      <div className="issue-top">
        <span className={`sev sev-${issue.severity}`}>{SEVERITY_LABEL[issue.severity]}</span>
        {issue.provisional && <span className="tag tag-warn">unverified rule</span>}
      </div>
      <h4>{issue.title}</h4>
      <dl>
        <dt>What we found</dt>
        <dd>{issue.found}</dd>
        <dt>Why it matters</dt>
        <dd>{issue.why}</dd>
        <dt>What to do</dt>
        <dd>{issue.fix}</dd>
      </dl>
      {issue.provisional ? (
        <p className="src">Source not yet confirmed on a government site.</p>
      ) : (
        issue.sourceUrl && (
          <a className="src" href={issue.sourceUrl} target="_blank" rel="noreferrer noopener">
            Source: official government page
          </a>
        )
      )}
    </li>
  )
}
