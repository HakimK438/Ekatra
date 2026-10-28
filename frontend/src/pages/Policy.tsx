// Policy console. A rule changes only by a proposal (administrator or coordinator) that a second person in senior
// management approves. Before anyone decides, both see what the change would do to today's records.
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, BarChart3, FilePen, Gavel, History, Lock, ShieldCheck, UserCheck } from 'lucide-react'
import { BeforeAfter, LogicStrip } from '../components/Logic'
import clsx from 'clsx'
import { useUser } from '../hooks/useUser'
import { work, SERVER_ONLY, type Impact, type Proposal, type RuleItem } from '../lib/workApi'
import { fieldCls } from '../components/Dialog'
import { ServerOnly } from '../components/WorkBits'
import { Button, ErrorBox, PageHead, Panel, Skeleton, Step } from '../components/ui'

export default function Policy() {
  const { user } = useUser()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['policy'], queryFn: work.policy, enabled: !SERVER_ONLY })
  const [draft, setDraft] = useState<Record<string, number>>({})
  const [reason, setReason] = useState('')
  const [effective, setEffective] = useState('')
  const changed = useMemo(() => Object.fromEntries(Object.entries(draft).filter(([k, v]) => q.data?.rules.find((r) => r.key === k)?.current !== v)), [draft, q.data])
  const has = Object.keys(changed).length > 0
  const preview = useQuery({ queryKey: ['policy-preview', changed], queryFn: () => work.preview(changed), enabled: has })
  const propose = useMutation({ mutationFn: () => work.propose(changed, reason, effective || undefined), onSuccess: () => { setDraft({}); setReason(''); qc.invalidateQueries() } })

  if (SERVER_ONLY) return <><PageHead icon={<Gavel size={22} />} title="Rule changes" /><ServerOnly /></>
  const canPropose = user.role === 'admin' || user.role === 'coordinator'
  const groups = [...new Set((q.data?.rules ?? []).map((r) => r.group))]

  return (
    <>
      <PageHead icon={<Gavel size={22} />} title="Rule changes"
        lead="Propose a change, see its effect, a second person approves." />
      <LogicStrip title="How a rule changes" steps={[
        { icon: FilePen, title: 'Propose', text: 'Admin or coordinator, with a reason.', tone: 'person' },
        { icon: BarChart3, title: 'See the effect', text: 'Today’s counts, before and after.' },
        { icon: UserCheck, title: 'Approve', text: 'Senior management; not the proposer.', tone: 'person' },
        { icon: History, title: 'Recorded', text: 'Applies everywhere; written to the audit log.' },
      ]} foot="Verified rules are locked. Others are prototype settings." />
      {q.isLoading && <Skeleton className="h-72" />}
      {q.isError && <ErrorBox error={q.error} />}
      {q.data && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div className="space-y-6">
            {q.data.pending.length > 0 && (
              <Panel title={`Waiting for approval (${q.data.pending.length})`} note={`Proposed by: ${q.data.who.propose}. Approved by: ${q.data.who.approve}.`}>
                <ul className="space-y-4">{q.data.pending.map((p) => <PendingCard key={p.id} p={p} />)}</ul>
              </Panel>
            )}
            <Panel title="Rules in force" note={canPropose ? 'Change a value to start a proposal. Verified rules are locked.' : 'Only the administrator or the coordinator can propose a change.'}>
              <div className="space-y-6">{groups.map((g) => (
                <section key={g}><h3 className="font-display text-15 font-semibold text-ink-950">{g}</h3>
                  <ul className="mt-2 divide-y divide-line rounded-xl border border-line">{q.data.rules.filter((r) => r.group === g).map((r) => (
                    <RuleRow key={r.label} r={r} value={r.key ? draft[r.key] ?? r.current : undefined} edit={canPropose} onChange={(v) => r.key && setDraft((d) => ({ ...d, [r.key!]: v }))} />))}</ul>
                </section>))}</div>
            </Panel>
          </div>

          <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
            <Panel>
              <Step n={1} title="What would change today" hint="Counted on the records as they are now, before anyone approves." />
              {!has && <p className="mt-3 text-14 text-muted">Change a value on the left to see its effect.</p>}
              {has && preview.isLoading && <Skeleton className="mt-3 h-32" />}
              {has && preview.isError && <div className="mt-3"><ErrorBox error={preview.error} /></div>}
              {has && preview.data && <ImpactView i={preview.data} />}
            </Panel>
            {has && canPropose && (
              <Panel>
                <Step n={2} title="Propose the change" hint="Senior management sees the same effect before approving." />
                <label className="mt-3 block text-13 font-medium text-text">Why should it change?<textarea rows={3} className={fieldCls} value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder="For example: AICTE set a 20-day limit for non-CPGRAMS complaints in its letter of 20 Oct." /></label>
                <label className="mt-3 block text-13 font-medium text-text">Takes effect on (optional)<input type="date" className={fieldCls} value={effective} onChange={(e) => setEffective(e.target.value)} /></label>
                {propose.isError && <div className="mt-3"><ErrorBox error={propose.error} /></div>}
                <div className="mt-3 flex justify-end gap-2"><Button variant="quiet" onClick={() => setDraft({})}>Discard</Button><Button onClick={() => propose.mutate()} disabled={reason.trim().length < 10 || propose.isPending}>Send for approval</Button></div>
              </Panel>
            )}
            <Panel title="Decided changes">
              {!q.data.history.length && <p className="text-14 text-muted">No rule change has been decided yet.</p>}
              <ul className="space-y-3">{q.data.history.map((p) => (
                <li key={p.id} className="rounded-xl border border-line px-4 py-3 text-13">
                  <p className="flex items-center gap-2 font-medium text-ink-950"><span className={clsx('rounded-full px-2 py-0.5 text-12', p.state === 'approved' ? 'bg-good/10 text-good' : 'bg-tape/10 text-tape')}>{p.state === 'approved' ? 'Approved' : 'Rejected'}</span>#{p.id}</p>
                  <ValueList i={p.impact} />
                  <p className="mt-1 text-muted">Proposed by {p.by}; {p.state} by {p.decidedBy} on {p.decidedAt?.slice(0, 10)}.{p.note ? ` “${p.note}”` : ''}</p>
                </li>))}</ul>
            </Panel>
          </div>
        </div>
      )}
    </>
  )
}

