// The visual layer of the dashboard: a hero with a 14-day action radar, six count cards with their share of all cases,
// and a chart grid where every chart is titled with its takeaway. Everything is drawn from the same records as the
// tables below it; every number or bar opens the cases behind it.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, ArrowRight, ArrowUpRight, Lightbulb, CheckCircle2, CornerUpRight, Hourglass, Inbox, OctagonAlert, ShieldCheck, X, type LucideIcon } from 'lucide-react'
import { api } from '../../lib/api'
import { datedActions, findCollisions, type CalCase } from '../../lib/calendar'
import { AGE_COLORS, C, STAGE_COLORS, UNIT_KIND_COLOR, tooltipStyle as tip, unitKind } from '../../lib/chartColors'
import { STAGE_HELP, STAGE_LABEL, unitFull } from '../../lib/labels'
import { AGEING, addDays } from '../../lib/logic'
import { fmtDay, plural } from '../../lib/text'
import { CountUp } from '../../hooks/useCountUp'
import ChartPanel from '../../components/ChartPanel'
import { Skeleton, fmtShort } from '../../components/ui'
import { UnitKey, UnitPill } from '../../components/Unit'
import type { Summary } from './shared'

// ---------------------------------------------------------------- hero
type RadarCase = CalCase
/** One institution with other units' open cases (an overlap alert), as the radar needs it. */
export interface RadarAlert { id: string; institutionId: string; institution: { name: string }; cases: RadarCase[] }
const DAYS = 14
const KIND_WORD: [string, string][] = [['PGRC', 'Grievance cell'], ['RB-', 'Regulation Bureau'], ['RO-', 'Regional Office'], ['LEGAL', 'Legal and other cells']]

interface Step { date: string; unit: string; what: string; caseId: string; uid: string; alert: RadarAlert; with: { unit: string; date: string; what: string }[] }

