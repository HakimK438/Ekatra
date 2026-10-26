// Institutions: the register with what each unit has open about each institution, the next dated step, and a way to run the
// pre-action check. Institutions with no cases are hidden unless you ask for them or search for one by name.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { Building2, GitMerge, Search } from 'lucide-react'
import { api } from '../lib/api'
import { fmtDay } from '../lib/text'
import { UnitPill } from '../components/Unit'
import { Chip, Empty, ErrorBox, PageHead, Skeleton } from '../components/ui'

const monogram = (name: string) => name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w) && !/^(of|and|the|for)$/i.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join('')

export default function Institutions() {
  const [sp, setSp] = useSearchParams()
  const [text, setText] = useState(sp.get('q') ?? '')
  const f = { q: sp.get('q') ?? undefined, region: sp.get('region') ?? undefined, type: sp.get('type') ?? undefined, only: (sp.get('only') as 'overlap' | 'open' | null) ?? undefined }
  const showAll = sp.get('all') === '1'
  const meta = useQuery({ queryKey: ['meta'], queryFn: api.meta })
  const q = useQuery({ queryKey: ['institutions', f], queryFn: () => api.institutions(f), placeholderData: (p) => p })
  const set = (k: string, v?: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n) }
  // Institutions with no case at all are noise on a working screen: shown only on request, or when someone searches for one.
  const rows = (q.data?.rows ?? []).filter((r) => showAll || f.q || r.total > 0)
  const hidden = (q.data?.rows.length ?? 0) - rows.length

  return (
    <>
      <PageHead kind="institutions" icon={<Building2 size={22} />} title="Institutions" lead="Each institution with what every unit has open about it. Those where more than one unit is working come first." />
      <section aria-label="Find an institution" className="mb-5 rounded-panel border border-line bg-surface p-5 shadow-card">
        <form className="flex flex-wrap gap-3" onSubmit={(e) => { e.preventDefault(); set('q', text.trim() || undefined) }}>
          <label className="relative min-w-[260px] flex-1">
            <span className="sr-only">Name, Permanent ID or district</span>
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Name, Permanent ID or district" className="w-full rounded-full border border-line bg-surface py-2.5 pl-10 pr-4 text-14 focus:border-ink-500 focus:outline-none focus:ring-4 focus:ring-ink-100" />
          </label>
          <select aria-label="Region" className="rounded-full border border-line bg-surface px-4 py-2 text-14" value={f.region ?? ''} onChange={(e) => set('region', e.target.value || undefined)}>
            <option value="">All regions</option>{meta.data?.regions.map((r) => <option key={r}>{r}</option>)}
          </select>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip active={f.only === 'overlap'} onClick={() => set('only', f.only === 'overlap' ? undefined : 'overlap')}><GitMerge size={13} className="mr-1 inline" aria-hidden />More than one unit working</Chip>
          <Chip active={f.only === 'open'} onClick={() => set('only', f.only === 'open' ? undefined : 'open')}>Has open cases</Chip>
          <Chip active={showAll} onClick={() => set('all', showAll ? undefined : '1')}>Include institutions with no cases</Chip>
          <span className="mx-1 h-5 w-px self-center bg-line" aria-hidden />
          {q.data?.types.map((t) => <Chip key={t} active={f.type === t} onClick={() => set('type', f.type === t ? undefined : t)}>{t}</Chip>)}
        </div>
      </section>

      {q.isError ? <ErrorBox error={q.error} /> : !q.data ? <Skeleton className="h-96" /> : rows.length === 0 ? (
        <Empty title="No institution matches"><button className="font-medium text-ink-700 underline" onClick={() => { setText(''); setSp(new URLSearchParams()) }}>Clear the search</button> to see all.</Empty>
      ) : (
        <>
          <p className="mb-2 text-13 text-muted">{rows.length} {rows.length === 1 ? 'institution' : 'institutions'}{hidden > 0 && <> · {hidden} with no cases hidden</>}</p>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((r) => {
              const share = r.total ? Math.round((r.open / r.total) * 100) : 0
              return (
                <li key={r.id} className="group relative flex flex-col overflow-hidden rounded-[20px] border border-line bg-surface shadow-card transition hover:-translate-y-0.5 hover:shadow-lg">
                  <div className="flex items-start gap-3 bg-gradient-to-br from-ink-50 to-surface p-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink-800 font-display text-15 font-semibold text-white" aria-hidden>{monogram(r.name)}</span>
                    <div className="min-w-0">
                      <h2 className="font-display text-16 font-semibold leading-snug text-ink-950"><Link to={`/institutions/${r.id}`} className="hover:underline">{r.name}</Link></h2>
                      <p className="text-12 text-muted">{r.type} · {r.district}, {r.state}</p>
                      <p className="font-mono text-11 text-muted">{r.permanentId} · {r.region} region</p>
                    </div>
                  </div>
                  <div className="flex-1 space-y-3 p-4 pt-3">
                    {r.overlap && <span className="inline-flex items-center gap-1.5 rounded-full bg-turmeric-soft px-2.5 py-1 text-12 font-semibold text-turmeric"><GitMerge size={12} aria-hidden />Overlap to decide</span>}
                    <div>
                      <p className="mb-1.5 flex justify-between text-12 text-muted"><span><strong className="font-mono text-ink-950">{r.open}</strong> open of <span className="font-mono">{r.total}</span> cases</span><span>{share}% open</span></p>
                      <div className="h-2 overflow-hidden rounded-full bg-paper" role="img" aria-label={`${r.open} of ${r.total} cases are open`}><div className="grow-x h-full rounded-full bg-ink-700" style={{ width: `${share}%` }} /></div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {r.units.map((u) => <UnitPill key={u} code={u} className="!px-2 !py-0.5 !text-12" />)}
                      {!r.units.length && <span className="text-13 text-muted">No unit has an open case</span>}
                    </div>
                    {r.overlap && <p className="text-12 text-muted">{r.overlapNote}</p>}
                    <p className="rounded-lg bg-paper px-3 py-2 text-12 text-text">{r.next ? <><span className="text-muted">Next step: </span><strong className="text-ink-950">{fmtDay(r.next.date)}</strong> {r.next.unit} {r.next.what}</> : <span className="text-muted">No dated step booked</span>}</p>
                  </div>
                  <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-13">
                    <Link to={`/institutions/${r.id}`} className="font-medium text-ink-700 hover:underline">Open</Link>
                    <Link to={`/check?inst=${r.id}`} className="font-medium text-ink-700 hover:underline">Before you act</Link>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </>
  )
}
