// Cases: the register. An officer opens it on their own unit's open cases, most urgent first; everyone can widen it.
// One row of filters, quick views for the common questions, and a flags column instead of the six proof circles.
import { useMutation, useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, Files } from 'lucide-react'
import clsx from 'clsx'
import { useUser } from '../hooks/useUser'
import { saveText } from '../lib/download'
import { api } from '../lib/api'
import { Button, Chip, DeadlineBadge, Empty, ErrorBox, PageHead, Skeleton, StatusBadge, fmtShort } from '../components/ui'
import { CaseNo, InstName } from '../components/Ids'
import { UnitPill } from '../components/Unit'
import { CHANNEL_LABEL, DEADLINE_LABEL, STAGE_FILTER, STAGE_LABEL, categoryLabel } from '../lib/labels'
import { initial, plural } from '../lib/text'
import type { CaseFilters } from '../lib/types'

const KEYS = ['q', 'unit', 'region', 'category', 'lifecycle', 'deadline', 'match', 'channel', 'from', 'to', 'sort'] as const
const OFFICERS = ['dealing_officer', 'nodal_officer']
const sel = 'rounded-full border border-line bg-surface px-3.5 py-1.5 text-13 focus:border-ink-500 focus:outline-none focus:ring-4 focus:ring-ink-100'

