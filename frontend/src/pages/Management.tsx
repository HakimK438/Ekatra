// Management view: what leadership asks. The six figures from the problem statement, whether AICTE is meeting its
// own targets, and three charts, each titled with what to do about it. Detail for every number is one click away.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import WorkCells from '../components/WorkCells'
import { Link } from 'react-router-dom'
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { LineChart } from 'lucide-react'
import clsx from 'clsx'
import { api } from '../lib/api'
import { useUser } from '../hooks/useUser'
import { AGEING } from '../lib/logic'
import { AGE_COLORS, C, tooltipStyle as tip } from '../lib/chartColors'
import { plural } from '../lib/text'
import ChartPanel from '../components/ChartPanel'
import { InstName } from '../components/Ids'
import { UnitKey, UnitPill } from '../components/Unit'
import { Chip, ErrorBox, PageHead, Panel, Skeleton, fmtShort } from '../components/ui'
import { PsStrip, SourceLine } from './home/shared'

function Outcome({ label, value, total, note, to, good }: { label: string; value: number; total: number; note: string; to?: string; good?: boolean }) {
  const pct = total ? Math.round((value / total) * 100) : null
  const body = (
    <article className="rounded-panel border border-line bg-surface p-5 shadow-card">
      <h3 className="text-13 font-medium text-muted">{label}</h3>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={clsx('font-display text-32 font-semibold leading-none', pct === null ? 'text-muted' : good === false ? 'text-tape' : pct >= 80 ? 'text-good' : 'text-turmeric')}>{pct === null ? '—' : `${pct}%`}</span>
        <span className="text-13 text-muted">{total ? `${value} of ${total}` : 'no cases yet'}</span>
      </div>
      <p className="mt-2 text-12 text-muted">{note}</p>
    </article>
  )
  return to ? <Link to={to} className="block hover:opacity-90">{body}</Link> : body
}