/** Fourteen days as one track. Each dot is a dated step of one unit; select a day to see what happens there and why it matters. */
function Radar({ alerts, today }: { alerts: RadarAlert[]; today: string }) {
  const [picked, setPicked] = useState<string | null>(null)
  const end = addDays(today, DAYS - 1)
  const days = Array.from({ length: DAYS }, (_, i) => addDays(today, i))
  // Steps inside the window, each with the other units' steps it collides with (same institution, within a week).
  const steps: Step[] = alerts.flatMap((al) => {
    const all = datedActions(al.cases, today)
    const hot = findCollisions(all)
    return all.filter((x) => x.kind !== 'deadline' && x.date <= end).map((x) => {
      const col = hot.find((c) => c.actions.some((y) => y.caseId === x.caseId && y.date === x.date && y.what === x.what))
      return { date: x.date, unit: x.unit, what: x.what, caseId: x.caseId, uid: x.uid, alert: al, with: col ? col.actions.filter((y) => y.unit !== x.unit).map((y) => ({ unit: y.unit, date: y.date, what: y.what })) : [] }
    })
  })
  const hotDates = new Set(steps.filter((x) => x.with.length).map((x) => x.date))
  const clashes = new Set(steps.filter((x) => x.with.length).map((x) => x.alert.id)).size
  const desc = `${plural(steps.length, 'dated step')} in the next ${DAYS} days${clashes ? `; ${plural(clashes, 'institution')} where two units act within a week of each other` : ''}.`
  const open = picked ? steps.filter((x) => x.date === picked) : []

  return (
    <figure aria-label="The next 14 days" className="mt-6">
      <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-display text-15 font-semibold text-white">The next 14 days</span>
        <span className="text-12 text-white/75">{steps.length ? `${plural(steps.length, 'dated step')}${clashes ? ` · ${plural(clashes, 'institution')} where two units act in the same week` : ''} · select a day for details` : 'No dated steps in the next 14 days'}</span>
      </figcaption>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${DAYS}, minmax(0, 1fr))` }} role="group" aria-label={desc}>
        {days.map((d, i) => {
          const here = steps.filter((x) => x.date === d)
          const dt = new Date(d + 'T00:00:00')
          const weekend = dt.getDay() === 0 || dt.getDay() === 6
          const hot = hotDates.has(d)
          const on = picked === d
          return (
            <button key={d} type="button" disabled={!here.length} onClick={() => setPicked(on ? null : d)} aria-pressed={on}
              aria-label={`${fmtDay(d)}: ${here.length ? here.map((x) => `${x.unit} ${x.what}`).join('; ') : 'nothing dated'}`}
              title={here.length ? here.map((x) => `${x.unit}: ${x.what} (${x.alert.institution.name})`).join('\n') : fmtDay(d)}
              className={clsx('relative flex min-h-[86px] flex-col items-center rounded-lg px-0.5 pb-2 pt-1.5 text-left transition',
                hot ? 'bg-turmeric/40 ring-1 ring-inset ring-[#F0A43A]' : 'bg-white/[0.07]', weekend && !hot && !here.length && 'opacity-60',
                here.length ? 'cursor-pointer hover:bg-white/20' : 'cursor-default', on && '!ring-2 !ring-white')}>
              <span className="text-11 text-white/70">{dt.toLocaleDateString('en-IN', { weekday: 'narrow' })}</span>
              <span className={clsx('mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-13 font-semibold', i === 0 ? 'bg-white text-ink-950' : 'text-white')}>{dt.getDate()}</span>
              <span className="mt-1.5 flex flex-1 flex-col items-center justify-end gap-1">
                {here.slice(0, 3).map((x, k) => <span key={k} className="h-3 w-3 rounded-full ring-2 ring-white" style={{ background: UNIT_KIND_COLOR[unitKind(x.unit)] }} />)}
                {here.length > 3 && <span className="text-11 font-semibold text-white">+{here.length - 3}</span>}
              </span>
            </button>
          )
        })}
      </div>

      {/* what the marks mean */}
      <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-12 text-white/80" aria-label="Key">
        {KIND_WORD.map(([code, word]) => <li key={code} className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full ring-2 ring-white" style={{ background: UNIT_KIND_COLOR[unitKind(code)] }} />{word}</li>)}
        <li className="inline-flex items-center gap-1.5"><span className="h-3.5 w-5 rounded bg-turmeric/50 ring-1 ring-[#F0A43A]" />Two units act on one institution within a week</li>
        <li className="inline-flex items-center gap-1.5"><span className="flex h-4 w-4 items-center justify-center rounded-full bg-white text-11 font-semibold text-ink-950">{new Date(today + 'T00:00:00').getDate()}</span>Today</li>
      </ul>

      {picked && open.length > 0 && (
        <div className="rise mt-4 rounded-2xl bg-white p-4 text-ink-950 shadow-lg" role="region" aria-label={`Steps on ${fmtDay(picked)}`}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="font-display text-16 font-semibold">{fmtDay(picked)}: {plural(open.length, 'step')}</h3>
            <button type="button" onClick={() => setPicked(null)} className="rounded-full p-1 text-muted hover:bg-paper" aria-label="Close details"><X size={16} /></button>
          </div>
          <ul className="divide-y divide-line">
            {open.map((x) => (
              <li key={`${x.caseId}-${x.what}`} className="py-3 first:pt-0 last:pb-0">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-14">
                  <span className="inline-flex items-center gap-1.5 font-semibold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: UNIT_KIND_COLOR[unitKind(x.unit)] }} aria-hidden />{unitFull(x.unit)}</span>
                  <span>{x.what}</span>
                </p>
                <p className="mt-0.5 text-13 text-muted">At <Link to={`/institutions/${x.alert.institutionId}`} className="font-medium text-ink-700 hover:underline">{x.alert.institution.name}</Link> · case <span className="font-mono">{x.uid}</span></p>
                {x.with.length > 0 ? (
                  <div className="mt-2 rounded-lg bg-turmeric-soft px-3 py-2.5 text-13 text-ink-950">
                    <p className="flex items-start gap-1.5 font-semibold text-turmeric"><AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />Another unit acts on the same institution within a week</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5">{x.with.map((w) => <li key={`${w.unit}-${w.date}-${w.what}`}><strong>{w.unit}</strong> {w.what} on {fmtDay(w.date)}</li>)}</ul>
                    <p className="mt-1.5">If both act, the institution receives two separate communications about the same matter.</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Link to={`/overlaps/${encodeURIComponent(x.alert.id)}`} className="rounded-full bg-ink-700 px-3.5 py-1.5 text-13 font-medium text-white hover:bg-ink-900">Open the clash</Link>
                      <Link to={`/check?inst=${x.alert.institutionId}`} className="rounded-full border border-line bg-white px-3.5 py-1.5 text-13 font-medium text-ink-950 hover:bg-ink-50">Before you act</Link>
                    </div>
                  </div>
                ) : <p className="mt-1.5 text-13 text-muted">No other unit acts on this institution within a week of this step.</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <ul className="sr-only">{steps.map((x) => <li key={`${x.caseId}-${x.date}-${x.what}`}>{fmtDay(x.date)}: {x.unit} {x.what} at {x.alert.institution.name}{x.with.length ? `, clashes with ${x.with.map((w) => w.unit).join(' and ')}` : ''}</li>)}</ul>
    </figure>
  )
}

/** The one idea of the product, with three live counts and the next fortnight. */
export function Hero({ s, alerts, today }: { s: Summary; alerts: RadarAlert[]; today: string }) {
  const o = s.overlaps
  const figs: { label: string; value: number; to: string; tone: string }[] = [
    { label: 'Clashes found', value: o.all, to: '/overlaps', tone: 'text-white' },
    { label: 'Waiting for a decision', value: o.awaiting, to: '/overlaps', tone: o.awaiting ? 'text-[#F5B461]' : 'text-white' },
    { label: 'Went ahead on a warning', value: o.wentAhead ?? 0, to: '/audit', tone: o.wentAhead ? 'text-[#FF9AA1]' : 'text-white' },
  ]
  return (
    <section aria-label="What Ekatra does" className="relative overflow-hidden rounded-[22px] bg-gradient-to-br from-ink-950 via-ink-800 to-ink-900 p-6 text-white shadow-card md:p-8">
      {/* a faint ledger grid and two soft glows: depth without clutter */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.07]" aria-hidden style={{ backgroundImage: 'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)', backgroundSize: '36px 36px' }} />
      <div className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-ink-500/30 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-32 left-1/4 h-72 w-72 rounded-full bg-turmeric/25 blur-3xl" aria-hidden />
      <div className="relative grid gap-6 lg:grid-cols-[1.25fr_1fr] lg:items-center">
        <div>
          <p className="font-display text-26 font-semibold leading-snug text-balance md:text-28">Ekatra warns you before you act on an institution that another unit is already acting on.</p>
          <Link to="/check" className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-14 font-semibold text-ink-950 shadow-lg transition hover:bg-ink-50"><ShieldCheck size={17} aria-hidden />Before you act</Link>
        </div>
        <ul className="grid grid-cols-3 gap-3">
          {figs.map((f) => (
            <li key={f.label}>
              <Link to={f.to} className="group block h-full rounded-2xl border border-white/15 bg-white/10 px-3.5 py-3 backdrop-blur transition hover:bg-white/15">
                <span className={clsx('block font-display text-40 font-semibold leading-none', f.tone)}><CountUp value={f.value} /></span>
                <span className="mt-1.5 block text-12 leading-tight text-white/80 group-hover:underline">{f.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <Radar alerts={alerts} today={today} />
    </section>
  )
}

// ---------------------------------------------------------------- count cards
const ACCENT = { pending: C.blueMid, process: C.blue, transferred: C.stamp, escalated: C.saffronFill, disposed: C.good, late: C.tape } as const

/** The six figures from the problem statement: each with its share of all cases, so the size of each pile is visible. */
export function KpiCards({ s }: { s: Summary }) {
  const c = s.cases
  const tiles: { label: string; value: number; to: string; accent: string; Icon: LucideIcon; note: string; text?: string }[] = [
    { label: 'Pending', value: c.pending, to: '/cases?lifecycle=pending', accent: ACCENT.pending, Icon: Inbox, note: 'Received, not yet picked up' },
    { label: 'Under process', value: c.underProcess, to: '/cases?lifecycle=under_process', accent: ACCENT.process, Icon: Hourglass, note: 'With an officer, or waiting for a reply' },
    { label: 'Transferred', value: c.transferred, to: '/cases?lifecycle=transferred', accent: ACCENT.transferred, Icon: CornerUpRight, note: 'Counted apart from disposals' },
    { label: 'Escalated', value: c.escalated, to: '/cases?lifecycle=escalated', accent: ACCENT.escalated, Icon: ArrowUpRight, note: 'Sent to a higher authority' },
    { label: 'Disposed', value: c.disposed, to: '/cases?lifecycle=disposed', accent: ACCENT.disposed, Icon: CheckCircle2, note: 'Closed with an outcome', text: 'text-good' },
    { label: 'Beyond limit', value: c.overdue, to: '/cases?deadline=overdue', accent: ACCENT.late, Icon: OctagonAlert, note: 'Past the time limit', text: 'text-tape' },
  ]
  return (
    <section aria-label="Case figures, all units">
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map((t, i) => {
          const share = c.total ? Math.round((t.value / c.total) * 100) : 0
          return (
            <li key={t.label} style={{ animationDelay: `${i * 50}ms` }} className="rise">
              <Link to={t.to} className="group relative block h-full overflow-hidden rounded-panel border border-line bg-surface p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg">
                <span className="absolute inset-x-0 top-0 h-1" style={{ background: t.accent }} aria-hidden />
                <div className="flex items-start justify-between">
                  <span className="text-13 font-medium text-muted group-hover:underline">{t.label}</span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${t.accent}22`, color: t.accent === C.blueMid || t.accent === C.stamp ? C.ink : t.accent }} aria-hidden><t.Icon size={16} /></span>
                </div>
                <span className={clsx('mt-1 block font-display text-34 font-semibold leading-none', t.value && t.text ? t.text : 'text-ink-950')}><CountUp value={t.value} /></span>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-paper" role="img" aria-label={`${share}% of all cases`}><div className="grow-x h-full rounded-full" style={{ width: `${Math.max(share, t.value ? 4 : 0)}%`, background: t.accent }} /></div>
                <p className="mt-1.5 flex justify-between text-12 text-muted"><span>{t.note}</span><span className="font-mono">{share}%</span></p>
              </Link>
            </li>
          )
        })}
      </ul>
      <p className="mt-2 text-12 text-muted">All units · {plural(c.total, 'case')} on record. Select a card to see its cases.</p>
    </section>
  )
}

