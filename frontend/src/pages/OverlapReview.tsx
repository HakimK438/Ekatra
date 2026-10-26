import InstitutionHub from '../components/InstitutionHub'
import PriorityBasis from '../components/PriorityBasis'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import clsx from 'clsx'
import { ArrowLeftRight, Check, History } from 'lucide-react'
import { api } from '../lib/api'
import { SETTINGS, addDays, canDecide, compareValues, daysBetween } from '../lib/logic'
import { CHANNEL_LABEL, DECISION_LABEL, RULE_LABEL, categoryLabel, unitFull } from '../lib/labels'
import { useUser } from '../hooks/useUser'
import JointTimeline from '../components/JointTimeline'
import { CompareTable, type CompareRow } from '../components/Evidence'
import { ConsequencePreview, RelationshipLadder, ladderLevel } from '../components/Decision'
import Receipt from '../components/Receipt'
import { UnitPill } from '../components/Unit'
import { Button, Step, DeadlineBadge, ErrorBox, PANEL_BLEED, Panel, SeverityMark, Skeleton, StatusBadge, fmtDate } from '../components/ui'
import type { DecisionType } from '../lib/types'

const DECISIONS: { value: DecisionType; hint: string; reason: boolean }[] = [
  { value: 'designate_lead_unit', hint: 'Pick which unit takes the lead. Ownership does not change.', reason: true },
  { value: 'related', hint: 'Linked matters. Both units continue and can see each other’s case.', reason: false },
  { value: 'duplicate', hint: 'Marks them as the same complaint. Each unit closes its own case if it chooses.', reason: true },
  { value: 'not_related', hint: 'Same institution, different issue. This overlap goes quiet.', reason: true },
  { value: 'request_further_review', hint: 'Asks the coordinator to look again before anyone decides.', reason: true },
]

