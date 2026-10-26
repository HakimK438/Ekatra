// Deadlines: the CPGRAMS replies that are due come first (the one rule AICTE is accountable for), then what is late,
// what falls due this week, and who is chasing. Every row names the full institution and has an action.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AlarmClock, BadgeCheck, FlaskConical } from 'lucide-react'
import clsx from 'clsx'
import { api } from '../lib/api'
import { useUser } from '../hooks/useUser'
import { CountUp } from '../hooks/useCountUp'
import { CHANNEL_LABEL } from '../lib/labels'
import { PROTOTYPE_LABEL, SETTINGS, canActOnCase, daysBetween } from '../lib/logic'
import { stageBudgets, stageReading } from '../lib/solution'
import DueStrip from '../components/DueStrip'
import { BudgetBar } from '../components/Solution'
import { CaseNo, InstName } from '../components/Ids'
import { UnitPill } from '../components/Unit'
import { DeadlineBadge, Empty, ErrorBox, PageHead, Panel, Skeleton, fmtDate, fmtShort } from '../components/ui'

type Tab = 'interim' | 'overdue' | 'thisWeek' | 'raised'
const TABS: { key: Tab; label: string; tone: string; title: string; empty: string }[] = [
  { key: 'interim', label: 'CPGRAMS reply due', tone: 'text-turmeric', title: `CPGRAMS: interim reply due (verified ${SETTINGS.cpgramsDays}-day rule)`, empty: 'No CPGRAMS interim reply is due. Nothing to send today.' },
  { key: 'overdue', label: 'Late', tone: 'text-tape', title: 'Late: past the time limit', empty: 'Nothing is late.' },
  { key: 'thisWeek', label: 'Due in 7 days', tone: 'text-turmeric', title: 'Due in the next 7 days', empty: 'Nothing falls due in the next 7 days.' },
  { key: 'raised', label: 'Raised', tone: 'text-tape', title: 'Late cases raised to the nodal officer (7 days over) or senior management (14 days over)', empty: 'No late case has been raised.' },
]
const LEVEL = ['Dealing officer', 'Nodal officer', 'Senior management']
const short = (n: string | null) => (n ? n.replace(/^(\S)\S*\s+/, '$1. ') : 'Not assigned')