// ---------------------------------------------------------------- charts
type Dash = Awaited<ReturnType<typeof api.dashboard>>

function FlowChart({ d }: { d: Dash }) {
  const rows = d.weekly.slice(-12)
  const recv = rows.reduce((n, r) => n + r.received, 0), disp = rows.reduce((n, r) => n + r.disposed, 0), trans = rows.reduce((n, r) => n + r.transferred, 0)
  const grow = recv - disp - trans
  return (
    <ChartPanel title="Cases coming in and going out, week by week"
      note="The last 12 weeks. The blue area is cases received. The green line is cases closed (disposed). The grey dashed line is cases transferred to another unit."
      insight={grow > 0 ? `In 12 weeks ${recv} cases came in and ${disp + trans} left (${disp} closed, ${trans} transferred), so the number of open cases grew by ${grow}.` : grow < 0 ? `In 12 weeks ${recv} cases came in and ${disp + trans} left (${disp} closed, ${trans} transferred), so the number of open cases fell by ${-grow}.` : `In 12 weeks as many cases left (${disp + trans}) as came in (${recv}).`}
      summary={`Over 12 weeks: ${recv} received, ${disp} disposed, ${trans} transferred.`}
      table={{ columns: ['Week of', 'Received', 'Disposed', 'Transferred'], rows: rows.map((r) => [fmtShort(r.label), r.received, r.disposed, r.transferred]) }}>
      <div className="h-[22rem]">
        <ResponsiveContainer>
          <ComposedChart data={rows} margin={{ left: -18, right: 6, top: 10 }}>
            <defs><linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.blue} stopOpacity={0.35} /><stop offset="100%" stopColor={C.blue} stopOpacity={0.02} /></linearGradient></defs>
            <CartesianGrid stroke={C.line} strokeDasharray="4 6" vertical={false} />
            <XAxis dataKey="label" tickFormatter={fmtShort} tickLine={false} axisLine={false} fontSize={12} minTickGap={28} stroke={C.muted} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} stroke={C.muted} />
            <Tooltip {...tip} labelFormatter={(l) => `Week of ${fmtShort(String(l))}`} />
            <Area isAnimationActive={false} type="monotone" dataKey="received" name="Received" stroke={C.blue} strokeWidth={2.5} fill="url(#gIn)" dot={false} />
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
  )
}

