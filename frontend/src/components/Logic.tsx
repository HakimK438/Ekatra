// Visuals that explain the logic behind a screen: a numbered "how this works" strip, a timeline of the letters
// different units sent one institution, before/after bars for a rule change, and a "closed, then came back" line.
import type { ReactNode } from 'react'
import { ChevronRight, type LucideIcon } from 'lucide-react'
import clsx from 'clsx'
import { UNIT_KIND_COLOR, unitKind } from '../lib/chartColors'
import type { RequestRow } from '../lib/workApi'
import { fmtShort } from './ui'

// ---------------------------------------------------------------- how this works
export interface LogicStep { icon: LucideIcon; title: string; text: ReactNode; tone?: 'auto' | 'person' | 'rule' }
const TONE = {
  auto: { ring: 'bg-ink-700 text-white', label: 'Automatic' },
  person: { ring: 'bg-turmeric text-white', label: 'A person decides' },
  rule: { ring: 'bg-good text-white', label: 'Rule' },
}

/** The steps a screen follows, in order, each marked automatic or done by a person. Folded away until opened,
 *  so the page starts with the work itself. */
export function LogicStrip({ title = 'How this works', steps, foot }: { title?: string; steps: LogicStep[]; foot?: ReactNode }) {
  return (
    <details className="group mb-6 rounded-[22px] border border-line bg-surface px-5 py-3 shadow-card open:pb-5">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 py-1">
        <span className="flex items-center gap-2 font-display text-15 font-semibold text-ink-950">
          <ChevronRight size={16} className="transition group-open:rotate-90" aria-hidden />{title}
          <span className="font-sans text-13 font-normal text-muted">({steps.length} steps)</span>
        </span>
        <span className="hidden gap-3 text-12 text-muted group-open:flex">{(['auto', 'person'] as const).map((t) => <span key={t} className="flex items-center gap-1.5"><span className={clsx('h-2.5 w-2.5 rounded-full', TONE[t].ring)} />{TONE[t].label}</span>)}</span>
      </summary>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(0,1fr))]">
        {steps.map((s, i) => (
          <li key={s.title} className="relative rounded-2xl bg-paper p-4">
            <div className="flex items-center gap-2.5">
              <span className={clsx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', TONE[s.tone ?? 'auto'].ring)} aria-hidden><s.icon size={18} /></span>
              <span className="font-display text-14 font-semibold leading-tight text-ink-950"><span className="mr-1 text-muted">{i + 1}.</span>{s.title}</span>
            </div>
            <p className="mt-2 text-13 leading-snug text-ink-900">{s.text}</p>
          </li>
        ))}
      </ol>
      {foot && <p className="mt-3 text-12 text-muted">{foot}</p>}
    </details>
  )
}

// ---------------------------------------------------------------- letters on a time line
type Bar = Pick<RequestRow, 'unit' | 'letterDate' | 'dueOn' | 'hearingOn' | 'hearingWhat' | 'state' | 'itemLabels'> & { key: string | number; draft?: boolean }

/** One row per letter: from the letter date to the reply date, a diamond on a hearing or visit, and today. Clashes are visible:
 *  two bars asking for the same thing, two different reply dates, a reply date next to another unit's hearing. */
