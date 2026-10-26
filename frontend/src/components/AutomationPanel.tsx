// Shows what Ekatra already did on its own, what still needs a person, and lets you watch one case go through.
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Check, Hand } from 'lucide-react'
import clsx from 'clsx'
import { api, SCENARIOS, type ScenarioId } from '../lib/api'
import { Chip, Panel, Skeleton } from './ui'

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export default function AutomationPanel() {
  const qc = useQueryClient()
  const stats = useQuery({ queryKey: ['automation'], queryFn: api.automation })
  const [scenario, setScenario] = useState<ScenarioId | null>(null)
  const [shown, setShown] = useState(0)
  const run = useMutation({ mutationFn: (s: ScenarioId) => api.ingest(s), onSuccess: () => qc.invalidateQueries() })
  const sweep = useMutation({ mutationFn: api.runSweep, onSuccess: () => qc.invalidateQueries({ queryKey: ['automation'] }) })
  const reset = useMutation({ mutationFn: api.resetDemo, onSuccess: () => { setScenario(null); setShown(0); run.reset(); qc.invalidateQueries() } })

  // Reveal the pipeline steps one at a time so you can see the order things happen in.
  const steps = run.data?.steps ?? []
  useEffect(() => {
    if (!steps.length) return
    if (reduced()) { setShown(steps.length); return }
    setShown(0)
    const timers = steps.map((_, i) => window.setTimeout(() => setShown(i + 1), 450 * (i + 1)))
    return () => timers.forEach(clearTimeout)
  }, [run.data])  // eslint-disable-line react-hooks/exhaustive-deps

  const s = stats.data
  return (
    <Panel title="Handled for you" note="The machine does the checking. A person makes every decision.">
      {!s ? <Skeleton className="h-40" /> : (
        <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="text-17 leading-snug text-ink-950">
              <strong className="font-semibold">{s.autoPct}%</strong> of cases were matched to their institution without anyone lifting a finger.
            </p>
            <ul className="mt-4 grid grid-cols-3 gap-2 text-center" aria-label="Who does what">
              <li className="rounded-xl bg-ink-50 px-2 py-3"><div className="font-display text-22 font-semibold text-ink-700">{s.autoMatched + s.tracked}</div><div className="text-12 text-ink-900">Done automatically</div><div className="text-11 text-muted">matches and clocks</div></li>
              <li className="rounded-xl bg-turmeric-soft px-2 py-3"><div className="font-display text-22 font-semibold text-turmeric">{s.needsPerson}</div><div className="text-12 text-turmeric">Suggested</div><div className="text-11 text-muted">a person chooses</div></li>
              <li className="rounded-xl bg-good-soft px-2 py-3"><div className="font-display text-22 font-semibold text-good">{s.overlapsWaiting}</div><div className="text-12 text-good">Person decides</div><div className="text-11 text-muted">overlaps waiting</div></li>
            </ul>
            <ul className="mt-5 space-y-3 text-15">
              <li><Link to="/overlaps" className="group flex items-baseline gap-3"><span className="w-10 font-display text-26 font-semibold text-ink-950">{s.overlaps}</span><span className="text-muted group-hover:text-ink-700">overlaps found between units</span></Link></li>
              <li><Link to="/matching" className="group flex items-baseline gap-3"><span className={clsx('w-10 font-display text-26 font-semibold', s.needsPerson ? 'text-turmeric' : 'text-ink-950')}>{s.needsPerson}</span><span className="text-muted group-hover:text-ink-700">need a person to confirm the institution</span></Link></li>
              <li className="flex items-baseline gap-3"><span className="w-10 font-display text-26 font-semibold text-ink-950">{s.tracked}</span><span className="text-muted">open cases with a deadline being tracked</span></li>
            </ul>
            <div className="mt-6 border-t border-line pt-4 text-14 text-muted">
              <p>Deadlines are re-checked every hour. Last check {s.minutesSinceSweep === 0 ? 'just now' : `${s.minutesSinceSweep} min ago`}.</p>
              <button onClick={() => sweep.mutate()} disabled={sweep.isPending} className="mt-1 font-medium text-ink-700 hover:underline disabled:opacity-50">{sweep.isPending ? 'Checking…' : 'Check now'}</button>
              {sweep.data && <p className="mt-1 text-text" aria-live="polite">Checked {sweep.data.checked} open cases: {sweep.data.overdue} overdue, {sweep.data.soon} due soon, {sweep.data.escalate} to escalate.</p>}
            </div>
          </div>

          <div className="rounded-xl border border-line bg-paper/70 p-6">
            <h3 className="font-display text-17 font-semibold text-ink-950">Watch a new case arrive</h3>
            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Choose a case">
              {SCENARIOS.map((sc) => <Chip key={sc.id} active={scenario === sc.id} disabled={run.isPending} onClick={() => { setScenario(sc.id); run.mutate(sc.id) }}>{sc.label}</Chip>)}
            </div>

            {steps.length > 0 ? (
              <ol className="mt-5 space-y-3" aria-live="polite">
                {steps.slice(0, shown).map((st) => (
                  <li key={st.key} className="flex items-start gap-3">
                    <span className={clsx('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full', st.outcome === 'auto' ? 'bg-good text-white' : 'bg-turmeric text-white')} aria-hidden>
                      {st.outcome === 'auto' ? <Check size={14} strokeWidth={3} /> : <Hand size={13} />}
                    </span>
                    <div className="min-w-0 flex-1 leading-snug">
                      <div className="text-15 font-semibold text-ink-950">{st.title}</div>
                      <div className="text-14 text-muted">{st.detail}</div>
                    </div>
                    <span className="text-12 text-muted">{st.outcome === 'auto' ? 'Automatic' : 'Needs a person'}</span>
                  </li>
                ))}
                {shown >= steps.length && run.data && (
                  <li className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-2 text-14 font-medium">
                    <Link to={`/cases/${run.data.caseId}`} className="text-ink-700 hover:underline">Open the case</Link>
                    {run.data.overlapId && <Link to={`/overlaps/${encodeURIComponent(run.data.overlapId)}`} className="text-ink-700 hover:underline">Review the overlap</Link>}
                    {!run.data.matched && <Link to="/matching" className="text-ink-700 hover:underline">Go to matching</Link>}
                    <button onClick={() => reset.mutate()} className="ml-auto font-normal text-muted hover:text-text">Reset demo data</button>
                  </li>
                )}
              </ol>
            ) : (
              <p className="mt-5 text-14 text-muted">Pick one. You will see each step Ekatra takes, and where it stops to ask a person.</p>
            )}
          </div>
        </div>
      )}
    </Panel>
  )
}
