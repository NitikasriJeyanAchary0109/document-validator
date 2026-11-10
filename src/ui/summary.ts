// Plain-text version of a report for copying. It lists what to bring and what to fix, by document type only:
// no names, numbers, dates of birth or addresses, so it is safe to paste into a chat.
import type { Report } from '../core/engine'
import type { Service } from '../rules/types'

const VERDICT_TEXT = { not_ready: 'Not ready yet', almost_ready: 'Almost ready', ready: 'Looks ready' } as const

export function summaryText(service: Service, report: Report): string {
  const lines: string[] = [`${service.title}: ${VERDICT_TEXT[report.verdict]}`, `Checked for ${report.asOf}. A pre-check only: the office decides.`, '']
  const fixes = report.issues.filter((i) => i.severity !== 'info')
  if (fixes.length) {
    lines.push('To sort out first:')
    for (const i of fixes) lines.push(`- ${i.title}. ${i.fix}`)
    lines.push('')
  }
  lines.push('Bring:')
  for (const c of report.checklist) lines.push(`${c.status === 'have' ? '[x]' : '[ ]'} ${c.label}`)
  for (const c of report.carry) lines.push(`[ ] ${c}`)
  if (service.status === 'provisional') {
    lines.push('', `Note: these rules are unverified. Confirm on ${service.officialUrl}`)
  }
  return lines.join('\n')
}