export function LetterTimeline({ rows, today }: { rows: Bar[]; today: string }) {
  const days = (s: string) => new Date(s + 'T00:00:00').getTime() / 86400000
  const dates = rows.flatMap((r) => [r.letterDate, r.dueOn, r.hearingOn]).filter(Boolean) as string[]
  if (!rows.length || !dates.length) return null
  const lo = Math.min(...dates.map(days), days(today)) - 2
  const hi = Math.max(...dates.map(days), days(today)) + 2
  const x = (s: string) => `${((days(s) - lo) / (hi - lo)) * 100}%`
  return (
    <figure className="rounded-xl border border-line bg-surface p-4" aria-label="Letters to this institution on a time line">
      <div className="relative">
        <div className="absolute inset-y-0 w-px bg-tape/60" style={{ left: x(today) }} aria-hidden><span className="absolute -top-1 left-1 text-11 text-tape">today</span></div>
        <ul className="space-y-3 pt-4">
          {rows.map((r) => {
            const hex = UNIT_KIND_COLOR[unitKind(r.unit)]
            const end = r.dueOn ?? r.letterDate
            return (
              <li key={r.key} className="relative h-9">
                <span className="absolute -top-0.5 left-0 text-11 font-semibold text-ink-950" style={{ left: `min(${x(r.letterDate)}, 70%)` }}>
                  {r.unit}{r.draft ? ' (this letter)' : ''} · {r.itemLabels.slice(0, 2).join(', ') || 'letter'}{r.itemLabels.length > 2 ? '…' : ''}
                </span>
                <span className={clsx('absolute top-4 h-3 rounded-full', r.draft && 'ring-2 ring-offset-1')}
                  style={{ left: x(r.letterDate), width: `max(6px, calc(${x(end)} - ${x(r.letterDate)}))`, background: r.state === 'open' ? hex : `${hex}55`, ['--tw-ring-color' as string]: hex }} />
                {r.dueOn && <span className="absolute top-[30px] -translate-x-1/2 whitespace-nowrap text-11 text-muted" style={{ left: x(r.dueOn) }}>reply {fmtShort(r.dueOn)}</span>}
                {r.hearingOn && (
                  <span className="absolute top-3 -translate-x-1/2" style={{ left: x(r.hearingOn) }} title={`${r.hearingWhat ?? 'Hearing'} on ${r.hearingOn}`}>
                    <span className="block h-4 w-4 rotate-45 border-2 border-surface" style={{ background: hex }} />
                    <span className="absolute left-5 top-0 whitespace-nowrap text-11 font-medium text-ink-950">{r.hearingWhat ?? 'hearing'} {fmtShort(r.hearingOn)}</span>
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      </div>
      <figcaption className="mt-3 flex flex-wrap gap-4 text-11 text-muted">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-6 rounded-full bg-ink-700" />letter date → reply date</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rotate-45 bg-ink-700" />hearing or visit</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-6 rounded-full bg-ink-700/30" />answered or withdrawn</span>
      </figcaption>
    </figure>
  )
}

// ---------------------------------------------------------------- before / after
export function BeforeAfter({ label, before, after }: { label: string; before: number; after: number }) {
  const max = Math.max(before, after, 1)
  const diff = after - before
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-13"><span className="text-ink-950">{label}</span>
        <span className={clsx('font-semibold', diff > 0 ? 'text-tape' : diff < 0 ? 'text-good' : 'text-muted')}>{before} → {after}{diff ? ` (${diff > 0 ? '+' : ''}${diff})` : ''}</span></div>
      <div className="mt-1 space-y-1">
        <div className="h-2 rounded-full bg-muted/40" style={{ width: `${(before / max) * 100}%` }} title={`Now: ${before}`} />
        <div className={clsx('h-2 rounded-full', diff > 0 ? 'bg-tape' : diff < 0 ? 'bg-good' : 'bg-ink-500')} style={{ width: `${(after / max) * 100}%` }} title={`After: ${after}`} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- closed, then came back
export function CameBack({ closedOn, cameOn, days }: { closedOn: string; cameOn: string; days: number }) {
  return (
    <div className="flex items-center gap-2 text-12" aria-label={`Closed ${closedOn}, came back ${days} days later`}>
      <span className="flex flex-col items-center"><span className="h-3 w-3 rounded-full bg-good" /><span className="mt-1 text-muted">closed {fmtShort(closedOn)}</span></span>
      <span className="relative mb-4 h-0.5 flex-1 bg-turmeric"><span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-turmeric/15 px-2 font-semibold text-ink-950">{days} days</span></span>
      <span className="flex flex-col items-center"><span className="h-3 w-3 rounded-full bg-tape" /><span className="mt-1 text-muted">back {fmtShort(cameOn)}</span></span>
    </div>
  )
}
