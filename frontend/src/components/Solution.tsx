// Small visuals for the three helper ideas: the traffic light before an action, the owner of the next step,
// and the stage time-budget bar. Every state is icon + words + colour, never colour alone.
import clsx from 'clsx'
import { AlertTriangle, CheckCircle2, Clock3, OctagonAlert, UserRound } from 'lucide-react'
import type { CheckResult, Light, NextStep, StageBudget } from '../lib/solution'
import { fmtShort } from './ui'

const LIGHT = {
  green: { Icon: CheckCircle2, word: 'No other unit affected', box: 'border-good/30 bg-good-soft', text: 'text-good' },
  amber: { Icon: AlertTriangle, word: 'Another unit is active', box: 'border-turmeric/40 bg-turmeric-soft', text: 'text-turmeric' },
  red: { Icon: OctagonAlert, word: 'Same issue open elsewhere', box: 'border-tape/30 bg-tape-soft', text: 'text-tape' },
} as const

/** The traffic light shown before an action. It advises; the officer can always continue, with a reason on record. */
export function CheckCard({ r, contacts, className }: { r: CheckResult; contacts?: { unit: string; name: string; role: string }[]; className?: string }) {
  const L = LIGHT[r.light]
  return (
    <div role="status" key={r.light} className={clsx('rise rounded-panel border p-4', L.box, className)}>
      <div className="flex items-start gap-3">
        <L.Icon size={22} key={r.light} className={clsx('pop mt-0.5 shrink-0', L.text)} aria-hidden />
        <div className="min-w-0">
          <div className={clsx('text-12 font-semibold', L.text)}>{L.word}</div>
          <p className="text-15 font-semibold leading-snug text-ink-950">{r.headline}</p>
          {r.because.length > 0 && (
            <ul className="mt-2 space-y-1 text-13 text-text">
              {r.because.map((b) => <li key={b} className="flex gap-2"><span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-500" />{b}</li>)}
            </ul>
          )}
          {!!contacts?.length && <p className="mt-2 text-13 text-ink-950"><span className="text-muted">Contact: </span>{contacts.map((c) => `${c.name} (${c.unit}, ${c.role.toLowerCase()})`).join('; ')}</p>}
          {r.light !== 'green' && <p className="mt-2 text-12 text-muted">Ekatra shows the facts and never blocks an action. If an action goes ahead while another unit is active, the audit entry says so.</p>}
        </div>
      </div>
    </div>
  )
}

/** The signature moment: a tall traffic light and one plain instruction, with whom to call. Used on "Before you act". */
export function LightHero({ r, contacts, institution }: { r: CheckResult; contacts?: { unit: string; name: string; role: string }[]; institution: string }) {
  const L = LIGHT[r.light]
  const lamps: Light[] = ['red', 'amber', 'green']
  const on = { red: 'bg-tape', amber: 'bg-turmeric', green: 'bg-good' } as const
  return (
    <section role="status" aria-label={`${L.word}: ${r.headline}`} key={r.light} className={clsx('rise grid gap-5 rounded-panel border p-5 sm:grid-cols-[auto_1fr] sm:p-6', L.box)}>
      <div className="flex gap-2 rounded-full bg-ink-950 p-2 sm:flex-col" aria-hidden>
        {lamps.map((l) => <span key={l} className={clsx('h-7 w-7 rounded-full sm:h-9 sm:w-9', l === r.light ? clsx(on[l], 'pop ring-4 ring-white/25') : 'bg-white/10')} />)}
      </div>
      <div className="min-w-0">
        <p className={clsx('text-14 font-semibold', L.text)}>{L.word} · {institution}</p>
        <p className="mt-1 font-display text-24 font-semibold leading-snug text-ink-950">{r.headline}</p>
        {r.because.length > 0 && (
          <ul className="mt-3 space-y-1.5 text-14 text-text">
            {r.because.map((b) => <li key={b} className="flex gap-2"><span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-500" />{b}</li>)}
          </ul>
        )}
        {!!contacts?.length && (
          <div className="mt-4 rounded-lg bg-white/70 px-4 py-3 text-15 text-ink-950">
            <span className="text-muted">Who to contact in that unit: </span>
            <span className="font-semibold">{contacts.map((c) => `${c.name} (${c.unit} ${c.role.toLowerCase()})`).join(' · ')}</span>
          </div>
        )}
        <p className="mt-3 text-13 text-muted">{r.light === 'green' ? 'No other unit has an open case on this institution.' : 'Ekatra shows the facts and never blocks an action. If an action goes ahead while another unit is active, the audit entry says so.'}</p>
      </div>
    </section>
  )
}

export const lightWord = (l: Light) => LIGHT[l].word

/** Who holds the next step, what they must do, and by when. */
export function NextStepCard({ s, today, className }: { s: NextStep | null; today?: string; className?: string }) {
  if (!s) return null
  const late = !!s.by && !!today && s.by < today
  return (
    <section aria-label="Next step" className={clsx('rounded-panel border border-line bg-surface p-4 shadow-card', className)}>
      <div className="grid gap-4 sm:grid-cols-[auto_1fr_auto] sm:items-center">
        <div className="flex items-center gap-3">
          <span className={clsx('flex h-10 w-10 items-center justify-center rounded-full', s.waiting ? 'bg-turmeric-soft text-turmeric' : 'bg-ink-100 text-ink-800')} aria-hidden>
            {s.waiting ? <Clock3 size={18} /> : <UserRound size={18} />}
          </span>
          <div><div className="text-12 text-muted">{s.waiting ? 'Waiting on' : 'Now with'}</div><div className="text-15 font-semibold text-ink-950">{s.owner}</div></div>
        </div>
        <div><div className="text-12 text-muted">Next step</div><div className="text-15 text-ink-950">{s.verb}</div></div>
        {s.by && <div className="sm:text-right"><div className="text-12 text-muted">By</div><div className={clsx('text-15 font-semibold', late ? 'text-tape' : 'text-ink-950')}>{fmtShort(s.by)}{late && <span className="ml-1 text-12 font-medium">(passed)</span>}</div></div>}
      </div>
    </section>
  )
}

/** Three connected blocks sized by their days. The current one shows how far through it the case is. */
export function BudgetBar({ budgets, labels = true }: { budgets: StageBudget[]; labels?: boolean }) {
  if (!budgets.length) return null
  const total = budgets.reduce((s, b) => s + b.days, 0)
  return (
    <div className="flex gap-1" role="img" aria-label={budgets.map((b) => `${b.label}: ${b.days} days, ${b.state === 'done' ? 'finished' : b.state === 'current' ? (b.lateDays ? `${b.lateDays} days over` : 'in progress') : 'not started'}`).join('. ')}>
      {budgets.map((b) => {
        const used = b.state === 'done' ? 1 : b.state === 'current' ? Math.min(1, b.spent / b.days) : 0
        return (
          <div key={b.key} style={{ flexGrow: b.days / total, flexBasis: 0 }} className="min-w-0">
            <div className="h-2 overflow-hidden rounded-full bg-line">
              <div className={clsx('grow-x h-full rounded-full', b.lateDays ? 'bg-tape' : b.state === 'done' ? 'bg-ink-500' : 'bg-ink-700')} style={{ width: `${used * 100}%` }} />
            </div>
            {labels && <div className={clsx('mt-1 truncate text-11', b.state === 'current' ? 'font-semibold text-ink-950' : 'text-muted')}>{b.short} {b.days}d</div>}
          </div>
        )
      })}
    </div>
  )
}
