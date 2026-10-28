// The officer's desk. It asks one question: where are two units about to act on the same institution without knowing it?
// Then what is going late, then what is only being watched. Dense rows, every row naming the other unit and the date.
import { useQuery } from '@tanstack/react-query'
import WorkCells from '../../components/WorkCells'
import { Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import clsx from 'clsx'
import { api } from '../../lib/api'
import { useUser } from '../../hooks/useUser'
import { ROLE_LABEL } from '../../lib/labels'
import { addDays, canActOnCase, canDecide } from '../../lib/logic'
import { ahead } from '../../lib/overlapView'
import { nextStepFor } from '../../lib/solution'
import { fmtDay, plural } from '../../lib/text'
import { CaseNo, InstName } from '../../components/Ids'
import { ErrorBox, Skeleton, btn, fmtShort } from '../../components/ui'
import DecideTable from './DecideTable'
import { Empty1, Section, TableWrap, Th } from './shared'
import { DashCharts, DashClosing, Hero, KpiCards } from './visuals'

const clockText = (days: number) => (days < 0 ? `${plural(-days, 'day')} over the limit` : days === 0 ? 'due today' : days === 1 ? 'due tomorrow' : `due in ${days} days`)

export default function Desk() {
  const { user } = useUser()
  const today = api.today
  const sum = useQuery({ queryKey: ['summary', user.id], queryFn: () => api.summary(user) })
  const ov = useQuery({ queryKey: ['overlaps'], queryFn: api.overlaps })
  const late = useQuery({
    queryKey: ['desk-late', user.id],
    queryFn: async () => {
      const [over, soon] = await Promise.all([api.cases({ unit: user.unit, deadline: 'overdue', sort: 'due', size: 200 }), api.cases({ unit: user.unit, deadline: 'approaching', sort: 'due', size: 200 })])
      return [...over.items, ...soon.items]
    },
  })
  const waiting = useQuery({ queryKey: ['desk-waiting', user.id], queryFn: () => api.cases({ unit: user.unit, lifecycle: 'under_process', sort: 'due', size: 200 }) })

  if (ov.isError || sum.isError || late.isError) return <ErrorBox error={ov.error ?? sum.error ?? late.error} />
  if (!sum.data || !ov.data || !late.data || !waiting.data) return <div className="space-y-4" aria-busy="true"><Skeleton className="h-24" /><Skeleton className="h-64" /><Skeleton className="h-56" /></div>

  const mineOpen = ov.data.open.filter((a) => !user.unit || a.units.includes(user.unit))
  const decide = mineOpen.filter((a) => canDecide(user, a.units)).sort((a, b) => a.dueOn.localeCompare(b.dueOn))
  // Two units acting on one institution in the next two weeks.
  // Each item appears once: an institution already listed under "Agree who leads" is not repeated under "Coming up",
  // and a case that is going late is not repeated under "Waiting on others".
  const decideInst = new Set(decide.map((a) => a.institutionId))
  const clashes = mineOpen.filter((a) => !decideInst.has(a.institutionId)).flatMap((a) => ahead(a.cases, today).clashes.filter((c) => c.from <= addDays(today, 14)).map((c) => ({ a, c }))).sort((x, y) => x.c.from.localeCompare(y.c.from))
  const goingLate = late.data
  const lateIds = new Set(goingLate.map((c) => c.id))
  const watching = waiting.data.items.filter((c) => (c.lifecycle === 'awaiting_party' || c.lifecycle === 'inspection_hearing') && !lateIds.has(c.id))
  const decider = decide.length > 0 || user.role !== 'dealing_officer'

  return (
    <div className="space-y-6">
      <header>
        <p className="text-13 text-muted">{user.name} · {ROLE_LABEL[user.role]}{user.unit ? `, ${user.unit}` : ''}</p>
        <h1 className="font-display text-28 font-semibold leading-tight tracking-[-0.02em] text-ink-950">Dashboard</h1>
        <p className="mt-1 text-15 text-muted">{decide.length} to decide · {clashes.length} {clashes.length === 1 ? 'clash' : 'clashes'} ahead · {goingLate.length} going late · {watching.length} waiting on others. Counts are for {user.unit ?? 'your scope'}.</p>
      </header>

      <Hero s={sum.data} alerts={ov.data.open} today={today} />
      <KpiCards s={sum.data} />
      <DashCharts />
      <WorkCells />


      {decider ? (
        <Section n={1} title="Choose who leads" count={decide.length} tone="amber" hint="Another unit is working on the same institution. Choose who leads.">
          <DecideTable rows={decide} today={today} empty="Nothing waiting for your decision." />
        </Section>
      ) : mineOpen.length > 0 && (
        <Section n={1} title="Clashes on your cases" count={mineOpen.length} tone="amber" hint="Another unit has a case on the same institution. Your nodal officer chooses who leads.">
          <DecideTable rows={mineOpen} today={today} empty="" />
        </Section>
      )}

      <Section n={2} title="Coming up" count={clashes.length} tone="amber" hint="Two units act on one institution within a week of each other, in the next two weeks."
        action={<Link to="/calendar" className="text-13 font-semibold text-ink-700 hover:underline">Open the calendar</Link>}>
        {clashes.length === 0 ? <Empty1>No two units act on the same institution in the same week.</Empty1> : (
          <ul className="divide-y divide-line">
            {clashes.map(({ a, c }) => (
              <li key={`${a.id}-${c.from}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <InstName id={a.institutionId} name={a.institution.name} permanentId={a.institution.permanentId} />
                  <p className="mt-0.5 flex items-start gap-1.5 text-13"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-turmeric" aria-hidden />{c.actions.map((x) => `${fmtDay(x.date)}: ${x.unit} ${x.what}`).join('  ·  ')}</p>
                </div>
                <Link to="/check" className={btn('secondary', '!px-3 !py-1 !text-13')}>Check before acting</Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section n={3} title="Going late" count={goingLate.length} tone="red" hint="Over the limit or close to it, most urgent first. What to do, by when."
        action={<Link to="/deadlines" className="text-13 font-semibold text-ink-700 hover:underline">All deadlines</Link>}>
        {goingLate.length === 0 ? <Empty1>Nothing is late or close to the limit.</Empty1> : (
          <TableWrap min={900}>
            <thead className="border-b border-line text-12 text-muted"><tr><Th>Case</Th><Th>Institution</Th><Th>Clock</Th><Th>What to do</Th><Th><span className="sr-only">Action</span></Th></tr></thead>
            <tbody className="divide-y divide-line">
              {goingLate.slice(0, 8).map((c) => {
                const step = nextStepFor(c)
                const mine = canActOnCase(user, c)
                return (
                  <tr key={c.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3"><CaseNo id={c.id} uid={c.uid} /></td>
                    <td className="max-w-[260px] px-4 py-3">{c.institution ? <InstName id={c.institution.id} name={c.institution.name} permanentId={c.institution.permanentId} className="!flex-col !gap-0" /> : <span className="text-muted">Institution not confirmed</span>}</td>
                    <td className="whitespace-nowrap px-4 py-3"><span className="font-mono font-semibold">{c.deadline.age}/{c.deadline.days}</span> <span className="text-muted">{c.channel === 'CPGRAMS' ? 'CPGRAMS' : 'other source'}</span>
                      <div className={clsx('text-12', c.deadline.state === 'overdue' ? 'font-semibold text-tape' : 'text-turmeric')}>{clockText(c.deadline.daysToDue)}</div></td>
                    <td className="px-4 py-3">{c.deadline.interimDue ? (c.deadline.age === c.deadline.interimDay ? 'Send interim reply today' : 'Send the interim reply') : step?.verb}</td>
                    <td className="px-4 py-3 text-right"><Link to={mine ? `/cases/${c.id}?act=record` : `/cases/${c.id}`} className={btn('secondary', '!px-3 !py-1 !text-13 whitespace-nowrap')}>{mine ? (c.deadline.interimDue ? 'Record interim reply' : 'Record an action') : 'Open'}</Link></td>
                  </tr>
                )
              })}
            </tbody>
          </TableWrap>
        )}
        {goingLate.length > 8 && <p className="border-t border-line px-5 py-2 text-13 text-muted">{goingLate.length - 8} more in <Link to="/deadlines" className="font-medium text-ink-700 hover:underline">Deadlines</Link>.</p>}
      </Section>

      <Section n={4} title="Waiting on others" count={watching.length} hint="Nothing for you to do. These are with the institution or a hearing, and are only being watched.">
        {watching.length === 0 ? <Empty1>Nothing is waiting on anyone else.</Empty1> : (
          <TableWrap min={720}>
            <tbody className="divide-y divide-line">
              {watching.slice(0, 6).map((c) => (
                <tr key={c.id}>
                  <td className="whitespace-nowrap px-4 py-2.5"><CaseNo id={c.id} uid={c.uid} /></td>
                  <td className="max-w-[280px] px-4 py-2.5">{c.institution ? <InstName id={c.institution.id} name={c.institution.name} permanentId={c.institution.permanentId} /> : '—'}</td>
                  <td className="px-4 py-2.5 text-muted">{c.nextAction}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-12 text-muted">{c.scheduled ? fmtShort(c.scheduled.on) : ''}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
        {watching.length > 6 && <p className="border-t border-line px-5 py-2 text-13 text-muted">{watching.length - 6} more in <Link to="/cases?lifecycle=under_process" className="font-medium text-ink-700 hover:underline">Cases</Link>.</p>}
      </Section>


      <DashClosing />
    </div>
  )
}