export default function Cases() {
  const { user } = useUser()
  const [sp, setSp] = useSearchParams()
  // An officer who opens the register with no filters sees their own unit's open cases, most urgent first.
  const byDefault = sp.toString() === '' && !!user.unit && OFFICERS.includes(user.role)
  const filters: CaseFilters = { page: Number(sp.get('page') ?? 1) }
  for (const k of KEYS) { const v = sp.get(k); if (v) (filters as Record<string, unknown>)[k] = v }
  if (byDefault) Object.assign(filters, { unit: user.unit, lifecycle: 'active', sort: 'due' })

  const meta = useQuery({ queryKey: ['meta'], queryFn: api.meta })
  const q = useQuery({ queryKey: ['cases', filters], queryFn: () => api.cases(filters), placeholderData: (p) => p })

  const val = (k: string) => (byDefault ? (filters as Record<string, string>)[k] ?? '' : sp.get(k) ?? '')
  const set = (k: string, v: string) => {
    const n = byDefault ? new URLSearchParams({ unit: user.unit!, lifecycle: 'active', sort: 'due' }) : new URLSearchParams(sp)
    if (v) n.set(k, v); else n.delete(k)
    n.delete('page'); if (!n.toString()) n.set('lifecycle', 'any'); setSp(n)
  }
  const go = (p: number) => { const n = new URLSearchParams(sp); n.set('page', String(p)); setSp(n) }
  const active = KEYS.filter((k) => k !== 'sort' && val(k) && val(k) !== 'any')
  const sort = val('sort') || '-receivedOn'
  const sortBy = (k: string) => set('sort', sort === k ? `-${k}` : k)
  const SortIcon = ({ k }: { k: string }) => sort.replace('-', '') === k ? (sort.startsWith('-') ? <ArrowDown size={12} aria-hidden /> : <ArrowUp size={12} aria-hidden />) : null
  const exp = useMutation({ mutationFn: () => api.exportCases(filters, user), onSuccess: (r) => saveText(r.fileName, r.text) })
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.pageSize)) : 1
  const quick: [string, string][] = [
    ...(user.unit ? [[`${user.unit}: open, most urgent first`, `?unit=${user.unit}&lifecycle=active&sort=due`] as [string, string]] : []),
    ['Late', `?deadline=overdue&sort=due${user.unit ? `&unit=${user.unit}` : ''}`],
    ['Waiting for a reply', '?lifecycle=awaiting_party'],
    ['CPGRAMS, open', '?channel=CPGRAMS&lifecycle=active&sort=due'],
    ['Institution not matched', '?match=unresolved'],
    ['All cases', '?lifecycle=any'],
  ]
  const current = byDefault ? quick[0]?.[1] : `?${sp.toString()}`

  return (
    <>
      <PageHead kind="cases" icon={<Files size={22} />} title="Cases"
        lead={q.data ? `${plural(q.data.total, 'case')}${byDefault ? ` in ${user.unit}: open, most urgent first` : active.length ? ' match these filters' : ' from all units'}.` : 'Every case from every unit, searchable in one list.'}>
        {user.role !== 'admin' && <Button variant="secondary" onClick={() => exp.mutate()} disabled={exp.isPending}><Download size={15} aria-hidden />{exp.isPending ? 'Preparing…' : 'Export this list'}</Button>}
      </PageHead>

      <section aria-label="Filters" className="mb-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-13 text-muted">Quick views:</span>
          {quick.map(([label, qs]) => <Chip key={label} active={current === qs} onClick={() => setSp(new URLSearchParams(qs))}>{label}</Chip>)}
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter the register">
          <label className="relative"><span className="sr-only">Search</span>
            <input defaultValue={sp.get('q') ?? ''} key={sp.get('q') ?? ''} placeholder="Case no., name or Permanent ID" onKeyDown={(e) => { if (e.key === 'Enter') set('q', e.currentTarget.value.trim()) }} className={clsx(sel, 'w-60')} /></label>
          <select aria-label="Unit" className={sel} value={val('unit')} onChange={(e) => set('unit', e.target.value)}><option value="">Any unit</option>{meta.data?.units.map((u) => <option key={u.code} value={u.code}>{u.code}</option>)}</select>
          <select aria-label="Status" className={sel} value={val('lifecycle') === 'any' ? '' : val('lifecycle')} onChange={(e) => set('lifecycle', e.target.value || 'any')}><option value="">Any status</option>{Object.entries(STAGE_FILTER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select aria-label="Time limit" className={sel} value={val('deadline')} onChange={(e) => set('deadline', e.target.value)}><option value="">Any time limit</option>{Object.entries(DEADLINE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select aria-label="Source" className={sel} value={val('channel')} onChange={(e) => set('channel', e.target.value)}><option value="">Any source</option>{Object.entries(CHANNEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select aria-label="Region" className={sel} value={val('region')} onChange={(e) => set('region', e.target.value)}><option value="">Any region</option>{meta.data?.regions.map((r) => <option key={r}>{r}</option>)}</select>
          <select aria-label="Category" className={sel} value={val('category')} onChange={(e) => set('category', e.target.value)}><option value="">Any category</option>{meta.data?.categories.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}</select>
          <select aria-label="Institution match" className={sel} value={val('match')} onChange={(e) => set('match', e.target.value)}><option value="">Any match</option><option value="resolved_auto">Matched automatically</option><option value="resolved_confirmed">Confirmed by a person</option><option value="unresolved">Not matched yet</option></select>
          <details className="relative"><summary className={clsx(sel, 'cursor-pointer list-none')}>Dates</summary>
            <div className="absolute z-10 mt-1 flex gap-2 rounded-xl border border-line bg-surface p-3 shadow-card">
              <label className="text-12 text-muted">Received from<input type="date" className={clsx(sel, 'mt-1 block')} value={val('from')} onChange={(e) => set('from', e.target.value)} /></label>
              <label className="text-12 text-muted">to<input type="date" className={clsx(sel, 'mt-1 block')} value={val('to')} onChange={(e) => set('to', e.target.value)} /></label>
            </div></details>
          {(active.length > 0 || byDefault) && <button className="text-13 font-medium text-ink-700 hover:underline" onClick={() => setSp(new URLSearchParams('lifecycle=any'))}>Show every case</button>}
        </div>
      </section>

      {q.isError ? <ErrorBox error={q.error} /> : !q.data ? (
        <div className="space-y-2" aria-busy="true">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : q.data.items.length === 0 ? (
        <Empty title="No cases match these filters"><button className="font-medium text-ink-700 underline" onClick={() => setSp(new URLSearchParams('lifecycle=any'))}>Show every case</button>.</Empty>
      ) : (
        <>
          <div className="overflow-x-auto rounded-panel border border-line bg-surface shadow-card">
            <table className="w-full min-w-[1040px] text-left text-13">
              <caption className="sr-only">Cases, page {q.data.page} of {pages}</caption>
              <thead className="bg-paper/70 text-12 text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium"><button onClick={() => sortBy('uid')} className="inline-flex items-center gap-1">Case <SortIcon k="uid" /></button></th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Institution</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Unit</th>
                  <th scope="col" className="px-3 py-2.5 font-medium"><button onClick={() => sortBy('receivedOn')} className="inline-flex items-center gap-1">Received <SortIcon k="receivedOn" /></button></th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-3 py-2.5 font-medium"><button onClick={() => set('sort', 'due')} className="inline-flex items-center gap-1">Clock <SortIcon k="due" /></button></th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Officer</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Next action</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Flags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {q.data.items.map((c) => {
                  const overlap = c.proof?.find((p) => p.key === 'overlap')?.state === 'needs_person'
                  const needsMatch = c.matchState === 'pending_review' || c.matchState === 'unresolved'
                  return (
                    <tr key={c.id} className="align-top hover:bg-ink-50">
                      <td className="whitespace-nowrap px-4 py-3"><CaseNo id={c.id} uid={c.uid} /><div className="font-mono text-11 text-muted">{c.sourceComplaintRef ?? c.sourceRef}</div></td>
                      <td className="max-w-[250px] px-3 py-3">
                        {c.institution ? <InstName id={c.institution.id} name={c.institution.name} permanentId={c.institution.permanentId} className="!flex-col !gap-0" /> : <span className="italic text-muted">“{c.recorded.name}”</span>}
                        <div className="mt-0.5 text-12 text-muted">{categoryLabel(c.category)}</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 font-medium"><UnitPill code={c.ownerUnit} /></td>
                      <td className="whitespace-nowrap px-3 py-3">{fmtShort(c.receivedOn)}</td>
                      <td className="px-3 py-3"><StatusBadge s={c.lifecycle} /></td>
                      <td className="whitespace-nowrap px-3 py-3">{c.deadline.state === 'closed' ? <DeadlineBadge d={c.deadline} /> : <><span className="font-mono font-semibold">{c.deadline.age}/{c.deadline.days}</span><div><DeadlineBadge d={c.deadline} /></div></>}</td>
                      <td className="whitespace-nowrap px-3 py-3">{c.officer ? initial(c.officer) : <span className="text-turmeric">None</span>}</td>
                      <td className="max-w-[220px] px-3 py-3 text-muted">{c.nextAction === '—' ? '' : c.nextAction}</td>
                      <td className="px-3 py-3">
                        <ul className="flex flex-wrap gap-1">
                          {overlap && <li className="rounded-full bg-turmeric-soft px-2 py-0.5 text-12 font-medium text-turmeric">Overlap</li>}
                          {needsMatch && <li className="rounded-full bg-turmeric-soft px-2 py-0.5 text-12 font-medium text-turmeric">Needs match</li>}
                          {c.deadline.interimDue && <li className="rounded-full bg-tape-soft px-2 py-0.5 text-12 font-medium text-tape">Interim reply due</li>}
                        </ul>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-13 text-muted">
            <span>Dotted underline: a prototype timeline, not yet approved by AICTE. CPGRAMS cases use the verified 21-day limit. {STAGE_LABEL.escalated} means sent to a higher authority.</span>
            <nav aria-label="Pagination" className="flex items-center gap-2">
              <span>Page {q.data.page} of {pages}</span>
              <Button variant="secondary" disabled={q.data.page <= 1} onClick={() => go(q.data.page - 1)} aria-label="Previous page"><ChevronLeft size={15} /></Button>
              <Button variant="secondary" disabled={q.data.page >= pages} onClick={() => go(q.data.page + 1)} aria-label="Next page"><ChevronRight size={15} /></Button>
            </nav>
          </div>
        </>
      )}
    </>
  )
}