/** Open cases by stage as a funnel: the widest bar is where cases are piling up. */
function StageFunnel({ d }: { d: Dash }) {
  const rows = d.pipeline.filter((p) => p.stage !== 'escalated' || p.count > 0)
  const max = Math.max(1, ...rows.map((r) => r.count))
  const top = [...rows].sort((a, b) => b.count - a.count)[0]
  const open = rows.reduce((n, r) => n + r.count, 0)
  return (
    <ChartPanel title="Open cases at each stage of handling"
      note="Stages run from New to Sent to senior authority. Closed and transferred cases are not in this picture."
      insight={top && top.count ? `${top.count} of the ${open} open cases are in the stage “${STAGE_LABEL[top.stage as keyof typeof STAGE_LABEL]}”. ${STAGE_HELP[top.stage as keyof typeof STAGE_HELP]}` : 'There are no open cases.'}
      summary={rows.map((r) => `${STAGE_LABEL[r.stage as keyof typeof STAGE_LABEL]}: ${r.count}`).join('; ')}
      table={{ columns: ['Stage', 'Cases'], rows: rows.map((r) => [STAGE_LABEL[r.stage as keyof typeof STAGE_LABEL], r.count]) }}>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.stage}>
            <Link to={`/cases?lifecycle=${r.stage}`} className="group block">
              <div className="mb-1 flex items-baseline justify-between gap-3 text-13"><span><span className="font-medium text-ink-950 group-hover:underline">{STAGE_LABEL[r.stage as keyof typeof STAGE_LABEL]}</span><span className="block text-12 text-muted">{STAGE_HELP[r.stage as keyof typeof STAGE_HELP]}</span></span><span className="font-mono text-15 font-semibold text-ink-950">{r.count}</span></div>
              <div className="h-7 rounded-lg bg-paper">
                <div className="grow-x flex h-full items-center justify-end rounded-lg pr-2" style={{ width: `${Math.max(6, (r.count / max) * 100)}%`, background: STAGE_COLORS[r.stage as keyof typeof STAGE_COLORS] ?? C.blue }} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </ChartPanel>
  )
}

