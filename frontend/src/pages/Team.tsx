// Who is working on what: first, institutions you handle where someone else also has an open case (so work is not
// done twice); then every department's open work by officer. No complainant details are shown.
import { useDeferredValue, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, Users } from 'lucide-react'
import clsx from 'clsx'
import { work, SERVER_ONLY, type WorkItem } from '../lib/workApi'
import { UnitPill } from '../components/Unit'
import { ServerOnly } from '../components/WorkBits'
import Avatar from '../components/Avatar'
import { Empty, ErrorBox, PageHead, Panel, Skeleton, fmtShort } from '../components/ui'

export default function Team() {
  const [sp] = useSearchParams()
  const [text, setText] = useState('')
  const q = useDeferredValue(text.trim())
  const [unit, setUnit] = useState(sp.get('unit') ?? '')
  const r = useQuery({ queryKey: ['people', q], queryFn: () => work.people(q || undefined), enabled: !SERVER_ONLY, placeholderData: (p) => p })
  if (SERVER_ONLY) return <><PageHead icon={<Users size={22} />} title="Who is working on what" /><ServerOnly /></>
  const d = r.data
  const units = d?.units.filter((u) => !unit || u.unit === unit) ?? []
  return (
    <>
      <PageHead icon={<Users size={22} />} title="Who is working on what" lead="Check before you start work on an institution." />

      {d && d.alsoOnMine.length > 0 && !q && (
        <Panel title={`Also on your institutions (${d.alsoOnMine.length})`} note="Someone else has an open case here.">
          <ul className="divide-y divide-line">{d.alsoOnMine.map((a) => (
            <li key={a.institutionId} className="grid gap-x-6 gap-y-2 py-3 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_minmax(0,1fr)]">
              <div>
                <Link to={`/institutions/${a.institutionId}`} className="font-medium text-ink-950 hover:underline">{a.institution}</Link>
                {a.sameIssue && <p className="text-12 font-medium text-turmeric">Same issue</p>}
              </div>
              <div><p className="text-12 text-muted">You</p><ul>{a.mine.map((i) => <Row key={i.caseId} i={i} line={i.issue} />)}</ul></div>
              <div><p className="text-12 text-muted">Others</p><ul>{a.others.map((i) => <Row key={i.caseId} i={i} line={`${i.unit} · ${i.officer ?? 'not marked yet'}`} sub={i.issue} />)}</ul></div>
            </li>))}</ul>
        </Panel>
      )}

      <Panel className="mt-6" title="Open work by department" action={
        <div className="flex flex-wrap gap-2">
          <select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Department" className="rounded-full border border-line bg-surface px-3 py-2 text-13">
            <option value="">All departments{d ? ` (${d.total})` : ''}</option>
            {d?.units.map((u) => <option key={u.unit} value={u.unit}>{u.unit} ({u.open})</option>)}
          </select>
          <label className="relative block w-64 max-w-full">
            <span className="sr-only">Search</span>
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search institution or officer" className="w-full rounded-full border border-line py-2 pl-9 pr-4 text-13 focus:border-ink-500 focus:outline-none" />
          </label>
        </div>}>
        {r.isLoading && <Skeleton className="h-64" />}
        {r.isError && <ErrorBox error={r.error} />}
        {d && !units.length && <Empty title="Nobody is working on that" />}
        <div className="space-y-6">{units.map((u) => (
          <section key={u.unit}>
            <h3 className="flex items-center gap-2 text-15 font-semibold text-ink-950"><UnitPill code={u.unit} />{u.name}<span className="font-normal text-muted">· {u.open} open</span></h3>
            <ul className="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{u.officers.map((o) => {
              const none = o.name.startsWith('Not yet')
              const late = o.items.filter((i) => i.late).length
              return (
                <li key={o.name} className="rounded-xl border border-line p-3">
                  <p className="flex items-center gap-2.5">
                    {none ? <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-50 text-12 text-muted">?</span> : <Avatar name={o.name} size={32} />}
                    <span className={clsx('font-medium', none ? 'text-muted' : 'text-ink-950')}>{o.name}</span>
                    <span className="ml-auto text-12 text-muted">{o.items.length} open{late ? <span className="text-tape"> · {late} late</span> : ''}</span>
                  </p>
                  <ul className="mt-2">{o.items.slice(0, 5).map((i) => <Row key={i.caseId} i={i} line={i.institution} sub={`${i.issue} · ${i.stage}`} />)}</ul>
                  {o.items.length > 5 && <p className="mt-1 px-2 text-12 text-muted">and {o.items.length - 5} more</p>}
                </li>)
            })}</ul>
          </section>))}</div>
      </Panel>
    </>
  )
}

function Row({ i, line, sub }: { i: WorkItem; line: string; sub?: string }) {
  return (
    <li>
      <Link to={`/cases/${i.caseId}`} className="block rounded-lg px-2 py-1.5 hover:bg-ink-50">
        <span className="flex items-baseline gap-2 text-13">
          <span className="truncate text-ink-950">{line}</span>
          <span className={clsx('ml-auto shrink-0 text-12', i.late ? 'font-semibold text-tape' : 'text-muted')}>{i.late ? 'late' : `due ${fmtShort(i.dueOn)}`}</span>
        </span>
        {sub && <span className="block truncate text-12 text-muted">{sub}</span>}
      </Link>
    </li>
  )
}