export default function Management() {
  const { user } = useUser()
  const sum = useQuery({ queryKey: ['summary', user.id], queryFn: () => api.summary(user) })
  const dash = useQuery({ queryKey: ['dashboard', {}], queryFn: () => api.dashboard() })
  const ov = useQuery({ queryKey: ['overlaps'], queryFn: api.overlaps })
  const [weeks, setWeeks] = useState(12)
  if (sum.isError || dash.isError) return <ErrorBox error={sum.error ?? dash.error} />
  if (!sum.data || !dash.data || !ov.data) return <div className="space-y-4" aria-busy="true"><Skeleton className="h-24" /><Skeleton className="h-40" /><Skeleton className="h-80" /></div>
  const s = sum.data, d = dash.data
  const o = s.outcomes
  const rows = d.weekly.slice(-weeks)
  const recv = rows.reduce((n, r) => n + r.received, 0), disp = rows.reduce((n, r) => n + r.disposed, 0), trans = rows.reduce((n, r) => n + r.transferred, 0)
  const grow = recv - disp - trans
  const topUnit = [...d.workloadAgeing].sort((a, b) => b.overdue - a.overdue)[0]
  const stuck = ov.data.open.filter((a) => a.dueOn < api.today).sort((a, b) => a.dueOn.localeCompare(b.dueOn))

  return (
    <>
      <PageHead icon={<LineChart size={22} />} title="Management view" lead="Where the bottlenecks are, and whether AICTE is meeting its own targets. All units." />
      <div className="space-y-6">
        <PsStrip s={s} />

        <section aria-label="Targets" className="grid gap-4 md:grid-cols-3">
          <Outcome label={`CPGRAMS cases closed within ${o.cpgrams.limitDays} days`} value={o.cpgrams.onTime} total={o.cpgrams.closed} to="/cases?lifecycle=disposed" note="The one time limit that is verified. Counted over every CPGRAMS case closed so far." />
          <Outcome label={`Overlaps decided within ${o.overlaps.targetDays} days`} value={o.overlaps.inTarget} total={o.overlaps.decided} note="Prototype target. Counted over every overlap that has a decision." />
          <Outcome label="Overlaps waiting past their decision date" value={s.overlaps.pastDue} total={s.overlaps.awaiting} good={s.overlaps.pastDue === 0} to="/overlaps" note={`${s.overlaps.awaiting} are waiting in all. Lower is better.`} />
        </section>

        <WorkCells />

        <div className="grid gap-6 xl:grid-cols-2">
          <ChartPanel title="Open cases in each unit, by how long they have waited"
            note="One bar per unit. A longer bar means more open cases. Darker shades mean cases that have waited longer. Select a unit to see its cases."
            insight={topUnit && topUnit.overdue > 0 ? <><UnitPill code={topUnit.unit} /> has the most cases past their time limit ({topUnit.overdue}).</> : 'No unit has a case past its time limit.'}
            summary={d.workloadAgeing.map((u) => `${u.unit}: ${u.open} open, ${u.overdue} overdue`).join('; ')}
            table={{ columns: ['Unit', 'Open', 'Overdue', ...AGEING.map((b) => b.label)], rows: d.workloadAgeing.map((u) => [u.unit, u.open, u.overdue, ...u.buckets]) }}>
            <ul className="space-y-3">
              {d.workloadAgeing.slice(0, 9).map((u) => (
                <li key={u.unit}>
                  <Link to={`/cases?unit=${u.unit}&lifecycle=active`} className="group grid grid-cols-[76px_1fr_auto] items-center gap-3 text-13">
                    <UnitPill code={u.unit} className="justify-self-start" />
                    <span className="flex h-3 overflow-hidden rounded-full bg-paper" style={{ width: `${Math.max(6, (u.open / Math.max(1, d.workloadAgeing[0].open)) * 100)}%` }}>
                      {u.buckets.map((c, i) => <span key={i} style={{ width: `${(c / Math.max(1, u.open)) * 100}%`, background: AGE_COLORS[i] }} />)}
                    </span>
                    <span className="whitespace-nowrap text-muted"><strong className="text-ink-950">{u.open}</strong> open{u.overdue > 0 && <> · <strong className="text-tape">{u.overdue}</strong> late</>}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-12 text-muted">
              {AGEING.map((b, i) => <span key={b.label} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: AGE_COLORS[i] }} />{b.label.replace(' d', ' days old')}</span>)}
            </div>
            <UnitKey className="mt-2" />
          </ChartPanel>

          <ChartPanel
            title="Cases coming in and going out, week by week"
            note="The blue area is cases received. The green line is cases closed (disposed). The grey dashed line is cases transferred to another unit."
            insight={grow > 0 ? `In ${weeks} weeks ${recv} cases came in and ${disp + trans} left, so the number of open cases grew by ${grow}.` : grow < 0 ? `In ${weeks} weeks ${recv} cases came in and ${disp + trans} left, so the number of open cases fell by ${-grow}.` : `In ${weeks} weeks as many cases left (${disp + trans}) as came in (${recv}).`}
            summary={`Per week over ${weeks} weeks: ${recv} received, ${disp} disposed, ${trans} transferred.`}
            table={{ columns: ['Week of', 'Received', 'Disposed', 'Transferred'], rows: rows.map((r) => [fmtShort(r.label), r.received, r.disposed, r.transferred]) }}
            action={<div className="flex gap-1" role="group" aria-label="Time range">{[4, 12, 26].map((w) => <Chip key={w} active={weeks === w} onClick={() => setWeeks(w)}>{w}w</Chip>)}</div>}>
            <div className="h-60">
              <ResponsiveContainer>
                <ComposedChart data={rows} margin={{ left: -18, right: 6, top: 10 }}>
                  <CartesianGrid stroke={C.line} strokeDasharray="4 6" vertical={false} />
                  <XAxis dataKey="label" tickFormatter={fmtShort} tickLine={false} axisLine={false} fontSize={12} minTickGap={28} stroke={C.muted} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} stroke={C.muted} />
                  <Tooltip {...tip} labelFormatter={(l) => `Week of ${fmtShort(String(l))}`} />
                  <Area isAnimationActive={false} type="monotone" dataKey="received" name="Received" stroke={C.blue} strokeWidth={2.5} fill={C.blue} fillOpacity={0.1} dot={false} />
                  <Line isAnimationActive={false} type="monotone" dataKey="disposed" name="Disposed" stroke={C.good} strokeWidth={2.5} dot={false} />
                  <Line isAnimationActive={false} type="monotone" dataKey="transferred" name="Transferred" stroke={C.stamp} strokeWidth={2} strokeDasharray="5 4" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-12 text-muted">
              <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-ink-700" />Received ({recv})</span>
              <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-good" />Disposed ({disp})</span>
              <span><span className="mr-1.5 inline-block h-0.5 w-3 bg-stamp align-middle" />Transferred, apart ({trans})</span>
            </p>
          </ChartPanel>
        </div>

        <Panel title={stuck.length ? `${plural(stuck.length, 'overlap')} waiting past the decision date` : 'No overlap is waiting past its decision date'} note="These are the ones to chase. Soonest first.">
          {stuck.length === 0 ? <p className="text-14 text-muted">Every overlap is inside its decision date.</p> : (
            <ul className="divide-y divide-line">
              {stuck.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-13">
                  <div className="min-w-0"><InstName id={a.institutionId} name={a.institution.name} permanentId={a.institution.permanentId} />
                    <div className="text-muted">{a.units.join(', ')} · decide by {fmtShort(a.dueOn)} · {a.deciders.map((x) => x.name).join(', ')}</div></div>
                  <Link to={`/overlaps/${encodeURIComponent(a.id)}`} className="font-medium text-ink-700 hover:underline">Open</Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <SourceLine s={s} />
      </div>
    </>
  )
}