function AgeBars({ d }: { d: Dash }) {
  const rows = d.ageing.map((a) => ({ name: a.bucket, count: a.count }))
  const open = rows.reduce((n, r) => n + r.count, 0)
  const old = rows.slice(-2).reduce((n, r) => n + r.count, 0)
  const cut = AGEING[AGEING.length - 3]?.max
  return (
    <ChartPanel title="How long open cases have been waiting"
      note="Days since each open case was received, grouped into bands."
      insight={old ? `${old} of the ${open} open cases have waited longer than ${cut} days.` : `No open case has waited longer than ${cut} days. The oldest group is “${rows[rows.length - 3]?.name}”.`}
      summary={rows.map((r) => `${r.name}: ${r.count}`).join('; ')}
      table={{ columns: ['Age', 'Open cases'], rows: rows.map((r) => [r.name, r.count]) }}>
      <div className="h-56">
        <ResponsiveContainer>
          <BarChart data={rows} margin={{ left: -22, right: 4, top: 10 }}>
            <CartesianGrid stroke={C.line} strokeDasharray="4 6" vertical={false} />
            <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} stroke={C.muted} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} stroke={C.muted} />
            <Tooltip {...tip} cursor={{ fill: 'rgba(41,82,204,.06)' }} />
            <Bar isAnimationActive={false} dataKey="count" name="Open cases" radius={[8, 8, 0, 0]}>{rows.map((_, i) => <Cell key={i} fill={AGE_COLORS[i] ?? C.blue} />)}</Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartPanel>
  )
}

