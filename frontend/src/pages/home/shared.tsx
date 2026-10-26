// Pieces every home screen shares: a numbered section, the six figures from the problem statement as one compact strip,
// and a single line about how fresh the data is.
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { Info } from 'lucide-react'
import { CountUp } from '../../hooks/useCountUp'
import type { api } from '../../lib/api'
import { plural } from '../../lib/text'

export type Summary = Awaited<ReturnType<typeof api.summary>>

/** A numbered, titled block. The count says how many rows are in it, and the hint says what to do with them. */
export function Section({ n, title, hint, count, tone, children, action }: { n: number; title: string; hint: string; count?: number; tone?: 'red' | 'amber'; children: ReactNode; action?: ReactNode }) {
  return (
    <section aria-labelledby={`sec-${n}`} className="rounded-panel border border-line bg-surface shadow-card">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b border-line px-5 py-3">
        <div>
          <h2 id={`sec-${n}`} className="flex items-baseline gap-2 font-display text-17 font-semibold text-ink-950">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-800 text-13 text-white" aria-hidden>{n}</span>{title}
            {count !== undefined && <span className={clsx('font-mono text-15', tone === 'red' && count > 0 ? 'text-tape' : tone === 'amber' && count > 0 ? 'text-turmeric' : 'text-muted')}>({count})</span>}
          </h2>
          <p className="ml-8 text-13 text-muted">{hint}</p>
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

export const Th = ({ children, className }: { children?: ReactNode; className?: string }) => <th className={clsx('px-4 py-2 font-medium', className)}>{children}</th>
export const TableWrap = ({ children, min = 760 }: { children: ReactNode; min?: number }) => <div className="overflow-x-auto"><table className="w-full text-left text-13" style={{ minWidth: min }}>{children}</table></div>
export const Empty1 = ({ children }: { children: ReactNode }) => <p className="px-5 py-5 text-14 text-muted">{children}</p>

/** The figures the problem statement asks for, in one strip. They count all units, and the strip says so. */
export function PsStrip({ s }: { s: Summary }) {
  const c = s.cases
  const tiles: { label: string; value: number; to: string; tone?: string; note?: string }[] = [
    { label: 'Pending', value: c.pending, to: '/cases?lifecycle=pending' },
    { label: 'Under process', value: c.underProcess, to: '/cases?lifecycle=under_process' },
    { label: 'Transferred', value: c.transferred, to: '/cases?lifecycle=transferred', note: 'Counted apart from disposals' },
    { label: 'Escalated', value: c.escalated, to: '/cases?lifecycle=escalated', note: 'Sent to a higher authority' },
    { label: 'Disposed', value: c.disposed, to: '/cases?lifecycle=disposed', tone: 'text-good' },
    { label: 'Beyond limit', value: c.overdue, to: '/cases?deadline=overdue', tone: 'text-tape', note: 'Past the time limit' },
  ]
  return (
    <section aria-label="Case figures, all units" className="rounded-panel border border-line bg-surface px-5 py-3 shadow-card">
      <div className="mb-2 flex items-center justify-between text-12 text-muted"><span>All units · {plural(c.total, 'case')} on record</span><span>As of {new Date(s.asOf).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span></div>
      <ul className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((t) => (
          <li key={t.label}>
            <Link to={t.to} title={t.note} className="group block">
              <span className="text-12 text-muted group-hover:underline">{t.label}</span>
              <span className={clsx('block font-display text-24 font-semibold leading-tight', t.value && t.tone ? t.tone : 'text-ink-950')}><CountUp value={t.value} /></span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** One line instead of eleven pills: "All sources current" or "RB-SWR silent for 3 days". */
export function SourceLine({ s }: { s: Summary }) {
  const stale = s.sources.stale
  if (!stale.length) return <p className="flex items-center gap-2 text-13 text-muted"><Info size={14} aria-hidden />All {s.sources.total} sources sent data within the last day.</p>
  return (
    <p className="flex items-center gap-2 text-13 text-turmeric" role="status"><Info size={14} aria-hidden />
      {stale.map((x) => `${x.unit} silent for ${x.hoursAgo >= 48 ? plural(Math.floor(x.hoursAgo / 24), 'day') : `${x.hoursAgo} hours`}`).join('; ')}. Numbers from {stale.length === 1 ? 'that unit' : 'those units'} may be behind.
    </p>
  )
}