export default function Deadlines() {
  const { user } = useUser()
  const meta = useQuery({ queryKey: ['meta'], queryFn: api.meta })
  const [unit, setUnit] = useState<string | undefined>(user.unit)
  const q = useQuery({ queryKey: ['deadlines', user.id, unit ?? 'all'], queryFn: () => api.deadlines(user, unit ?? ''), placeholderData: (p) => p })
  const [tab, setTab] = useState<Tab>('interim')
  const [day, setDay] = useState<string | undefined>()

  return (
    <>
      <PageHead kind="deadlines" icon={<AlarmClock size={22} />} title={`Deadlines${unit ? ` · ${unit}` : ''}`} lead="Checked every hour. Each case has a time limit and a budget for every stage it passes through.">
        <select aria-label="Unit" className="rounded-full border border-line bg-surface px-4 py-2 text-14" value={unit ?? ''} onChange={(e) => { setUnit(e.target.value || undefined); setDay(undefined) }}>
          <option value="">All units</option>{meta.data?.units.map((u) => <option key={u.code} value={u.code}>{u.code}</option>)}
        </select>
      </PageHead>
      {q.isError ? <ErrorBox error={q.error} /> : !q.data ? <Skeleton className="h-96" /> : (() => {
        const d = q.data
        const rows = day ? d.all.filter((r) => r.deadline.dueOn === day) : d[tab]
        const busiest = [...d.strip].sort((a, b) => b.count - a.count)[0]
        const cur = TABS.find((t) => t.key === tab)!
        return (
          <>
            <section aria-label="Clocks" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {TABS.map((t) => (
                <button key={t.key} onClick={() => { setTab(t.key); setDay(undefined) }} aria-pressed={tab === t.key && !day}
                  className={clsx('rounded-panel border bg-surface p-4 text-left shadow-card transition', tab === t.key && !day ? 'border-ink-700 ring-2 ring-ink-100' : 'border-line hover:border-ink-500')}>
                  <div className="flex items-center gap-1.5 text-13 text-muted">{t.label}{t.key === 'interim' && <BadgeCheck size={14} className="text-good" aria-label="Verified rule" />}</div>
                  <div className={clsx('font-display text-32 font-semibold', d[t.key].length ? t.tone : 'text-ink-950')}><CountUp value={d[t.key].length} /></div>
                </button>
              ))}
            </section>

            <Panel className="mb-6" title={busiest?.count ? `${fmtShort(busiest.date)} is the busiest day ahead: ${busiest.count} ${busiest.count === 1 ? 'case falls' : 'cases fall'} due` : 'Nothing falls due in the next 30 days'}
              note="One bar per day. Select a day to list its cases.">
              <DueStrip days={d.strip} selected={day} onSelect={setDay} />
            </Panel>

            <Panel title={day ? `Due on ${fmtDate(day)}` : cur.title} note={day ? <button className="text-ink-700 hover:underline" onClick={() => setDay(undefined)}>Show the list again</button> : `${rows.length} ${rows.length === 1 ? 'case' : 'cases'}${d.unit ? ` in ${d.unit}` : ' across all units'}`}>
              {rows.length === 0 ? <Empty title={day ? 'Nothing due that day.' : cur.empty} /> : (
                <div className="-mx-6 -mb-6 overflow-x-auto">
                  <table className="w-full min-w-[1040px] text-left text-13">
                    <thead className="border-b border-line text-12 text-muted"><tr>
                      <th className="px-6 py-2 font-medium">Case</th><th className="px-3 py-2 font-medium">Institution</th><th className="px-3 py-2 font-medium">Source</th><th className="px-3 py-2 font-medium">Day</th>
                      <th className="px-3 py-2 font-medium">Where it is stuck</th><th className="px-3 py-2 font-medium">Officer</th><th className="px-3 py-2 font-medium">{tab === 'raised' ? 'Raised to' : 'Action'}</th>
                    </tr></thead>
                    <tbody className="divide-y divide-line">
                      {rows.map((r) => {
                        const b = stageBudgets(r.deadline.days, r.stage, daysBetween(r.stageSince, api.today))
                        const mine = canActOnCase(user, { ownerUnit: r.unit })
                        return (
                          <tr key={r.id} className="align-top hover:bg-ink-50/50">
                            <td className="whitespace-nowrap px-6 py-3"><CaseNo id={r.id} uid={r.uid} /><div className="mt-0.5"><UnitPill code={r.unit} className="!px-1.5 !py-0 !text-12" /></div></td>
                            <td className="max-w-[260px] px-3 py-3"><InstName id={r.institutionId} name={r.institution} permanentId={r.permanentId ?? undefined} className="!flex-col !gap-0" /></td>
                            <td className="px-3 py-3">
                              <div className="whitespace-nowrap">{CHANNEL_LABEL[r.channel]}</div>
                              <div className={clsx('inline-flex items-center gap-1 text-12', r.deadline.verified ? 'text-good' : 'text-turmeric')} title={r.deadline.verified ? r.deadline.basis : PROTOTYPE_LABEL}>
                                {r.deadline.verified ? <><BadgeCheck size={12} aria-hidden />{r.deadline.days}-day rule, verified</> : <><FlaskConical size={12} aria-hidden />{r.deadline.days} days, prototype</>}
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-3 py-3"><span className="font-mono font-semibold">{r.deadline.age}/{r.deadline.days}</span><div className="mt-0.5"><DeadlineBadge d={r.deadline} /></div></td>
                            <td className="w-[210px] px-3 py-3">
                              <BudgetBar budgets={b} labels={false} />
                              <div className={clsx('mt-1 text-12', b.some((x) => x.lateDays) ? 'font-medium text-tape' : 'text-muted')}>{stageReading(b)}</div>
                            </td>
                            <td className="whitespace-nowrap px-3 py-3">{short(r.officer)}</td>
                            <td className="px-3 py-3">
                              {tab === 'raised' ? (
                                <ol className="flex items-center gap-1" aria-label={`Raised to: ${LEVEL[r.escalation.level]}`}>
                                  {LEVEL.map((l, i) => <li key={l} title={l} className={clsx('h-2 w-5 rounded-full', i <= r.escalation.level ? (i === 0 ? 'bg-ink-700' : 'bg-tape') : 'bg-line')} />)}
                                  <span className="ml-2 whitespace-nowrap text-12">{LEVEL[r.escalation.level]}</span>
                                </ol>
                              ) : (
                                <Link to={mine ? `/cases/${r.id}?act=record` : `/cases/${r.id}`} className="inline-flex whitespace-nowrap rounded-full border border-ink-500 bg-surface px-3 py-1 text-13 font-medium text-ink-800 hover:bg-ink-50">
                                  {mine ? (r.deadline.interimDue ? 'Record interim reply' : 'Record an action') : 'Open case'}
                                </Link>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
            <p className="mt-3 text-12 text-muted">Only the {SETTINGS.cpgramsDays}-day CPGRAMS rule is verified. Other sources use {SETTINGS.defaultDays} days, and the stage budgets are a prototype split of the time limit, not AICTE-approved. Late cases are raised to the nodal officer after {SETTINGS.escalateAfterOverdue} days and to senior management after {SETTINGS.escalateAfterOverdue * 2} days.</p>
          </>
        )
      })()}
    </>
  )
}