export default function OverlapReview() {
  const { id = '' } = useParams()
  const { user } = useUser()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['overlap', id, user.id], queryFn: () => api.overlap(id, user) })
  const [decision, setDecision] = useState<DecisionType>('designate_lead_unit')
  const [reason, setReason] = useState('')
  const [lead, setLead] = useState('')
  const [fu, setFu] = useState(false)
  const [fuUnit, setFuUnit] = useState('')
  const [fuAction, setFuAction] = useState('')
  const [fuDue, setFuDue] = useState(addDays(api.today, SETTINGS.followUpDays))
  const m = useMutation({
    mutationFn: () => api.decide({ alertId: id, decision, reason, leadUnit: decision === 'designate_lead_unit' ? lead || undefined : undefined, followUp: fu && fuUnit && fuAction.trim() ? { ownerUnit: fuUnit, action: fuAction.trim(), dueOn: fuDue } : undefined, user }),
    onSuccess: () => qc.invalidateQueries(),
  })

  if (q.isError) return <ErrorBox error={q.error} />
  if (!q.data) return <div className="space-y-4" aria-busy="true"><Skeleton className="h-28" /><Skeleton className="h-80" /></div>
  const a = q.data
  const involved = [...new Set(a.cases.map((c) => c.ownerUnit))]
  const opt = DECISIONS.find((d) => d.value === decision)!
  const allowed = canDecide(user, involved)
  const missing = opt.reason && !reason.trim() ? 'Add a reason to record this decision.' : decision === 'designate_lead_unit' && !lead ? 'Choose the lead unit.' : fu && decision !== 'not_related' && decision !== 'request_further_review' && (!fuUnit || !fuAction.trim()) ? 'Fill in who does the follow-up and what must be done, or untick it.' : null

  // Field-by-field check. "Not given" never counts as "Same".
  const rows: CompareRow[] = [
    { label: 'Unit', cells: a.cases.map((c) => <UnitPill key={c.id} code={c.ownerUnit} />) },
    { label: 'Institution', cells: a.cases.map((c) => <span key={c.id} className="font-mono text-13">{a.institution.permanentId}<div className="font-sans text-12 text-muted">recorded as “{c.recorded.name}”</div></span>), verdict: 'same' },
    { label: 'Complaint number', cells: a.cases.map((c) => <span key={c.id} className="font-mono text-13">{c.sourceComplaintRef ?? <span className="font-sans text-muted">Not given</span>}</span>), verdict: compareValues(a.cases.map((c) => c.sourceComplaintRef)) },
    { label: 'Category', cells: a.cases.map((c) => categoryLabel(c.category)), verdict: compareValues(a.cases.map((c) => c.category)) },
    { label: 'Received', cells: a.cases.map((c) => `${fmtDate(c.receivedOn)} via ${CHANNEL_LABEL[c.channel]}`) },
    { label: 'Stage', cells: a.cases.map((c) => <div key={c.id}><StatusBadge s={c.lifecycle} /><div className="text-12 text-muted">{c.localStatus}</div></div>) },
    { label: 'Timeline', cells: a.cases.map((c) => <DeadlineBadge key={c.id} d={c.deadline} />) },
    { label: 'Last action', cells: a.cases.map((c) => <div key={c.id}>{c.lastAction}<div className="text-12 text-muted">{fmtDate(c.lastActionOn)}</div></div>) },
    { label: 'Next action', cells: a.cases.map((c) => c.nextAction) },
    { label: 'Summary', cells: a.cases.map((c) => c.summary) },
  ]

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-13 text-muted"><Link className="hover:underline" to="/overlaps">Clashes</Link> <span aria-hidden>/</span> {a.institution.name}</nav>
      <header className="relative mb-6 flex gap-5 overflow-hidden rounded-[22px] border border-line bg-surface p-6 shadow-card max-sm:flex-col">
        <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-ink-700 via-ink-500 to-turmeric" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-12 font-semibold text-muted"><SeverityMark s={a.severity} />{a.title}</p>
          <h1 className="mt-1 font-display text-26 font-semibold leading-tight text-ink-950">{a.institution.name}</h1>
          <p className="text-13 text-muted">Permanent ID <span className="font-mono">{a.institution.permanentId}</span> · {a.institution.district}, {a.institution.state}</p>
          {a.issue && <p className="mt-2 inline-flex rounded-full bg-turmeric-soft px-3 py-1 text-13 font-semibold text-turmeric">Issue: {a.issue}</p>}
          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-13">
            <div><dt className="text-muted">Units involved</dt><dd className="font-display text-20 font-semibold text-ink-950">{involved.length}</dd></div>
            <div><dt className="text-muted">Open together for</dt><dd className="font-display text-20 font-semibold text-ink-950">{daysBetween(a.since, api.today)} days</dd></div>
            <div><dt className="text-muted">{a.decision ? 'Decided on' : 'Decision due'}</dt><dd className={clsx('font-display text-20 font-semibold', !a.decision && daysBetween(api.today, a.dueOn) < 0 ? 'text-tape' : 'text-ink-950')}>{a.decision ? fmtDate(a.decision.at) : fmtDate(a.dueOn)}</dd></div>
          </dl>
          <div className="mt-3"><RelationshipLadder level={ladderLevel(a.decision?.decision)} /></div>
        </div>
      </header>

      <InstitutionHub name={a.institution.name} cases={a.cases} today={api.today} className="mb-6" />
      <PriorityBasis a={{ severity: a.severity, rules: a.rules, cases: a.cases.map((c) => ({ ...c, unit: c.ownerUnit })), dueOn: a.dueOn, since: a.since }} today={api.today} className="mb-6" />

      <section aria-label="Cases involved" className="mb-6">
        <div className="grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr]">
          {a.cases.slice(0, 2).map((c, i) => (
            <div key={c.id} className="contents">
              {i === 1 && <div className="flex items-center justify-center md:flex-col" aria-hidden><ArrowLeftRight size={20} className="text-muted" /><span className="ml-2 text-11 font-semibold text-muted md:ml-0 md:mt-1">{a.sharedIssues.length ? 'Same issue' : 'Overlap'}</span></div>}
              <article className="rounded-xl border border-line bg-surface p-4 shadow-card">
                <h2 className="flex flex-wrap items-center gap-2 font-display text-15 font-semibold text-ink-950"><UnitPill code={c.ownerUnit} />{unitFull(c.ownerUnit)}</h2>
                <p className="mt-1 text-13"><Link to={`/cases/${c.id}`} className="font-mono font-semibold text-ink-950 hover:underline">{c.uid}</Link> <span className="text-muted">· {categoryLabel(c.category)} · {CHANNEL_LABEL[c.channel]}</span></p>
                <div className="mt-2 flex flex-wrap items-center gap-2"><StatusBadge s={c.lifecycle} /><DeadlineBadge d={c.deadline} /></div>
                <p className="mt-3 text-13 text-text">{c.summary}</p>
                <p className="mt-2 text-12 text-muted">Last action: {c.lastAction} ({fmtDate(c.lastActionOn)})</p>
              </article>
            </div>
          ))}
        </div>
        {a.cases.length > 2 && <p className="mt-2 text-12 text-muted">{a.cases.length - 2} further case{a.cases.length - 2 === 1 ? '' : 's'} are in the full comparison below.</p>}
      </section>

      <section aria-label="Reasons found" className="mb-8">
        <h2 className="mb-2 text-13 font-semibold text-ink-950">Why this was flagged <span className="font-normal text-muted">(found by rule, not by an AI service)</span></h2>
        <ul className="flex flex-wrap gap-2">
          {a.sharedIssues.map((s) => <li key={s.issue} title={`Matched words: ${s.words.join(', ')}`} className="inline-flex items-center gap-1.5 rounded-full border border-good/30 bg-good-soft px-3 py-1 text-13 text-good"><Check size={14} aria-hidden />Same issue: {s.label}</li>)}
          {a.rules.map((r) => <li key={r.code} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-13 text-text"><Check size={14} className="text-good" aria-hidden />{RULE_LABEL[r.code].short}</li>)}
        </ul>
      </section>

      {a.earlierDecision && !a.decision && (
        <p className="mb-6 flex items-start gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-14 text-text">
          <History size={16} className="mt-0.5 shrink-0 text-muted" aria-hidden />
          <span>A new case joined an overlap that was already decided. Earlier decision: <strong>{DECISION_LABEL[a.earlierDecision.decision]}</strong>{a.earlierDecision.leadUnit && ` (${a.earlierDecision.leadUnit} leads)`}, by {a.earlierDecision.by}. Check whether it still holds.</span>
        </p>
      )}

      {a.decision ? (
        <Panel title="Decision recorded">
          <p className="font-display text-20 text-ink-950">{DECISION_LABEL[a.decision.decision]}{a.decision.leadUnit && `: ${a.decision.leadUnit} leads`}</p>
          {a.decision.reason && <p className="mt-2 max-w-3xl text-14 text-text">“{a.decision.reason}”</p>}
          {a.decision.followUp && <p className="mt-3 max-w-3xl rounded-lg bg-paper px-4 py-3 text-13 text-text"><strong>Follow-up for {a.decision.followUp.ownerUnit}, by {fmtDate(a.decision.followUp.dueOn)}:</strong> {a.decision.followUp.action}</p>}
          <p className="mt-2 text-12 text-muted">Chosen by {a.decision.by}.</p>
          <Receipt className="mt-4 max-w-3xl" at={a.decision.at} by={a.decision.by}
            text="Each case’s owner and stage are unchanged. The decision was added to both timelines." />
        </Panel>
      ) : (
        <Panel title="Record your decision" note={allowed ? 'You are recording a decision on behalf of your unit. Ekatra does not recommend one: it shows the facts above and records what you choose.' : undefined}>
          {a.history.length > 0 && (
            <ul className="mb-5 space-y-2">
              {a.history.map((h, i) => <li key={i} className="rounded-xl border border-line bg-paper/60 px-4 py-2.5 text-13"><strong>{DECISION_LABEL[h.decision]}</strong> by {h.by}: “{h.reason}”</li>)}
            </ul>
          )}
          {!allowed ? (
            <p className="text-14 text-text">Waiting on a nodal officer of {involved.join(' or ')}, or the coordinator. Decision due {fmtDate(a.dueOn)}. You can read everything above.</p>
          ) : (
            <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); m.mutate() }}>
              <fieldset className="space-y-3">
                <legend className="sr-only">Decision</legend>
                <Step n={1} title="Choose what you are deciding" hint="Pick the option that best describes how these cases relate." />
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                  {DECISIONS.map((d) => (
                    <label key={d.value} className={clsx('cursor-pointer rounded-xl border p-3 transition-colors', decision === d.value ? 'border-ink-700 bg-ink-50' : 'border-line hover:border-ink-500')}>
                      <span className="flex items-center gap-2">
                        <input type="radio" name="decision" className="accent-[rgb(var(--ink-700))]" checked={decision === d.value} onChange={() => setDecision(d.value)} />
                        <span className="text-14 font-semibold text-ink-950">{DECISION_LABEL[d.value]}</span>
                      </span>
                      <span className="mt-1 block text-12 leading-snug text-muted">{d.hint}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {decision === 'designate_lead_unit' && (
                <fieldset className="space-y-3">
                  <legend className="sr-only">Lead unit</legend>
                  <Step n={2} title="Which unit leads?" hint="Only units involved in this overlap can lead." />
                  <div className="flex flex-wrap gap-2">
                    {involved.map((u) => (
                      <label key={u} className={clsx('inline-flex cursor-pointer items-center gap-2 rounded-full border px-5 py-2 text-14 font-semibold focus-within:ring-2 focus-within:ring-ink-500', lead === u ? 'border-ink-700 bg-ink-700 text-white' : 'border-line hover:border-ink-500')}>
                        <input type="radio" name="lead" className="sr-only" checked={lead === u} onChange={() => setLead(u)} /><UnitPill code={u} />{unitFull(u)}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}

              <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
                <label className="block space-y-3">
                  <Step n={decision === 'designate_lead_unit' ? 3 : 2} title={opt.reason ? 'Say why' : 'Add a note (optional)'} hint="This is saved on both cases and in the audit log." />
                  <textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} aria-required={opt.reason}
                    placeholder="Write the reason in a sentence or two. It is saved on both cases and in the audit log."
                    className="block w-full rounded-xl border border-line bg-surface px-4 py-3 text-14 focus:border-ink-500 focus:outline-none focus:ring-4 focus:ring-ink-100" />
                </label>
                <ConsequencePreview decision={decision} lead={lead || undefined} />
              </div>

              {decision !== 'not_related' && decision !== 'request_further_review' && (
                <div className="rounded-xl border border-line bg-paper/60 p-4">
                  <label className="flex items-center gap-2 text-14 font-medium text-ink-950"><input type="checkbox" checked={fu} onChange={(e) => setFu(e.target.checked)} />Add a follow-up task (optional)</label>
                  {fu && (
                    <div className="mt-3 grid gap-3 md:grid-cols-[160px_1fr_160px]">
                      <label className="text-13 font-medium text-text">Who does it<select className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-14" value={fuUnit} onChange={(e) => setFuUnit(e.target.value)}><option value="">Choose a unit</option>{involved.map((u) => <option key={u}>{u}</option>)}</select></label>
                      <label className="text-13 font-medium text-text">What must be done<input className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-14" value={fuAction} onChange={(e) => setFuAction(e.target.value)} maxLength={160} placeholder="For example: send the institution one joint letter" /></label>
                      <label className="text-13 font-medium text-text">Due by<input type="date" min={api.today} className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-14" value={fuDue} onChange={(e) => setFuDue(e.target.value)} /></label>
                    </div>
                  )}
                </div>
              )}

              {m.isError && <ErrorBox error={m.error} />}
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={m.isPending || !!missing}>{m.isPending ? 'Recording…' : 'Record decision'}</Button>
                <span className="text-13 text-muted" aria-live="polite">{missing ?? `Recorded as ${user.name}${user.unit ? `, ${user.unit}` : ''}.`}</span>
              </div>
            </form>
          )}
        </Panel>
      )}

      <details className="mt-8 rounded-panel border border-line bg-surface shadow-card">
        <summary className="cursor-pointer px-6 py-4 font-display text-15 font-semibold text-ink-950">Supporting detail: reasons, timeline and full comparison</summary>
        <div className="border-t border-line p-6">
      <div className="mb-8 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Panel title="Reasons found" note="Found by rule from the case records. Nothing here is a guess by an AI service.">
          <ul className="space-y-3">
            {a.sharedIssues.map((s) => (
              <li key={s.issue} className="flex gap-2 text-14"><Check size={16} className="mt-0.5 shrink-0 text-good" aria-hidden /><span>Same issue: <strong>{s.label}</strong>. The cases mention {s.words.map((w) => <mark key={w} className="mx-0.5 rounded bg-turmeric-soft px-1.5 py-0.5 text-13 text-text">{w}</mark>)}</span></li>
            ))}
            {a.rules.map((r) => (
              <li key={r.code} className="flex gap-2 text-14"><Check size={16} className="mt-0.5 shrink-0 text-good" aria-hidden /><span>{r.why}</span></li>
            ))}
          </ul>
          <p className="mt-5 border-t border-line pt-3 text-12 text-muted">This is a possible relationship only. The system never merges, closes or transfers a case.</p>
        </Panel>
        <Panel title="What happened, in date order" note="Both units together. The highlighted line is where both had an open case.">
          <div className="pt-4"><JointTimeline events={a.merged.map((e) => ({ at: e.at, unit: e.unit, text: e.text, actor: e.actor }))} since={a.since} /></div>
        </Panel>
      </div>

      <Panel title="Side by side" note="Complainant names and complaint text are not shown here." className="mb-8">
        <div className={`${PANEL_BLEED} overflow-x-auto`}>
          <CompareTable caption="Comparison of the cases in this overlap" rows={rows}
            heads={a.cases.map((c) => <Link key={c.id} to={`/cases/${c.id}`} className="font-mono text-15 font-semibold text-ink-950 hover:underline">{c.uid}</Link>)} />
        </div>
      </Panel>

        </div>
      </details>
    </>
  )
}