function WorkloadBars({ d }: { d: Dash }) {
  const rows = d.workloadAgeing.slice(0, 7)
  const top = [...d.workloadAgeing].sort((a, b) => b.overdue - a.overdue)[0]
  const max = Math.max(1, ...rows.map((r) => r.open))
  return (
    <ChartPanel title="Open cases in each unit, by how long they have waited"
      note="One bar per unit. A longer bar means more open cases. Darker shades mean cases that have waited longer."
      insight={top && top.overdue > 0 ? <><UnitPill code={top.unit} /> has the most cases past their time limit ({top.overdue}). <UnitPill code={d.workloadAgeing[0].unit} /> holds the most open cases ({d.workloadAgeing[0].open}).</> : 'No unit has a case past its time limit.'}
      summary={d.workloadAgeing.map((u) => `${u.unit}: ${u.open} open, ${u.overdue} overdue`).join('; ')}
      table={{ columns: ['Unit', 'Open', 'Overdue', ...AGEING.map((b) => b.label)], rows: d.workloadAgeing.map((u) => [u.unit, u.open, u.overdue, ...u.buckets]) }}>
      <ul className="space-y-2.5">
        {rows.map((u) => (
          <li key={u.unit}>
            <Link to={`/cases?unit=${u.unit}&lifecycle=active`} className="group grid grid-cols-[70px_1fr_auto] items-center gap-3 text-13">
              <UnitPill code={u.unit} className="justify-self-start" />
              <span className="flex h-3.5 overflow-hidden rounded-full bg-paper" style={{ width: `${Math.max(8, (u.open / max) * 100)}%` }}>
                {u.buckets.map((n, i) => <span key={i} style={{ width: `${(n / Math.max(1, u.open)) * 100}%`, background: AGE_COLORS[i] }} />)}
              </span>
              <span className="whitespace-nowrap text-muted"><strong className="text-ink-950">{u.open}</strong>{u.overdue > 0 && <> · <strong className="text-tape">{u.overdue}</strong> late</>}</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-12 text-muted">
        {AGEING.map((b, i) => <span key={b.label} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: AGE_COLORS[i] }} />{b.label.replace(' d', ' days old')}</span>)}
      </div>
      <UnitKey className="mt-2" />
    </ChartPanel>
  )
}

/** Regions as a heat map of tiles: the deeper the blue, the more open cases. */
function RegionHeat({ d }: { d: Dash }) {
  const rows = d.regions
  const max = Math.max(1, ...rows.map((r) => r.count))
  const top = rows[0]
  return (
    <ChartPanel title="Open cases by region of the institution"
      note="A deeper blue means more open cases. “Unmatched” cases are not yet linked to an institution, so they have no region."
      insight={top ? `${top.region} has the most open cases (${top.count} of ${rows.reduce((n, r) => n + r.count, 0)}).` : 'There are no open cases.'}
      summary={rows.map((r) => `${r.region}: ${r.count}`).join('; ')}
      table={{ columns: ['Region', 'Open cases'], rows: rows.map((r) => [r.region, r.count]) }}>
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {rows.map((r) => {
          const k = r.count / max
          return (
            <li key={r.region}>
              <Link to={r.region === 'Unmatched' ? '/cases?match=unresolved' : `/cases?region=${encodeURIComponent(r.region)}&lifecycle=active`} className="group flex h-full min-h-[76px] flex-col justify-between rounded-xl p-3 transition hover:-translate-y-0.5 hover:shadow-md"
                style={{ background: r.region === 'Unmatched' ? '#EEF0F4' : `rgba(41,82,204,${0.1 + k * 0.78})`, color: k > 0.5 && r.region !== 'Unmatched' ? '#fff' : C.ink }}>
                <span className="text-12 font-medium group-hover:underline">{r.region}</span>
                <span className="font-display text-24 font-semibold leading-none">{r.count}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </ChartPanel>
  )
}


// ---------------------------------------------------------------- closing section: where every case is now
const FLOW_NODES = [
  { key: 'received', label: STAGE_LABEL.received, hint: STAGE_HELP.received, color: C.blueFaint, text: C.ink },
  { key: 'under_examination', label: STAGE_LABEL.under_examination, hint: STAGE_HELP.under_examination, color: C.blueLight, text: C.ink },
  { key: 'awaiting_party', label: STAGE_LABEL.awaiting_party, hint: STAGE_HELP.awaiting_party, color: C.blueMid, text: C.ink },
  { key: 'inspection_hearing', label: STAGE_LABEL.inspection_hearing, hint: STAGE_HELP.inspection_hearing, color: C.blue, text: '#fff' },
  { key: 'escalated', label: STAGE_LABEL.escalated, hint: STAGE_HELP.escalated, color: C.saffronFill, text: C.ink },
  { key: 'disposed', label: STAGE_LABEL.disposed, hint: STAGE_HELP.disposed, color: C.good, text: '#fff' },
  { key: 'transferred', label: STAGE_LABEL.transferred, hint: STAGE_HELP.transferred, color: C.stamp, text: C.ink },
] as const

/** The journey of a case, step by step, with the two ways a case can leave the main path shown apart. */
function CaseFlow({ d }: { d: Dash }) {
  const counts: Record<string, number> = { disposed: d.disposed, transferred: d.transferred }
  for (const p of d.pipeline) counts[p.stage] = p.count
  const nodes = FLOW_NODES.map((n) => ({ ...n, count: counts[n.key] ?? 0 }))
  const total = nodes.reduce((n, x) => n + x.count, 0) || 1
  const path = nodes.filter((n) => ['received', 'under_examination', 'awaiting_party', 'inspection_hearing', 'disposed'].includes(n.key))
  const exits = nodes.filter((n) => n.key === 'escalated' || n.key === 'transferred')
  const open = nodes.filter((n) => !['disposed', 'transferred'].includes(n.key)).reduce((n, x) => n + x.count, 0)
  const pct = (n: number) => Math.round((n / total) * 100)
  const late = d.overdue
  const busiest = [...path.filter((n) => n.key !== 'disposed')].sort((a, b) => b.count - a.count)[0]

  return (
    <ChartPanel
      title="Where every case is now, from New to Closed"
      note="The main path a case takes, left to right. Every case is in exactly one place, so the numbers add up to all cases. Select a step to see its cases."
      insight={`${pct(d.disposed)}% of all cases are closed and ${pct(open)}% are still open. Most open cases are in the stage “${busiest.label}” (${busiest.count})${late ? `, and ${late} open cases are past their time limit` : ''}.`}
      summary={nodes.map((n) => `${n.label}: ${n.count}`).join('; ') + `. ${late} open cases are past the time limit.`}
      table={{ columns: ['Where the case is', 'Cases', 'Share'], rows: nodes.map((n) => [n.label, n.count, `${pct(n.count)}%`]) }}>
      {/* one bar: the whole caseload, split by where each case is */}
      <div className="flex h-3 overflow-hidden rounded-full bg-paper" role="img" aria-label={`Share of all ${total} cases by where they are`}>
        {nodes.map((n) => n.count > 0 && <span key={n.key} title={`${n.label}: ${n.count}`} style={{ width: `${(n.count / total) * 100}%`, background: n.color }} />)}
      </div>

      <ol className="mt-5 grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr] md:items-stretch" aria-label="The main path of a case">
        {path.flatMap((n, i) => {
          const card = (
            <li key={n.key} className="md:contents">
              <Link to={`/cases?lifecycle=${n.key}`} className="group relative block min-w-0 overflow-hidden rounded-2xl border border-line bg-surface p-4 transition hover:-translate-y-0.5 hover:shadow-lg md:col-span-1">
                <span className="absolute inset-x-0 top-0 h-1.5" style={{ background: n.color }} aria-hidden />
                <span className="flex items-center gap-2 text-12 font-medium text-muted"><span className="flex h-5 w-5 items-center justify-center rounded-full text-11 font-semibold" style={{ background: n.color, color: n.text }} aria-hidden>{i + 1}</span>{n.key === 'disposed' ? 'Finished' : `Step ${i + 1}`}</span>
                <span className="mt-2 block font-display text-34 font-semibold leading-none text-ink-950"><CountUp value={n.count} /></span>
                <span className="mt-1.5 block text-14 font-semibold text-ink-950 group-hover:underline">{n.label}</span>
                <span className="block text-12 leading-snug text-muted">{n.hint}</span>
                <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-paper"><span className="grow-x block h-full rounded-full" style={{ width: `${Math.max(pct(n.count), n.count ? 4 : 0)}%`, background: n.color }} /></span>
                <span className="mt-1 block text-right font-mono text-11 text-muted">{pct(n.count)}% of all</span>
              </Link>
            </li>
          )
          return i < path.length - 1 ? [card, <li key={`a-${n.key}`} aria-hidden className="hidden items-center justify-center text-ink-500 md:flex"><ArrowRight size={20} /></li>] : [card]
        })}
      </ol>

      {/* the two ways out of the main path */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {exits.map((n) => (
          <Link key={n.key} to={`/cases?lifecycle=${n.key}`} className="group flex items-center gap-4 rounded-2xl border border-dashed border-ink-500/50 bg-paper/60 p-4 transition hover:bg-paper">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ background: n.color, color: n.text }} aria-hidden>{n.key === 'escalated' ? <ArrowUpRight size={22} /> : <CornerUpRight size={22} />}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-14 font-semibold text-ink-950 group-hover:underline">{n.label}</span>
              <span className="block text-12 leading-snug text-muted">{n.key === 'escalated' ? 'Leaves the main path: needs someone senior' : 'Leaves the main path: sent to another unit'}. {n.key === 'transferred' ? 'Counted apart from disposals.' : ''}</span>
            </span>
            <span className="text-right"><span className="block font-display text-28 font-semibold leading-none text-ink-950"><CountUp value={n.count} /></span><span className="font-mono text-11 text-muted">{pct(n.count)}% of all</span></span>
          </Link>
        ))}
      </div>
    </ChartPanel>
  )
}

/** Is the data current? One chip per source unit, so a silent unit stands out instead of being a line of small print. */
function SourcesStrip({ d }: { d: Dash }) {
  const srcs = d.sources
  const stale = srcs.filter((x) => x.stale)
  const age = (h: number) => (h >= 48 ? `${Math.floor(h / 24)} days ago` : h >= 1 ? `${h}h ago` : 'just now')
  return (
    <section aria-label="Data freshness" className="rounded-panel border border-line bg-surface p-5 shadow-card">
      <h2 className="font-display text-17 font-semibold text-ink-950">When each unit last sent its cases</h2>
      <p className="mt-0.5 text-13 text-muted">Every unit keeps its cases in its own system and sends them to Ekatra. A unit that has not sent anything for over a day is marked, because its numbers here may be out of date.</p>
      <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {srcs.map((x) => (
          <li key={x.unit} className={clsx('flex items-center gap-2.5 rounded-xl border px-3 py-2', x.stale ? 'border-turmeric/40 bg-turmeric-soft' : 'border-line bg-paper')}>
            <span className={clsx('h-2.5 w-2.5 shrink-0 rounded-full', x.stale ? 'bg-turmeric' : 'bg-good')} aria-hidden />
            <span className="min-w-0 leading-tight"><span className="block text-13 font-semibold text-ink-950">{x.unit}</span><span className={clsx('block text-12', x.stale ? 'font-medium text-turmeric' : 'text-muted')}>{age(x.hoursAgo)}{x.stale ? ' · silent' : ''}</span></span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-ink-50 px-4 py-3 text-14 leading-snug text-ink-950"><Lightbulb size={17} className="mt-0.5 shrink-0 text-ink-700" aria-hidden /><p><span className="font-semibold">What this shows. </span>{stale.length ? <>{stale.map((x, i) => <span key={x.unit}>{i > 0 && ', '}<UnitPill code={x.unit} /></span>)} {stale.length === 1 ? 'has' : 'have'} not sent cases for over a day, so numbers from {stale.length === 1 ? 'that unit' : 'those units'} may be behind.</> : `All ${srcs.length} units sent their cases within the last day, so these numbers are current.`}</p></div>
    </section>
  )
}

export function DashCharts() {
  const q = useQuery({ queryKey: ['dashboard', {}], queryFn: () => api.dashboard() })
  if (q.isError) return null
  if (!q.data) return <div className="grid gap-6 xl:grid-cols-[2fr_1fr]" aria-busy="true"><Skeleton className="h-96" /><Skeleton className="h-96" /></div>
  const d = q.data
  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]"><FlowChart d={d} /><StageFunnel d={d} /></div>
      <div className="grid gap-6 xl:grid-cols-3"><WorkloadBars d={d} /><AgeBars d={d} /><RegionHeat d={d} /></div>
    </div>
  )
}

/** The last thing on the dashboard: where every case is now, and whether the data behind it is current. */
export function DashClosing() {
  const q = useQuery({ queryKey: ['dashboard', {}], queryFn: () => api.dashboard() })
  if (!q.data) return <Skeleton className="h-96" />
  return <div className="space-y-6"><CaseFlow d={q.data} /><SourcesStrip d={q.data} /></div>
}
