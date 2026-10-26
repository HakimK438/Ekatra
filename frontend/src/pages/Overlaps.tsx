// Overlaps: one list, soonest decision date first. Every row says who holds what, the next dated step, when the
// decision is due and who decides. Nothing here is merged, closed or moved by the system.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { GitMerge } from 'lucide-react'
import clsx from 'clsx'
import { api } from '../lib/api'
import { OVERLAP_TITLE, canDecide } from '../lib/logic'
import { decideBy } from '../lib/overlapView'
import { DECISION_LABEL, RULE_LABEL } from '../lib/labels'
import { useUser } from '../hooks/useUser'
import { InstName } from '../components/Ids'
import ClashDuel from '../components/ClashDuel'
import { SeverityMark, Chip, ErrorBox, PageHead, Skeleton, btn, fmtShort } from '../components/ui'
import { initial, plural } from '../lib/text'

type Row = Awaited<ReturnType<typeof api.overlaps>>['open'][number]

/** The first rule that sets the priority, in words. The review page lists every rule and date behind it. */
const reasonFor = (a: { severity: string; rules: { code: keyof typeof RULE_LABEL; severity: string }[] }) => {
  const r = a.rules.find((x) => x.severity === a.severity) ?? a.rules[0]
  return r ? RULE_LABEL[r.code].short.toLowerCase() : 'more than one unit has an open case'
}

export default function Overlaps() {
  const { user } = useUser()
  const q = useQuery({ queryKey: ['overlaps'], queryFn: api.overlaps })
  const [sev, setSev] = useState<'' | 'High' | 'Medium'>('')
  const [mine, setMine] = useState(false)
  const today = api.today

  const when = (a: Row) => { const d = decideBy(a.dueOn, today); return { text: d.text || fmtShort(a.dueOn), late: d.late } }

  return (
    <>
      <PageHead kind="overlaps" icon={<GitMerge size={22} />} title={OVERLAP_TITLE}
        lead="Institutions where more than one unit has a case. This is only a possibility: people from the units decide, and the system records it." />
      {q.isError ? <ErrorBox error={q.error} /> : !q.data ? <Skeleton className="h-80" /> : (() => {
        const open = [...q.data.open].sort((a, b) => a.dueOn.localeCompare(b.dueOn)).filter((a) => (!sev || a.severity === sev) && (!mine || canDecide(user, a.units)))
        const decided = q.data.decided
        return (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filter the list">
              <Chip active={mine} onClick={() => setMine(!mine)}>Only ones I can decide</Chip>
              <span className="mx-1 h-5 w-px bg-line" aria-hidden />
              {(['High', 'Medium'] as const).map((s) => <Chip key={s} active={sev === s} onClick={() => setSev(sev === s ? '' : s)}>{s} priority</Chip>)}
            </div>

            {open.length === 0 ? (
              <p className="rounded-panel border border-dashed border-line bg-surface/60 px-5 py-10 text-center text-14 text-muted">Nothing is waiting for a decision{mine || sev ? ' with these filters' : ''}.</p>
            ) : (
              <ul className="grid gap-4 xl:grid-cols-2">
                {open.map((a) => {
                  const w = when(a)
                  const can = canDecide(user, a.units)
                  return (
                    <li key={a.id} className="relative overflow-hidden rounded-panel border border-line bg-surface shadow-card transition hover:shadow-lg">
                      <span className={clsx('absolute inset-y-0 left-0 w-1.5', a.severity === 'High' ? 'bg-tape' : 'bg-turmeric')} aria-hidden />
                      <div className="p-5 pl-6">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><SeverityMark s={a.severity} /><span className="text-12 text-muted">because {reasonFor(a)}</span></div>
                            <h2 className="mt-1.5 font-display text-18 font-semibold leading-snug text-ink-950"><Link to={`/institutions/${a.institutionId}`} className="hover:underline">{a.institution.name}</Link></h2>
                            <p className="text-12 text-muted"><span className="font-mono">{a.institution.permanentId}</span>{a.issue && <> · {a.issue}</>}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-11 text-muted">Decide by</p>
                            <p className={clsx('font-display text-18 font-semibold', w.late ? 'text-tape' : 'text-ink-950')}>{w.text}</p>
                          </div>
                        </div>
                        <div className="mt-4"><ClashDuel cases={a.cases} today={today} /></div>
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                          <p className="text-13 text-muted">Who decides: <span className="text-text">{a.deciders.map((d) => `${initial(d.name)}${d.role === 'coordinator' ? ' (coordinator)' : ''}`).join(', ')}</span></p>
                          <Link to={`/overlaps/${encodeURIComponent(a.id)}`} className={btn(can ? 'primary' : 'secondary', '!px-4 !py-1.5 !text-13')}>{can ? 'Decide' : 'View'}</Link>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}

            {decided.length > 0 && (
              <details className="mt-6 rounded-panel border border-line bg-surface shadow-card">
                <summary className="cursor-pointer px-5 py-3 font-display text-15 font-semibold text-ink-950">Decided ({decided.length})</summary>
                <ul className="divide-y divide-line border-t border-line">
                  {decided.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-13">
                      <div><InstName id={a.institutionId} name={a.institution.name} permanentId={a.institution.permanentId} />
                        <div className="text-muted">{a.decision ? `${DECISION_LABEL[a.decision.decision]}${a.decision.leadUnit ? `: ${a.decision.leadUnit} leads` : ''}` : 'Decided'}{a.decision && <> · {a.decision.by}, {fmtShort(a.decision.at.slice(0, 10))}</>}</div></div>
                      <Link to={`/overlaps/${encodeURIComponent(a.id)}`} className="font-medium text-ink-700 hover:underline">Open</Link>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {q.data.medianDaysToDecide !== null && <p className="mt-3 text-12 text-muted">Usual time to decide: {plural(q.data.medianDaysToDecide, 'day')}, from {q.data.decisionsCount} decisions.</p>}
          </>
        )
      })()}
    </>
  )
}
