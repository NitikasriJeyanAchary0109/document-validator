import { useState } from 'react'
import type { Issue, Report, Verdict } from '../core/engine'
import type { Service } from '../rules/types'
import { summaryText } from './summary'

const VERDICT: Record<Verdict, { title: string; sub: string; icon: string }> = {
  not_ready: { title: 'Not ready yet', sub: 'Sort these out before you book or go.', icon: '✕' },
  almost_ready: { title: 'Almost ready', sub: 'A few things are worth checking first.', icon: '!' },
  ready: { title: 'Looks ready', sub: 'Nothing stands out. The office still decides.', icon: '✓' },
}

export function Result({ service, report }: { service: Service; report: Report }) {
  const [copied, setCopied] = useState(false)
  const v = VERDICT[report.verdict]
  const todo = report.issues.filter((i) => i.severity !== 'info')
  const info = report.issues.filter((i) => i.severity === 'info')

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
        </div>
      </div>

      {service.status === 'provisional' && (
        <p className="banner">
          Some rules here are still unverified. Confirm the list on{' '}
          <a href={service.officialUrl} target="_blank" rel="noreferrer noopener">
            the official page
          </a>{' '}
          or with your RTO.
        </p>
      )}

      {todo.length > 0 && (
        <>
          <h3 className="block-h">To sort out</h3>
          <ul className="issues" role="list">
            {todo.map((i) => (
              <IssueCard key={i.id} issue={i} />
            ))}
          </ul>
        </>
      )}

      <h3 className="block-h">Bring on the day</h3>
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

      <div className="actions no-print">
        <button type="button" className="btn btn-ghost" onClick={copy}>
          {copied ? 'Copied' : 'Copy checklist'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => window.print()}>
          Print
        </button>
      </div>

      {(info.length > 0 || report.notes.length > 0) && (
        <details className="more more-end">
          <summary>
            Good to know{info.length > 0 ? ` (${info.length})` : ''}
          </summary>
          {info.length > 0 && (
            <ul className="issues" role="list">
              {info.map((i) => (
                <IssueCard key={i.id} issue={i} />
              ))}
            </ul>
          )}
          <ul className="notes-list">
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
      )}
    </section>
  )
}

/** What to do comes first; what was found, why, and the source are one tap away. */
function IssueCard({ issue }: { issue: Issue }) {
  return (
    <li className={`issue issue-${issue.severity}`}>
      <h4>
        {issue.title}
        {issue.provisional && <span className="soft"> · unverified</span>}
      </h4>
      <p className="issue-fix">{issue.fix}</p>
      <details className="more">
        <summary>Why</summary>
        <p>
          <strong>Found:</strong> {issue.found}
        </p>
        <p>
          <strong>Why it matters:</strong> {issue.why}
        </p>
        {issue.provisional ? (
          <p className="soft">Source not yet confirmed on a government site.</p>
        ) : (
          issue.sourceUrl && (
            <p>
              <a href={issue.sourceUrl} target="_blank" rel="noreferrer noopener">
                Source: official government page
              </a>
            </p>
          )
        )}
      </details>
    </li>
  )
}