function RuleRow({ r, value, edit, onChange }: { r: RuleItem; value?: number; edit: boolean; onChange: (v: number) => void }) {
  const isPct = r.unit === 'percent'
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-[14rem] flex-1">
        <p className="text-14 text-ink-950">{r.label}</p>
        <p className="text-12 text-muted">{r.verified ? 'Verified' : 'Prototype setting, not an AICTE-approved rule'} · {r.basis}</p>
      </div>
      {!r.key || !r.editable || !edit ? (
        <span className="flex items-center gap-1.5 rounded-full bg-ink-50 px-3 py-1 text-13 text-ink-900">{(!r.key || !r.editable) && <Lock size={12} aria-hidden />}{r.value}</span>
      ) : (
        <label className="flex items-center gap-2 text-13 text-muted">
          <input type="number" className={clsx('w-24 rounded-lg border px-2 py-1.5 text-right text-14 text-ink-950', value !== r.current ? 'border-turmeric bg-turmeric/5' : 'border-line')}
            min={r.min} max={r.max} step={isPct ? 1 : 1} value={value ?? ''} onChange={(e) => onChange(Number(e.target.value))} aria-label={r.label} />
          {isPct ? '%' : r.unit}
        </label>
      )}
    </li>
  )
}

const ValueList = ({ i }: { i: Impact }) => (
  <ul className="mt-1 space-y-0.5">{i.values.map((v) => <li key={v.key} className="flex flex-wrap items-center gap-1.5 text-ink-950">{v.label}: <span className="text-muted line-through">{v.from}</span><ArrowRight size={12} aria-hidden /><strong>{v.to}</strong></li>)}</ul>
)

function ImpactView({ i }: { i: Impact }) {
  return (
    <div className="mt-3 space-y-3">
      <ValueList i={i} />
      <p className="text-12 text-muted">On today’s records: grey bar now, coloured bar after the change.</p>
      <div className="space-y-3">{i.changes.map((c) => <BeforeAfter key={c.key} label={c.label} before={c.before} after={c.after} />)}</div>
      <p className="rounded-lg bg-paper px-3 py-2 text-13 text-ink-950">{i.summary}</p>
      {i.overlapsGone.length > 0 && <p className="text-13 text-ink-950">Overlap alerts that would disappear: {i.overlapsGone.join(', ')}</p>}
      {i.overlapsNew.length > 0 && <p className="text-13 text-ink-950">New overlap alerts: {i.overlapsNew.join(', ')}</p>}
    </div>
  )
}

function PendingCard({ p }: { p: Proposal }) {
  const { user } = useUser()
  const qc = useQueryClient()
  const [note, setNote] = useState('')
  const m = useMutation({ mutationFn: (approve: boolean) => work.decideProposal(p.id, approve, note), onSuccess: () => qc.invalidateQueries() })
  const can = user.role === 'senior_management'
  return (
    <li className="rounded-xl border border-turmeric/40 bg-turmeric/5 p-4">
      <p className="font-display text-15 font-semibold text-ink-950">Proposal #{p.id}, from {p.by}</p>
      <p className="mt-1 text-13 text-ink-950">“{p.reason}”</p>
      <p className="text-12 text-muted">Proposed {p.at.slice(0, 10)}; takes effect {p.effective}.</p>
      <div className="mt-2 text-13"><ImpactView i={p.impact} /></div>
      {can ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input className="min-w-[14rem] flex-1 rounded-full border border-line bg-surface px-4 py-2 text-13" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (needed to reject)" aria-label="Decision note" />
          <Button onClick={() => m.mutate(true)} disabled={m.isPending}><ShieldCheck size={15} aria-hidden />Approve</Button>
          <Button variant="secondary" onClick={() => m.mutate(false)} disabled={m.isPending || !note.trim()}>Reject</Button>
        </div>
      ) : <p className="mt-3 text-12 text-muted">Waiting for senior management. The person who proposed a change cannot approve it.</p>}
      {m.isError && <div className="mt-2"><ErrorBox error={m.error} /></div>}
    </li>
  )
}
