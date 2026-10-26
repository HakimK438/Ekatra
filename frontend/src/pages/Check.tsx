// Before you act: pick the institution, say what you are about to do, and get a traffic light that tells you
// whether another unit's open work could clash. It advises only; it never blocks.
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { Search, ShieldCheck } from 'lucide-react'
import { api } from '../lib/api'
import { useUser } from '../hooks/useUser'
import { categoryLabel } from '../lib/labels'
import { CLASH_TABLE, type ActionKind } from '../lib/solution'
import type { Lifecycle } from '../lib/types'
import { LightHero } from '../components/Solution'
import { Chip, ErrorBox, PageHead, Panel, Skeleton, Step } from '../components/ui'

const ACTIONS: { key: string; label: string; action: ActionKind; target?: Lifecycle }[] = [
  { key: 'reply', label: 'Send a notice or ask for a reply', action: 'reply' },
  { key: 'hearing', label: 'Move to inspection or hearing', action: 'stage', target: 'inspection_hearing' },
  { key: 'close', label: 'Close the case', action: 'close' },
  { key: 'transfer', label: 'Transfer the case', action: 'transfer' },
  { key: 'record', label: 'Record a note', action: 'record' },
]

export default function Check() {
  const { user } = useUser()
  const meta = useQuery({ queryKey: ['meta'], queryFn: api.meta })
  const index = useQuery({ queryKey: ['search-index'], queryFn: api.searchIndex })
  const [sp] = useSearchParams()
  const [text, setText] = useState('')
  const [instId, setInstId] = useState<string | null>(null)
  const [actionKey, setActionKey] = useState('reply')
  const [category, setCategory] = useState<string | undefined>()
  const [unit, setUnit] = useState<string | undefined>(user.unit)

  // A link from the institutions list arrives with the institution already chosen.
  const wanted = sp.get('inst')
  useEffect(() => {
    const hit = wanted && index.data?.institutions.find((i) => i.id === wanted)
    if (hit) { setInstId(hit.id); setText(hit.name) }
  }, [wanted, index.data])

  const matches = useMemo(() => {
    const t = text.trim().toLowerCase()
    if (!t || !index.data) return []
    return index.data.institutions.filter((i) => `${i.name} ${i.permanentId}`.toLowerCase().includes(t)).slice(0, 5)
  }, [text, index.data])

  const inst = useQuery({ queryKey: ['institution', instId, user.id], queryFn: () => api.institution(instId!, user), enabled: !!instId })
  const live = inst.data?.lanes.filter((l) => l.lifecycle !== 'disposed' && l.lifecycle !== 'transferred') ?? []
  const categories = [...new Set(live.map((l) => l.category))]
  const chosen = ACTIONS.find((a) => a.key === actionKey)!
  // Start on the issue the open cases are about; "Something else" is one click away.
  useEffect(() => { if (instId && categories.length && category === undefined) setCategory(categories[0]) }, [instId, categories.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps
  const check = useQuery({
    queryKey: ['check', instId, unit, chosen.key, category ?? ''],
    queryFn: () => api.check({ action: chosen.action, institutionId: instId!, unit, category, targetStage: chosen.target }, user),
    enabled: !!instId && !!unit,
  })

  return (
    <>
      <PageHead kind="check" icon={<ShieldCheck size={22} />} title="Before you act" lead="Pick an institution and an action. Ekatra shows which other units have open cases there, and whether any of them handle the same issue." />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="space-y-6">
          <Panel>
            <Step n={1} title="Which institution?" hint="Type a name or Permanent ID." />
            <label className="relative mt-3 block">
              <span className="sr-only">Institution name or Permanent ID</span>
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
              <input value={text} onChange={(e) => { setText(e.target.value); setInstId(null) }} placeholder="For example: Hooghly or 1-2201455"
                className="w-full rounded-full border border-line bg-surface py-2.5 pl-10 pr-4 text-14 focus:border-ink-500 focus:outline-none focus:ring-4 focus:ring-ink-100" />
            </label>
            {matches.length > 0 && !instId && (
              <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
                {matches.map((i) => (
                  <li key={i.id}><button className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-14 hover:bg-ink-50" onClick={() => { setInstId(i.id); setText(i.name); setCategory(undefined) }}>
                    <span className="truncate font-medium text-ink-950">{i.name}</span><span className="shrink-0 font-mono text-12 text-muted">{i.permanentId}</span></button></li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel>
            <Step n={2} title="What are you about to do?" />
            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Action">
              {ACTIONS.map((a) => <Chip key={a.key} active={actionKey === a.key} onClick={() => setActionKey(a.key)}>{a.label}</Chip>)}
            </div>
            {!user.unit && (
              <label className="mt-4 block text-13 font-medium text-text">Your unit
                <select className="mt-1 block rounded-full border border-line bg-surface px-4 py-2 text-14" value={unit ?? ''} onChange={(e) => setUnit(e.target.value || undefined)}>
                  <option value="">Choose a unit</option>{meta.data?.units.map((u) => <option key={u.code}>{u.code}</option>)}
                </select></label>
            )}
            {categories.length > 0 && (
              <div className="mt-4">
                <div className="text-13 font-medium text-text">What is the issue about?</div>
                <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Issue">
                  {categories.map((c) => <Chip key={c} active={category === c} onClick={() => setCategory(c)}>{categoryLabel(c)}</Chip>)}
                  <Chip active={!category} onClick={() => setCategory(undefined)}>Something else</Chip>
                </div>
              </div>
            )}
          </Panel>
        </div>

        <div>
          <Step n={3} title="What Ekatra found" />
          <div className="mt-3">
            {!instId ? <p className="rounded-panel border border-dashed border-line p-5 text-14 text-muted">Choose an institution to see the result.</p>
              : inst.isError ? <ErrorBox error={inst.error} />
              : !inst.data ? <Skeleton className="h-32" />
              : !unit ? <p className="rounded-panel border border-dashed border-line p-5 text-14 text-muted">Choose your unit to see the result.</p>
              : check.isError ? <ErrorBox error={check.error} />
              : check.data && (
                <>
                  <LightHero r={check.data} contacts={check.data.contacts} institution={text} />
                  <Link to={`/institutions/${instId}`} className="mt-3 inline-block text-14 font-semibold text-ink-700 hover:underline">Open the institution page</Link>
                </>
              )}
          </div>
          <details className="mt-6 text-13 text-muted">
            <summary className="cursor-pointer font-medium text-text">What each light means</summary>
            <ul className="mt-2 space-y-2">
              {CLASH_TABLE.map((r) => <li key={r.action}><span className="font-medium text-text">{r.label}.</span> Another unit is active when: {r.amber.toLowerCase()}. Same issue open elsewhere when: {r.red.toLowerCase()}.</li>)}
            </ul>
            <p className="mt-2">Prototype rules, not AICTE-approved. They live in one table so AICTE can change them.</p>
          </details>
        </div>
      </div>
    </>
  )
}
