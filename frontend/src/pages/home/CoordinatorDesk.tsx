// The coordinator's desk: every overlap waiting for a decision, the name checks holding up overlap checks, and what has been raised.
import { useQuery } from '@tanstack/react-query'
import WorkCells from '../../components/WorkCells'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { useUser } from '../../hooks/useUser'
import { ROLE_LABEL } from '../../lib/labels'
import { deadlineFor } from '../../lib/logic'
import { plural } from '../../lib/text'
import { CaseNo, InstName } from '../../components/Ids'
import { ErrorBox, Skeleton, fmtShort } from '../../components/ui'
import DecideTable from './DecideTable'
import { Empty1, Section, TableWrap, Th } from './shared'
import { DashCharts, DashClosing, Hero, KpiCards } from './visuals'

export default function CoordinatorDesk() {
  const { user } = useUser()
  const today = api.today
  const sum = useQuery({ queryKey: ['summary', user.id], queryFn: () => api.summary(user) })
  const ov = useQuery({ queryKey: ['overlaps'], queryFn: api.overlaps })
  const names = useQuery({ queryKey: ['matching'], queryFn: api.matchingQueue })
  const raised = useQuery({ queryKey: ['deadlines', user.id, 'all'], queryFn: () => api.deadlines(user, '') })
  if (ov.isError || sum.isError) return <ErrorBox error={ov.error ?? sum.error} />
  if (!sum.data || !ov.data || !names.data || !raised.data) return <div className="space-y-4" aria-busy="true"><Skeleton className="h-24" /><Skeleton className="h-64" /><Skeleton className="h-56" /></div>

  const decide = [...ov.data.open].sort((a, b) => a.dueOn.localeCompare(b.dueOn))
  const queue = [...names.data].sort((a, b) => deadlineFor({ ...a } as never, today).daysToDue - deadlineFor({ ...b } as never, today).daysToDue)
  const late = ov.data.open.filter((a) => a.state === 'escalated')
  return (
    <div className="space-y-6">
      <header>
        <p className="text-13 text-muted">{user.name} · {ROLE_LABEL[user.role]}</p>
        <h1 className="font-display text-28 font-semibold leading-tight tracking-[-0.02em] text-ink-950">Dashboard</h1>
        <p className="mt-1 text-15 text-muted">{decide.length} clashes waiting (all units) · {queue.length} names to confirm · {raised.data.raised.length} cases raised to someone senior.</p>
      </header>

      <Hero s={sum.data} alerts={ov.data.open} today={today} />
      <KpiCards s={sum.data} />
      <DashCharts />
      <WorkCells />


      <Section n={1} title="Decide" count={decide.length} tone="amber" hint="Every clash waiting for a decision, soonest decision date first. Late ones are marked.">
        <DecideTable rows={decide} today={today} empty="No clash is waiting for a decision." />
        {late.length > 0 && <p className="border-t border-line px-5 py-2 text-13 text-tape">{plural(late.length, 'overlap')} past the decision date.</p>}
      </Section>

      <Section n={2} title="Names to confirm" count={queue.length} tone="amber" hint="Overlap checks are paused for these cases until the institution is confirmed."
        action={<Link to="/matching" className="text-13 font-semibold text-ink-700 hover:underline">Open the name check</Link>}>
        {queue.length === 0 ? <Empty1>Every case is matched to an institution.</Empty1> : (
          <TableWrap min={720}>
            <thead className="border-b border-line text-12 text-muted"><tr><Th>Case</Th><Th>What the case says</Th><Th>Best match</Th><Th>Clock</Th></tr></thead>
            <tbody className="divide-y divide-line">
              {queue.slice(0, 5).map((c) => { const d = deadlineFor({ ...c } as never, today); const s = c.suggestions[0]; return (
                <tr key={c.id}>
                  <td className="whitespace-nowrap px-4 py-2.5"><CaseNo id={c.id} uid={c.uid} /></td>
                  <td className="px-4 py-2.5">“{c.recorded.name}”</td>
                  <td className="px-4 py-2.5">{s ? <InstName id={s.institutionId} name={s.institution.name} permanentId={s.institution.permanentId} /> : <span className="text-muted">Nothing close</span>}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono">{d.age}/{d.days}</td>
                </tr>) })}
            </tbody>
          </TableWrap>
        )}
      </Section>

      <Section n={3} title="Raised to someone senior" count={raised.data.raised.length} tone="red" hint="Late cases that went past the nodal officer.">
        {raised.data.raised.length === 0 ? <Empty1>Nothing has been raised.</Empty1> : (
          <TableWrap min={720}>
            <tbody className="divide-y divide-line">
              {raised.data.raised.slice(0, 6).map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-4 py-2.5"><CaseNo id={r.id} uid={r.uid} /></td>
                  <td className="max-w-[300px] px-4 py-2.5"><InstName id={r.institutionId} name={r.institution} permanentId={r.permanentId ?? undefined} /></td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted">{r.unit}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-tape">{plural(-r.deadline.daysToDue, 'day')} over · due {fmtShort(r.deadline.dueOn)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Section>


      <DashClosing />
    </div>
  )
}
