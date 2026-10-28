// Assign work: the nodal officer marks each case to a named officer, seeing everyone's load first.
// Ekatra shows the load; the nodal officer chooses. Moving a case from one officer to another needs a reason.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { UserCheck } from 'lucide-react'
import clsx from 'clsx'
import { api } from '../lib/api'
import { useUser } from '../hooks/useUser'
import { work, SERVER_ONLY, type Allocation as Board } from '../lib/workApi'
import { categoryLabel } from '../lib/labels'
import { ServerOnly } from '../components/WorkBits'
import Avatar from '../components/Avatar'
import { Button, Empty, ErrorBox, PageHead, Panel, Skeleton, fmtDate } from '../components/ui'

export default function Allocation() {
  const { user } = useUser()
  const meta = useQuery({ queryKey: ['meta'], queryFn: api.meta })
  const [unit, setUnit] = useState(user.unit ?? 'PGRC')
  const q = useQuery({ queryKey: ['allocation', unit], queryFn: () => work.allocation(unit), enabled: !SERVER_ONLY })
  if (SERVER_ONLY) return <><PageHead icon={<UserCheck size={22} />} title="Assign work" /><ServerOnly /></>
  const b = q.data
  const units = (meta.data as { units?: { code: string }[] } | undefined)?.units ?? []
  return (
    <>
      <PageHead icon={<UserCheck size={22} />} title="Assign work"
        lead="The nodal officer marks each case to one officer."
        stats={b ? [
          { label: 'Cases nobody holds', value: b.unassigned.length, tone: b.unassigned.length ? 'amber' : undefined },
          { label: 'Officers in the unit', value: b.officers.length },
          { label: 'Late cases held', value: b.officers.reduce((a, o) => a + o.late, 0), tone: 'red' },
          { label: 'Due this week', value: b.officers.reduce((a, o) => a + o.dueThisWeek, 0) },
        ] : undefined}>
        {!user.unit && (
          <label className="text-13 text-muted">Unit <select className="ml-2 rounded-full border border-line px-3 py-1.5 text-14 text-ink-950" value={unit} onChange={(e) => setUnit(e.target.value)}>
            {units.map((u) => <option key={u.code}>{u.code}</option>)}</select></label>
        )}
      </PageHead>
      {q.isLoading && <Skeleton className="h-72" />}
      {q.isError && <ErrorBox error={q.error} />}
      {b && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <Panel title="Who holds what" note="Open cases per officer. Red: past the time limit. Amber: due within 7 days.">
            <Load b={b} />
          </Panel>
          <Panel title={`Cases nobody holds (${b.unassigned.length})`} note={b.canMark ? `Earliest time limit first. ${b.rule}` : 'Only the nodal officer of the unit, or the coordinator, can mark cases.'}>
            {!b.unassigned.length && <Empty title="Every open case has an officer" />}
            <ul className="space-y-3">{b.unassigned.map((c) => <MarkRow key={c.id} c={c} b={b} />)}</ul>
          </Panel>
        </div>
      )}
    </>
  )
}

function Load({ b }: { b: Board }) {
  const max = Math.max(1, ...b.officers.map((o) => o.open))
  return (
    <ul className="space-y-4">{b.officers.map((o) => {
      const rest = o.open - o.late - o.dueThisWeek
      return (
        <li key={o.name}>
          <div className="flex items-center gap-3">
            <Avatar name={o.name} />
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline justify-between gap-2"><span className="truncate font-medium text-ink-950">{o.name}</span><span className="text-13 text-muted">{o.open} open</span></p>
              <div className="mt-1 flex h-2.5 overflow-hidden rounded-full bg-ink-50" style={{ width: `${Math.max(8, (o.open / max) * 100)}%` }} aria-label={`${o.late} late, ${o.dueThisWeek} due this week, ${rest} other`}>
                <span className="bg-tape" style={{ flex: o.late }} /><span className="bg-turmeric" style={{ flex: o.dueThisWeek }} /><span className="bg-ink-500" style={{ flex: rest }} />
              </div>
            </div>
          </div>
          {o.late > 0 && <p className="ml-11 mt-1 text-12 text-tape">{o.late} late: {o.cases.filter((c) => c.state === 'overdue').map((c) => c.uid).join(', ')}</p>}
        </li>
      )
    })}</ul>
  )
}

function MarkRow({ c, b }: { c: Board['unassigned'][number]; b: Board }) {
  const qc = useQueryClient()
  const [to, setTo] = useState('')
  const [note, setNote] = useState('')
  const m = useMutation({ mutationFn: () => work.mark(c.id, to, note), onSuccess: () => qc.invalidateQueries() })
  const d = c.deadline
  return (
    <li className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link to={`/cases/${c.id}`} className="font-mono text-13 underline">{c.uid}</Link>
        <span className="font-medium text-ink-950">{c.institution}</span>
        <span className="text-13 text-muted">{categoryLabel(c.category as never)} · received {fmtDate(c.receivedOn)}</span>
        <span className={clsx('ml-auto rounded-full px-2.5 py-0.5 text-12', d.state === 'overdue' ? 'bg-tape/10 text-tape' : d.state === 'approaching' ? 'bg-turmeric/15 text-ink-950' : 'bg-ink-50 text-ink-900')}>
          {d.state === 'overdue' ? `${-d.daysToDue} days late` : `due ${fmtDate(d.dueOn)}`}</span>
      </div>
      {b.canMark && (
        <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); m.mutate() }}>
          <select className="rounded-full border border-line px-3 py-1.5 text-13" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Mark to">
            <option value="">Mark to…</option>
            {b.officers.map((o) => <option key={o.name} value={o.name}>{o.name} ({o.open} open{o.late ? `, ${o.late} late` : ''})</option>)}
          </select>
          <input className="min-w-[12rem] flex-1 rounded-full border border-line px-4 py-1.5 text-13" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the officer (optional)" aria-label="Note" />
          <Button type="submit" disabled={!to || m.isPending}>Mark</Button>
        </form>
      )}
      {m.isError && <div className="mt-2"><ErrorBox error={m.error} /></div>}
    </li>
  )
}
