// Evidence with a source tag, and the field-by-field comparison table (Same / Different / Not given).
import clsx from 'clsx'
import { Check, Minus, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { EVIDENCE_SOURCE_LABEL } from '../lib/labels'
import type { Evidence } from '../lib/types'
import type { Verdict } from '../lib/logic'

const SOURCE_TONE: Record<Evidence['source'], string> = {
  records: 'text-ink-900',
  id: 'text-ink-700',
  name: 'text-unit-other',
  timing: 'text-unit-ro',
  ref: 'text-unit-rb',
  person: 'text-good',
}

export function EvidenceChip({ e }: { e: Evidence }) {
  return (
    <span className="inline-flex max-w-full items-baseline gap-1.5 rounded-chip border border-line bg-paper px-2 py-1 text-13 leading-snug text-text">
      <span className={clsx('shrink-0 text-11 font-semibold', SOURCE_TONE[e.source])}>{EVIDENCE_SOURCE_LABEL[e.source]}</span>
      <span className="min-w-0">{e.text}</span>
    </span>
  )
}

export const EvidenceList = ({ items }: { items: Evidence[] }) => (
  <ul className="flex flex-wrap gap-1.5">{items.map((e, i) => <li key={i} className="max-w-full"><EvidenceChip e={e} /></li>)}</ul>
)

const VERDICT: Record<Verdict, { label: string; icon: typeof Check; cls: string }> = {
  same: { label: 'Same', icon: Check, cls: 'text-good' },
  similar: { label: 'Similar', icon: Minus, cls: 'text-turmeric' },
  different: { label: 'Different', icon: X, cls: 'text-tape' },
  not_given: { label: 'Not given', icon: Minus, cls: 'text-muted' },
}

export const VerdictMark = ({ v }: { v: Verdict }) => {
  const m = VERDICT[v]
  return <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap text-12 font-semibold', m.cls)}><m.icon size={13} strokeWidth={2.5} aria-hidden />{m.label}</span>
}

export interface CompareRow { label: string; cells: ReactNode[]; verdict?: Verdict }

/**
 * Side-by-side comparison. One column per item, plus a verdict column when the rows carry one.
 * "Not given" never counts as "Same".
 */
export function CompareTable({ heads, rows, caption }: { heads: ReactNode[]; rows: CompareRow[]; caption: string }) {
  const withVerdict = rows.some((r) => r.verdict)
  return (
    <table className="w-full min-w-[640px] table-fixed text-left text-14">
      <caption className="sr-only">{caption}</caption>
      <colgroup><col className="w-[150px]" />{heads.map((_, i) => <col key={i} />)}{withVerdict && <col className="w-[110px]" />}</colgroup>
      <thead>
        <tr className="border-b border-line">
          <td />
          {heads.map((h, i) => <th key={i} scope="col" className="px-4 py-3 align-bottom">{h}</th>)}
          {withVerdict && <th scope="col" className="px-4 py-3 align-bottom text-12 font-medium text-muted">Check</th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((r) => (
          <tr key={r.label} className={clsx(r.verdict === 'same' && 'bg-good-soft/40')}>
            <th scope="row" className="px-6 py-2.5 align-top text-12 font-medium text-muted">{r.label}</th>
            {r.cells.map((c, i) => <td key={i} className="px-4 py-2.5 align-top">{c}</td>)}
            {withVerdict && <td className="px-4 py-2.5 align-top">{r.verdict && <VerdictMark v={r.verdict} />}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
