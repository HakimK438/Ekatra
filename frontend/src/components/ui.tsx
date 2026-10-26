import clsx from 'clsx'
import { Link } from 'react-router-dom'
import { AlertCircle, Check, CornerUpRight, Lightbulb } from 'lucide-react'
import { CountUp } from '../hooks/useCountUp'
import { usePageStats, type PageKind, type PageStats } from '../hooks/usePageStats'
import type { ReactNode } from 'react'
import type { DeadlineInfo, Lifecycle, MatchState, RuleCode } from '../lib/types'
import { PROTOTYPE_LABEL } from '../lib/logic'
import { RULE_LABEL, STAGE_LABEL } from '../lib/labels'

/** A titled region: white card, hairline border, soft shadow. */
export function Panel({ title, note, children, className, action, bare }: { title?: ReactNode; note?: ReactNode; children: ReactNode; className?: string; action?: ReactNode; bare?: boolean }) {
  return (
    <section className={clsx(!bare && 'rounded-panel border border-line bg-surface shadow-card', className)} aria-label={typeof title === 'string' ? title : undefined}>
      {(title || action) && (
        <header className={clsx('flex flex-wrap items-end justify-between gap-x-4 gap-y-1', bare ? 'mb-3' : 'px-6 pb-1 pt-5')}>
          <div className="min-w-0">
            {title && <h2 className="font-display text-18 font-semibold leading-snug text-ink-950">{title}</h2>}
            {note && <p className="mt-0.5 text-13 text-muted">{note}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={clsx(!bare && 'px-6 pb-6 pt-4')}>{children}</div>
    </section>
  )
}
/** Negative margins that let a table inside a Panel run edge to edge. Keep in step with Panel's padding. */
export const PANEL_BLEED = '-mx-6 -mb-6'

export interface Stat { label: string; value: number | string; tone?: 'red' | 'amber' | 'green'; to?: string }
const STAT_TONE = { red: 'text-tape', amber: 'text-turmeric', green: 'text-good' } as const
const INSIGHT_TONE = {
  good: { box: 'border-good bg-good-soft/70', icon: 'text-good' },
  amber: { box: 'border-turmeric bg-turmeric-soft/70', icon: 'text-turmeric' },
  red: { box: 'border-tape bg-tape-soft/70', icon: 'text-tape' },
} as const

/**
 * Page head: icon tile, a plain title, one line saying what to do here, then (when the page has a kind) the four or so figures
 * that matter on this page and one sentence saying what they mean. The figures come from the same /summary as the dashboard.
 */
export function PageHead({ title, lead, icon, children, kind, stats, insight, insightTone = 'amber' }: {
  title: ReactNode; lead?: ReactNode; icon?: ReactNode; children?: ReactNode; kind?: PageKind
} & PageStats) {
  const ps = usePageStats(kind ?? 'none')
  const st = stats ?? ps.stats
  const note = insight ?? ps.insight
  const tone = INSIGHT_TONE[(insight ? insightTone : ps.insightTone) ?? 'amber']
  return (
    <header className="relative mb-7 overflow-hidden rounded-[22px] border border-line bg-surface shadow-card print:shadow-none">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-ink-700 via-ink-500 to-turmeric print:hidden" aria-hidden />
      <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-ink-100/80 blur-3xl print:hidden" aria-hidden />
      <div className="relative p-6 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex max-w-3xl items-start gap-4">
            {icon && <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-ink-700 to-ink-900 text-white shadow-md print:hidden" aria-hidden>{icon}</span>}
            <div>
              <h1 className="font-display text-30 font-semibold leading-[1.15] tracking-[-0.02em] text-ink-950 text-balance">{title}</h1>
              {lead && <p className="mt-1.5 text-15 leading-snug text-muted">{lead}</p>}
            </div>
          </div>
          {children}
        </div>
        {note && (
          <p className={clsx('mt-4 flex items-start gap-2.5 rounded-lg border-l-4 px-4 py-2.5 text-14 text-ink-950', tone.box)}>
            <Lightbulb size={17} className={clsx('mt-0.5 shrink-0', tone.icon)} aria-hidden />{note}
          </p>
        )}
        {!!st?.length && (
          <dl className={clsx('mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line', st.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-4')}>
            {st.map((x) => {
              const body = (
                <>
                  <dd className={clsx('font-display text-28 font-semibold leading-none', x.tone ? STAT_TONE[x.tone] : 'text-ink-950')}>{typeof x.value === 'number' ? <CountUp value={x.value} /> : x.value}</dd>
                  <dt className="mt-1.5 text-12 leading-tight text-muted">{x.label}</dt>
                </>
              )
              return x.to
                ? <Link key={x.label} to={x.to} className="block bg-surface px-4 py-3.5 transition hover:bg-ink-50">{body}</Link>
                : <div key={x.label} className="bg-surface px-4 py-3.5">{body}</div>
            })}
          </dl>
        )}
      </div>
    </header>
  )
}

/** Numbered step heading, used only where the content really is a sequence. */
export function Step({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-800 font-display text-13 font-semibold text-white" aria-hidden>{n}</span>
      <div><h3 className="font-display text-16 font-semibold text-ink-950">{title}</h3>{hint && <p className="text-13 text-muted">{hint}</p>}</div>
    </div>
  )
}

/** Tappable pill, the main way to filter and choose (replaces dropdowns where there are few options). */
export function Chip({ active, children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button type="button" aria-pressed={active} {...p}
      className={clsx('rounded-full border px-3.5 py-1.5 text-13 transition-colors disabled:opacity-50',
        active ? 'border-ink-700 bg-ink-700 font-medium text-white' : 'border-line bg-surface text-text hover:border-ink-500 hover:bg-ink-50')}>
      {children}
    </button>
  )
}

// ---------- Status: a small stage meter, because lifecycle is a sequence ----------
const STAGES: Lifecycle[] = ['received', 'under_examination', 'awaiting_party', 'inspection_hearing']
export function StatusBadge({ s }: { s: Lifecycle }) {
  const idx = STAGES.indexOf(s)
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-13 text-text">
      {idx >= 0 ? (
        <span className="flex gap-[2px]" aria-hidden>
          {STAGES.map((_, i) => <span key={i} className={clsx('h-2.5 w-1.5 rounded-[1px]', i <= idx ? 'bg-ink-700' : 'bg-line')} />)}
        </span>
      ) : s === 'disposed' ? <Check size={13} className="text-good" aria-hidden />
        : s === 'transferred' ? <CornerUpRight size={13} className="text-muted" aria-hidden />
        : <span className="h-2.5 w-2.5 rotate-45 bg-turmeric" aria-hidden />}
      {STAGE_LABEL[s]}
    </span>
  )
}

export function DeadlineBadge({ d, long }: { d: DeadlineInfo; long?: boolean }) {
  if (d.state === 'closed') return <span className="text-13 text-muted">Closed</span>
  const text = d.state === 'overdue' ? `${-d.daysToDue} day${d.daysToDue === -1 ? '' : 's'} overdue` : d.daysToDue === 0 ? 'Due today' : `${d.daysToDue} day${d.daysToDue === 1 ? '' : 's'} left`
  return (
    <span
      title={d.verified ? d.basis : PROTOTYPE_LABEL}
      className={clsx(
        'inline-flex items-center whitespace-nowrap rounded-chip px-1.5 py-0.5 text-13',
        d.state === 'overdue' && 'bg-tape-soft font-semibold text-tape',
        d.state === 'approaching' && 'bg-turmeric-soft font-medium text-turmeric',
        d.state === 'on_track' && 'text-text',
      )}
    >
      <span className={clsx(!d.verified && 'underline decoration-dotted decoration-1 underline-offset-[3px]')}>{text}</span>
      {!d.verified && <span className="sr-only"> (prototype timeline, not AICTE-approved)</span>}
      {long && <span className="ml-1 font-normal text-muted">of {d.days}</span>}
    </span>
  )
}

export function MatchBadge({ s, method }: { s: MatchState; method?: string }) {
  const label = s === 'resolved_auto' ? (method === 'T2_crosswalk' ? 'Matched by alternate ID' : 'Matched by Permanent ID')
    : s === 'resolved_confirmed' ? 'Confirmed by a person'
    : s === 'pending_review' ? 'Needs a match' : 'Unmatched'
  const warn = s === 'pending_review' || s === 'unresolved'
  return <span className={clsx('whitespace-nowrap text-13', warn ? 'font-medium text-turmeric' : 'text-muted')}>{label}</span>
}

export const SeverityMark = ({ s }: { s: 'High' | 'Medium' }) => (
  <span className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-12 font-semibold', s === 'High' ? 'bg-tape-soft text-tape' : 'bg-turmeric-soft text-turmeric')}>
    <span className={clsx('h-1.5 w-1.5 rounded-full', s === 'High' ? 'bg-tape' : 'bg-turmeric')} aria-hidden />{s === 'High' ? 'High priority' : 'Medium priority'}
  </span>
)

/** Rule codes are secondary: a small mono tag with the full rule as a tooltip. */
export const RuleTag = ({ code }: { code: RuleCode }) => (
  <span title={RULE_LABEL[code].full} className="rounded-chip border border-line bg-paper px-1.5 py-0.5 font-mono text-12 font-medium text-muted">{code}</span>
)

export const Skeleton = ({ className }: { className?: string }) => <div className={clsx('skeleton', className)} aria-hidden />

export const Empty = ({ title, children }: { title: string; children?: ReactNode }) => (
  <div className="rounded-panel border border-dashed border-line bg-surface/60 px-6 py-10 text-center">
    <p className="font-display text-17 text-ink-950">{title}</p>
    {children && <div className="mt-1 text-13 text-muted">{children}</div>}
  </div>
)
export const ErrorBox = ({ error }: { error: unknown }) => (
  <div role="alert" className="flex items-start gap-2 rounded-panel border border-tape/30 bg-tape-soft px-3 py-2.5 text-13 text-tape">
    <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
    <span>{error instanceof Error ? error.message : 'Something went wrong. Reload the page and try again.'}</span>
  </div>
)

type Variant = 'primary' | 'secondary' | 'quiet'
export const btn = (variant: Variant = 'primary', className?: string) => clsx(
  'inline-flex items-center justify-center gap-1.5 rounded-full px-5 py-2.5 text-14 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45',
  variant === 'primary' && 'bg-ink-700 text-white hover:bg-ink-900',
  variant === 'secondary' && 'border border-ink-500 bg-surface text-ink-800 hover:bg-ink-50',
  variant === 'quiet' && 'text-ink-700 hover:bg-ink-50',
  className,
)
export function Button({ variant = 'primary', className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button {...p} className={btn(variant, className)} />
}

export const fmtDate = (s: string) => new Date(s.length === 10 ? s + 'T00:00:00' : s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
export const fmtShort = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
