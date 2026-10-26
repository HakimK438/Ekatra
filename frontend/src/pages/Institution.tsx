import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useUser } from '../hooks/useUser'
import { api, EXTRA } from '../lib/api'
import CaseLanes from '../components/CaseLanes'
import InstitutionHub from '../components/InstitutionHub'
import { Button, DeadlineBadge, ErrorBox, PANEL_BLEED, Panel, SeverityMark, Skeleton, StatusBadge, btn, fmtDate } from '../components/ui'
import { UnitKey, UnitPill } from '../components/Unit'
import { DECISION_LABEL, ID_LABEL, categoryLabel, unitFull } from '../lib/labels'
import { isActive } from '../lib/logic'

export default function Institution() {
  const { id = '' } = useParams()
  const { user } = useUser()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['institution', id, user.id], queryFn: () => api.institution(id, user) })
  const watch = useMutation({ mutationFn: () => api.toggleWatch(id, user), onSuccess: () => qc.invalidateQueries() })
  if (q.isError) return <ErrorBox error={q.error} />
  if (!q.data) return <div className="space-y-4" aria-busy="true"><Skeleton className="h-20" /><Skeleton className="h-60" /></div>
  const i = q.data
  // Same definition as the dashboard's "Open": not disposed and not transferred away.
  const open = i.cases.filter(isActive).length

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-13 text-muted"><Link to="/institutions" className="hover:underline">Institutions</Link> <span aria-hidden>/</span> {i.permanentId}</nav>
      <header className="mb-8 overflow-hidden rounded-panel border border-line bg-surface shadow-card">
        <div className="p-6 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="font-display text-28 font-semibold leading-tight text-ink-950">{i.name}</h1>
            {EXTRA && user.role !== 'admin' && <Button variant={i.watching ? 'primary' : 'secondary'} className="!py-1.5 !text-13" onClick={() => watch.mutate()} disabled={watch.isPending} aria-pressed={i.watching}>{i.watching ? <><EyeOff size={14} aria-hidden />Stop watching</> : <><Eye size={14} aria-hidden />Watch</>}</Button>}
          </div>
          <p className="mt-1 text-14 text-muted">{i.type} institution · {i.district}, {i.state} ({i.region} region) · PIN {i.pin}</p>
          <p className="mt-1 text-14 text-muted">Permanent ID <span className="font-mono font-semibold text-ink-950">{i.permanentId}</span></p>
          <div className="mt-5 flex flex-wrap gap-3">
            <div className="rounded-2xl bg-paper px-4 py-3"><div className="font-display text-24 font-semibold text-ink-950">{i.cases.length}</div><div className="text-12 text-muted">cases on record</div></div>
            <div className="rounded-2xl bg-paper px-4 py-3"><div className="font-display text-24 font-semibold text-ink-950">{open}</div><div className="text-12 text-muted">open now</div></div>
            <div className={`rounded-2xl px-4 py-3 ${i.openUnits.length > 1 ? 'bg-tape-soft' : 'bg-paper'}`}><div className={`font-display text-24 font-semibold ${i.openUnits.length > 1 ? 'text-tape' : 'text-ink-950'}`}>{i.openUnits.length}</div><div className="text-12 text-muted">{i.openUnits.length === 1 ? 'unit working on it' : 'units working on it'}{i.openUnits.length ? `: ${i.openUnits.join(', ')}` : ''}</div></div>
          </div>
        </div>
      </header>

      <InstitutionHub name={i.name} cases={i.cases} today={api.today} className="mb-6" />

      {i.issue && (
        <section aria-label="Active issue" className="mb-6 rounded-panel border border-turmeric/30 bg-turmeric-soft/50 p-5">
          <p className="text-12 font-semibold text-turmeric">Active issue</p>
          <h2 className="font-display text-20 font-semibold text-ink-950">{i.issue}</h2>
          <ul className="mt-2 space-y-2">
            {i.stories.filter((s) => !s.decided).map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 text-14 text-text">
                <span className="max-w-3xl">{s.story}</span>
                <Link to={`/overlaps/${encodeURIComponent(s.id)}`} className={btn('primary', '!px-4 !py-1.5 !text-13')}>View analysis</Link>
              </li>
            ))}
            {!i.stories.some((s) => !s.decided) && <li className="text-14 text-muted">No overlap is waiting for a decision at this institution.</li>}
          </ul>
        </section>
      )}
      <UnitKey className="mb-6" />

      <div className="grid gap-8 xl:grid-cols-[1fr_340px]">
        <div className="space-y-8">
          <Panel title="Who holds what" note="Open cases, grouped by the unit that owns them.">
            <div className="space-y-6">
              {i.openUnits.length === 0 && <p className="text-14 text-muted">No open cases at this institution.</p>}
              {i.openUnits.map((u) => (
                <section key={u} aria-label={unitFull(u)}>
                  <h3 className="mb-2 flex flex-wrap items-center gap-2 font-display text-15 font-semibold text-ink-950"><UnitPill code={u} />{unitFull(u)}</h3>
                  <ul className="divide-y divide-line rounded-xl border border-line">
                    {i.cases.filter((c) => c.ownerUnit === u && isActive(c)).map((c) => (
                      <li key={c.id} className="grid gap-x-4 gap-y-1 px-4 py-3 text-13 md:grid-cols-[1fr_auto]">
                        <div className="min-w-0">
                          <Link to={`/cases/${c.id}`} className="font-mono font-semibold text-ink-950 hover:underline">{c.uid}</Link>
                          <span className="ml-2 text-muted">{categoryLabel(c.category)}</span>
                          <p className="mt-0.5 text-text">{c.summary}</p>
                          <p className="mt-1 text-muted">Last: {c.lastAction} ({fmtDate(c.lastActionOn)}) · Next: {c.nextAction}{c.officer ? ` · ${c.officer}` : ''}</p>
                        </div>
                        <div className="flex flex-wrap items-start gap-2 md:flex-col md:items-end"><StatusBadge s={c.lifecycle} /><DeadlineBadge d={c.deadline} /></div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
            <details className="mt-6">
              <summary className="cursor-pointer text-13 font-medium text-ink-700">Show the timeline chart</summary>
              <div className="pt-5"><CaseLanes lanes={i.lanes} today={api.today} highlight={i.alerts.filter((a) => !a.decided).length ? i.lanes.filter((l) => !l.end).map((l) => l.id) : []} legend /></div>
            </details>
          </Panel>

          <Panel title="All cases on record" note="Including closed and transferred cases.">
            <div className={`${PANEL_BLEED} overflow-x-auto`}>
              <table className="w-full min-w-[720px] text-left text-13">
                <thead className="border-b border-line text-12 text-muted"><tr>
                  <th scope="col" className="px-6 py-2 font-medium">Case</th><th scope="col" className="px-3 py-2 font-medium">Unit</th><th scope="col" className="px-3 py-2 font-medium">Category</th>
                  <th scope="col" className="px-3 py-2 font-medium">Received</th><th scope="col" className="px-3 py-2 font-medium">Status</th><th scope="col" className="px-6 py-2 font-medium">Timeline</th>
                </tr></thead>
                <tbody className="divide-y divide-line">
                  {i.cases.map((c) => (
                    <tr key={c.id}>
                      <td className="px-6 py-2.5"><Link to={`/cases/${c.id}`} className="font-mono font-semibold text-ink-950 hover:underline">{c.uid}</Link></td>
                      <td className="px-3 py-2.5 font-medium"><UnitPill code={c.ownerUnit} /></td>
                      <td className="px-3 py-2.5">{categoryLabel(c.category)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5">{fmtDate(c.receivedOn)}</td>
                      <td className="px-3 py-2.5"><StatusBadge s={c.lifecycle} /></td>
                      <td className="px-6 py-2.5"><DeadlineBadge d={c.deadline} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <aside className="space-y-8">
          <Panel title="Overlaps">
            {i.alerts.length ? (
              <ul className="space-y-3">{i.alerts.map((a) => (
                <li key={a.id}>
                  <Link to={`/overlaps/${encodeURIComponent(a.id)}`} className="flex flex-wrap items-center gap-1.5 hover:underline">
                    <SeverityMark s={a.severity} />
                    <span className="text-13 text-muted">{a.decided && a.decision ? `${DECISION_LABEL[a.decision.decision]}${a.decision.leadUnit ? `, ${a.decision.leadUnit} leads` : ''}` : 'waiting for a decision'}</span>
                  </Link>
                </li>
              ))}</ul>
            ) : <p className="text-13 text-muted">No overlaps for this institution.</p>}
          </Panel>

          <Panel className={!EXTRA ? 'hidden' : undefined} title="Replies from this institution">
            {i.replies.length ? (
              <ul className="space-y-2 text-13">{i.replies.map((r) => (
                <li key={r.id}><Link to={`/cases/${r.caseId}#reply`} className="font-mono font-semibold text-ink-950 hover:underline">{r.caseUid}</Link> <span className={r.state === 'received' ? 'text-good' : r.dueOn < api.today ? 'text-tape' : 'text-muted'}>{r.state === 'received' ? `received ${fmtDate(r.submission!.at)}` : `waiting, due ${fmtDate(r.dueOn)}`}</span></li>
              ))}</ul>
            ) : <p className="text-13 text-muted">No reply has been asked for.</p>}
          </Panel>

          <Panel className={!EXTRA ? 'hidden' : undefined} title="Who is watching" note="Watchers see new cases, overlaps and decisions about this institution in their inbox.">
            {i.watchers.length ? <p className="text-14">{i.watchers.join(', ')}</p> : <p className="text-13 text-muted">Nobody yet.</p>}
          </Panel>

          <Panel title="Known identifiers" note="Only verified identifiers are used for automatic matching.">
            <dl className="space-y-3">
              <div><dt className="text-12 text-muted">Permanent ID</dt><dd className="font-mono font-medium">{i.permanentId}</dd></div>
              {i.identifiers.map((x) => (
                <div key={x.type + x.value}>
                  <dt className="text-12 text-muted">{ID_LABEL[x.type]}</dt>
                  <dd className="flex items-center justify-between gap-2"><span className="font-mono font-medium">{x.value}</span><span className={`text-12 ${x.verified ? 'text-ink-700' : 'text-turmeric'}`}>{x.verified ? (x.type === 'confirmed_alias' ? 'Confirmed by a person' : 'Verified') : 'Not verified'}</span></dd>
                </div>
              ))}
            </dl>
          </Panel>
        </aside>
      </div>
    </>
  )
}
