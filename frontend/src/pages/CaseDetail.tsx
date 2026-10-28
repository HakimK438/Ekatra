// The case file: the Proof Trail first (what was checked, by whom), then actions, the reply from the
// institution, the history with audit entries, and how the institution and time limit were worked out.
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowRightLeft, CalendarPlus, CheckCheck, Copy, ExternalLink, FileText, Hand, Lock, MailQuestion, NotebookPen, Shuffle } from 'lucide-react'
import clsx from 'clsx'
import { api, EXTRA } from '../lib/api'
import { CHANNEL_LABEL, DECISION_LABEL, DISPOSAL_LABEL, STAGE_LABEL, categoryLabel } from '../lib/labels'
import { ClosureFacts } from '../components/WorkBits'
import { SETTINGS, addDays } from '../lib/logic'
import { tagEvidence } from '../lib/proof'
import { nextStepFor, preActionCheck, type LaneLite } from '../lib/solution'
import { useUser } from '../hooks/useUser'
import CaseLanes from '../components/CaseLanes'
import Dialog, { fieldCls } from '../components/Dialog'
import { EvidenceList } from '../components/Evidence'
import { CheckCard, NextStepCard, lightWord } from '../components/Solution'
import ProofRail from '../components/ProofRail'
import Receipt from '../components/Receipt'
import { UnitPill } from '../components/Unit'
import { Button, DeadlineBadge, ErrorBox, MatchBadge, Panel, RuleTag, SeverityMark, Skeleton, StatusBadge, btn, fmtDate } from '../components/ui'
import type { DisposalType, Lifecycle } from '../lib/types'

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="text-12 text-muted">{label}</dt><dd className="mt-0.5 text-14 text-text">{children}</dd></div>
}

type ActionKind = 'record' | 'stage' | 'reply' | 'transfer' | 'close' | 'schedule'
const QUICK_STEPS = ['Hearing', 'Inspection visit', 'Reply due from the institution', 'Report due']
const OPEN_STAGES: Lifecycle[] = ['received', 'under_examination', 'awaiting_party', 'inspection_hearing', 'escalated']

function ActionDialog({ kind, onClose, c, onDone }: { kind: ActionKind | null; onClose: () => void; c: { id: string; uid: string; lifecycle: Lifecycle; units: string[]; ownerUnit: string; category: string; lanes: LaneLite[]; scheduled?: { on: string; what: string } | null }; onDone: (msg: string) => void }) {
  const { user } = useUser()
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [next, setNext] = useState('')
  const [stage, setStage] = useState<Lifecycle>('under_examination')
  const [to, setTo] = useState('')
  const [type, setType] = useState<DisposalType>('resolved')
  const [due, setDue] = useState(addDays(api.today, SETTINGS.replyDays))
  const [stepOn, setStepOn] = useState(c.scheduled?.on ?? addDays(api.today, 7))
  const [stepWhat, setStepWhat] = useState(c.scheduled?.what ?? '')
  const check = preActionCheck({ action: kind === 'schedule' ? 'record' : kind ?? 'record', caseId: c.id, unit: c.ownerUnit, category: c.category, lanes: c.lanes, targetStage: kind === 'stage' ? stage : undefined })
  // Going ahead after an amber or red light is allowed. The case history and the audit log say so.
  const noted = (t: string) => (check.light === 'green' ? t : `${t} [Went ahead after a “${lightWord(check.light)}” check: ${check.askUnits.join(', ')}.]`)
  const m = useMutation({
    mutationFn: async () => {
      if (kind === 'record') { await api.recordAction(c.id, { text: noted(text), next }, user); return 'Action recorded on the case.' }
      if (kind === 'stage') { await api.changeStage(c.id, { stage, reason: noted(text) }, user); return `Moved to “${STAGE_LABEL[stage]}”.` }
      if (kind === 'transfer') { await api.transfer(c.id, { to, reason: noted(text) }, user); return `Transferred to ${to}. It now counts as transferred, not disposed.` }
      if (kind === 'close') { await api.dispose(c.id, { type, reason: noted(text) }, user); return `Case closed: ${DISPOSAL_LABEL[type]}.` }
      if (kind === 'schedule') { await api.schedule(c.id, { on: stepOn, what: stepWhat }, user); return 'Date booked. It now appears on the calendar, and Ekatra will flag it if another unit acts on this institution that week.' }
      const r = await api.requestReply(c.id, { askedFor: text, dueOn: due }, user); return `Reply link created. Send it to the institution: ${location.origin}/reply/${r.token}`
    },
    onSuccess: (msg) => { qc.invalidateQueries(); onDone(msg); setText(''); setNext(''); onClose() },
  })
  if (!kind) return null
  const titles: Record<ActionKind, [string, string]> = {
    record: ['Record an action', 'Write what was done, so everyone sees the same history.'],
    stage: ['Change the stage', 'Move the case to the stage it is really at.'],
    reply: ['Ask the institution for a reply', 'Ekatra makes a one-time link. The institution sees only this request, nothing else.'],
    transfer: ['Transfer to another unit', 'The history stays. It will count as transferred, never as disposed.'],
    close: ['Close the case', 'Only your unit can close its own case. Say why.'],
    schedule: ['Book a date', 'A hearing, a visit or a reply deadline. It goes on the calendar, and Ekatra checks it against the other units working on this institution.'],
  }
  const need = kind === 'schedule' ? !stepWhat.trim() || !stepOn : kind === 'record' ? !text.trim() : kind === 'transfer' ? !to || !text.trim() : !text.trim()
  return (
    <Dialog open title={titles[kind][0]} lead={titles[kind][1]} onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate() }}>
        {kind !== 'schedule' && <CheckCard r={check} />}
        {kind === 'schedule' && (
          <div className="space-y-4">
            <div>
              <p className="text-13 font-medium text-text">What happens?</p>
              <div className="mt-2 flex flex-wrap gap-2">{QUICK_STEPS.map((q) => <button key={q} type="button" aria-pressed={stepWhat === q} onClick={() => setStepWhat(q)} className={clsx('rounded-full border px-3.5 py-1.5 text-13', stepWhat === q ? 'border-ink-700 bg-ink-700 text-white' : 'border-line hover:border-ink-500')}>{q}</button>)}</div>
              <input className={fieldCls} value={stepWhat} onChange={(e) => setStepWhat(e.target.value)} maxLength={80} placeholder="Or write it: for example, SHC hearing" aria-label="What happens" />
            </div>
            <label className="block text-13 font-medium text-text">On which date?<input type="date" min={api.today} className={fieldCls} value={stepOn} onChange={(e) => setStepOn(e.target.value)} required /></label>
            {c.scheduled && <p className="rounded-lg bg-paper px-3 py-2 text-13 text-muted">Now booked: <strong className="text-ink-950">{c.scheduled.what}</strong> on {fmtDate(c.scheduled.on)}. Saving replaces it.</p>}
          </div>
        )}
        {kind === 'stage' && (
          <fieldset><legend className="text-13 font-medium text-text">New stage</legend>
            <div className="mt-2 flex flex-wrap gap-2">{OPEN_STAGES.filter((s) => s !== c.lifecycle).map((s) => (
              <label key={s} className={clsx('cursor-pointer rounded-full border px-3.5 py-1.5 text-13 focus-within:ring-2 focus-within:ring-ink-500', stage === s ? 'border-ink-700 bg-ink-700 text-white' : 'border-line hover:border-ink-500')}>
                <input type="radio" className="sr-only" name="stage" checked={stage === s} onChange={() => setStage(s)} />{STAGE_LABEL[s]}</label>))}</div>
          </fieldset>
        )}
        {kind === 'transfer' && (
          <label className="block text-13 font-medium text-text">Send to
            <select className={fieldCls} value={to} onChange={(e) => setTo(e.target.value)}><option value="">Choose a unit</option>{c.units.map((u) => <option key={u}>{u}</option>)}</select></label>
        )}
        {kind === 'close' && (
          <fieldset><legend className="text-13 font-medium text-text">How was it closed?</legend>
            <div className="mt-2 flex flex-wrap gap-2">{(Object.keys(DISPOSAL_LABEL) as DisposalType[]).map((t) => (
              <label key={t} className={clsx('cursor-pointer rounded-full border px-3.5 py-1.5 text-13 focus-within:ring-2 focus-within:ring-ink-500', type === t ? 'border-ink-700 bg-ink-700 text-white' : 'border-line hover:border-ink-500')}>
                <input type="radio" className="sr-only" name="type" checked={type === t} onChange={() => setType(t)} />{DISPOSAL_LABEL[t]}</label>))}</div>
            {type === 'closed_as_duplicate_by_owner' && <p className="mt-2 text-12 text-muted">Tip: this should follow a “same complaint” decision on the overlaps board. If there is none, Ekatra will show a gentle hint.</p>}
          </fieldset>
        )}
        {kind !== 'schedule' && <label className="block text-13 font-medium text-text">{kind === 'record' ? 'What was done' : kind === 'reply' ? 'What should the institution send?' : 'Reason'}
          <textarea rows={3} className={fieldCls} value={text} onChange={(e) => setText(e.target.value)} required
            placeholder={kind === 'record' ? 'For example: Called the institution; Principal promised the fee refund by 30 Oct.' : kind === 'reply' ? 'For example: Your reply to the notice dated 10 Oct, with the faculty list signed by the Principal.' : 'One or two sentences.'} /></label>}
        {kind === 'close' && <ClosureFacts caseId={c.id} reason={text} disposalType={type} />}
        {kind === 'record' && <label className="block text-13 font-medium text-text">What happens next (optional)<input className={fieldCls} value={next} onChange={(e) => setNext(e.target.value)} placeholder="For example: Check the refund on 30 Oct" /></label>}
        {kind === 'reply' && <label className="block text-13 font-medium text-text">Reply due by<input type="date" min={api.today} className={fieldCls} value={due} onChange={(e) => setDue(e.target.value)} /></label>}
        {m.isError && <ErrorBox error={m.error} />}
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" variant="quiet" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={m.isPending || need}>{m.isPending ? 'Saving…' : kind === 'reply' ? 'Create the link' : kind === 'close' ? 'Close the case' : kind === 'schedule' ? 'Book the date' : 'Save'}</Button>
        </div>
        <p className="text-12 text-muted">Saved with your name and the time, and written to the audit log.</p>
      </form>
    </Dialog>
  )
}

export default function CaseDetail() {
  const { id = '' } = useParams()
  const { user } = useUser()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['case', id, user.id], queryFn: () => api.case(id, user) })
  const [reveal, setReveal] = useState(false)
  const [sp, setSp] = useSearchParams()
  const [action, setAction] = useState<ActionKind | null>(null)
  const wanted = sp.get('act') as ActionKind | null
  const [done, setDone] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const sens = useQuery({ queryKey: ['sensitive', id, user.id], queryFn: () => api.sensitive(id, user), enabled: reveal })
  const pick = useMutation({ mutationFn: () => api.assignToMe(id, user), onSuccess: () => { qc.invalidateQueries(); setDone('You picked up this case.') } })

  // A link from a deadline row (?act=record) opens the action box straight away, for officers who may act on the case.
  useEffect(() => { if (wanted && q.data?.canAct) { setAction(wanted); setSp({}, { replace: true }) } }, [wanted, q.data?.canAct, setSp])

  if (q.isError) return <ErrorBox error={q.error} />
  if (!q.data) return <div className="space-y-4" aria-busy="true"><Skeleton className="h-20" /><Skeleton className="h-40" /><Skeleton className="h-72" /></div>
  const c = q.data
  const isClosed = c.lifecycle === 'disposed' || c.lifecycle === 'transferred'
  const ownerOfficer = (user.role === 'dealing_officer' || user.role === 'nodal_officer') && user.unit === c.ownerUnit
  const otherUnits = new Set(c.lanes.filter((l) => l.unit !== c.ownerUnit).map((l) => l.unit))
  const steps = [
    { label: 'Dealing officer', on: true },
    { label: `Nodal officer (+${SETTINGS.escalateAfterOverdue} days late)`, on: c.escalation.level >= 1 },
    { label: `Senior management (+${SETTINGS.escalateAfterOverdue * 2} days late)`, on: c.escalation.level >= 2 },
  ]
  const copy = (t: string) => { navigator.clipboard?.writeText(t).catch(() => undefined); setCopied(t); setTimeout(() => setCopied(null), 1500) }

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-13 text-muted"><Link className="hover:underline" to="/cases">Cases</Link> <span aria-hidden>/</span> {c.uid}</nav>
      <header className="relative mb-6 overflow-hidden rounded-[22px] border border-line bg-surface p-6 shadow-card md:p-7">
        <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-ink-700 via-ink-500 to-turmeric" aria-hidden />
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="font-mono text-28 font-semibold leading-tight text-ink-950">{c.uid}</h1>
          <span className="inline-flex items-center gap-1.5 text-14 text-muted"><UnitPill code={c.ownerUnit} />received {fmtDate(c.receivedOn)} via {CHANNEL_LABEL[c.channel]}</span>
        </div>
        <p className="mt-2 max-w-3xl text-16 leading-relaxed text-text">{c.summary}</p>
        <NextStepCard s={nextStepFor(c)} today={api.today} className="mt-4 max-w-3xl" />
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
          <StatusBadge s={c.lifecycle} />
          <DeadlineBadge d={c.deadline} long />
          <span className="text-13 text-muted">Officer: {c.officer ?? <span className="font-medium text-turmeric">nobody yet</span>}</span>
          {!c.officer && c.canAct && !isClosed && <Button variant="secondary" className="!px-3 !py-1 !text-13" onClick={() => pick.mutate()} disabled={pick.isPending}><Hand size={14} aria-hidden />Pick it up</Button>}
        </div>
        {c.canAct && !isClosed ? (
          <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Actions on this case">
            <button className={btn('primary', '!py-2')} onClick={() => setAction('record')}><NotebookPen size={15} aria-hidden />Record an action</button>
            <button className={btn('secondary', '!py-2')} onClick={() => setAction('stage')}><Shuffle size={15} aria-hidden />Change stage</button>
            {EXTRA && c.institution && <button className={btn('secondary', '!py-2')} onClick={() => setAction('reply')}><MailQuestion size={15} aria-hidden />Ask the institution for a reply</button>}
            <button className={btn('secondary', '!py-2')} onClick={() => setAction('schedule')}><CalendarPlus size={15} aria-hidden />{c.scheduled ? 'Change the booked date' : 'Book a date'}</button>
            <button className={btn('secondary', '!py-2')} onClick={() => setAction('transfer')}><ArrowRightLeft size={15} aria-hidden />Transfer</button>
            <button className={btn('secondary', '!py-2')} onClick={() => setAction('close')}><CheckCheck size={15} aria-hidden />Close the case</button>
          </div>
        ) : !isClosed && (
          <p className="mt-4 text-13 text-muted">Only officers of {c.ownerUnit} can act on this case. You can read everything that is not restricted.</p>
        )}
        {done && <Receipt className="mt-4 max-w-3xl" at={new Date().toISOString()} by={`${user.name}${user.unit ? `, ${user.unit}` : ''}`} text={done} />}
      </header>
      <ActionDialog kind={action} onClose={() => setAction(null)} c={c} onDone={setDone} />

      {c.alertsForCase.filter((a) => !a.decided).map((a) => (
        <div key={a.id} className="mb-6 flex flex-wrap items-center gap-3 rounded-panel border border-tape/30 bg-tape-soft px-4 py-3">
          <SeverityMark s={a.severity} />
          <span className="text-14 text-text">Another unit has an open case on the same institution.</span>
          <span className="flex gap-1">{a.rules.map((r) => <RuleTag key={r} code={r} />)}</span>
          <Link to={`/overlaps/${encodeURIComponent(a.id)}`} className="ml-auto text-14 font-semibold text-tape hover:underline">Look at the overlap</Link>
        </div>
      ))}

      <Panel title="Proof at every step" note="Select a stamp to see what was checked, the evidence, and who did it." className="mb-6">
        <ProofRail stages={c.proof} />
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Panel title="Case details">
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              <Field label="Category">{categoryLabel(c.category)}</Field>
              <Field label="Status in the unit's own words">{c.localStatus}</Field>
              <Field label="Unit reference"><span className="font-mono text-13">{c.sourceRef}</span></Field>
              <Field label="Complaint number">{c.sourceComplaintRef ? <span className="font-mono text-13">{c.sourceComplaintRef}</span> : '—'}</Field>
              <Field label="Last action">{c.lastAction}, {fmtDate(c.lastActionOn)}</Field>
              <Field label="Next action">{c.nextAction}</Field>
              {c.disposalType && <Field label="How it was closed">{DISPOSAL_LABEL[c.disposalType]}</Field>}
            </dl>
          </Panel>

          <section id="reply" className={clsx('scroll-mt-24', !EXTRA && 'hidden')}>
            <Panel title="Reply from the institution" note="Institutions reply through a one-time link. They never see other cases.">
              {c.replies.length === 0 ? (
                <p className="text-14 text-muted">No reply has been asked for.{c.canAct && c.institution && !isClosed && <> <button className="font-medium text-ink-700 hover:underline" onClick={() => setAction('reply')}>Ask for one</button> when you send a notice.</>}</p>
              ) : (
                <ul className="space-y-4">
                  {[...c.replies].reverse().map((r) => (
                    <li key={r.id} className="rounded-xl border border-line p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className={clsx('rounded-full px-2.5 py-0.5 text-12 font-semibold', r.state === 'received' ? (r.submission!.late ? 'bg-turmeric-soft text-turmeric' : 'bg-good-soft text-good') : r.dueOn < api.today ? 'bg-tape-soft text-tape' : 'bg-ink-50 text-ink-900')}>
                          {r.state === 'received' ? (r.submission!.late ? 'Received late' : 'Received on time') : r.dueOn < api.today ? `Not received, was due ${fmtDate(r.dueOn)}` : `Waiting, due ${fmtDate(r.dueOn)}`}
                        </span>
                        <span className="text-12 text-muted">Asked by {r.createdBy} on {fmtDate(r.createdAt)}</span>
                      </div>
                      <p className="mt-2 text-14 text-text"><span className="text-muted">Asked for:</span> {r.askedFor}</p>
                      {r.state === 'waiting' && (
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-13">
                          <code className="rounded-md bg-paper px-2 py-1 font-mono text-12">{location.origin}/reply/{r.token}</code>
                          <button className={btn('quiet', '!px-2 !py-1 !text-13')} onClick={() => copy(`${location.origin}/reply/${r.token}`)}><Copy size={13} aria-hidden />{copied === `${location.origin}/reply/${r.token}` ? 'Copied' : 'Copy link'}</button>
                          <a className={btn('quiet', '!px-2 !py-1 !text-13')} href={`/reply/${r.token}`} target="_blank" rel="noreferrer"><ExternalLink size={13} aria-hidden />Open as the institution (demo)</a>
                        </div>
                      )}
                      {r.submission && (
                        <div className="mt-3 border-t border-line pt-3">
                          {r.submission.note && <p className="text-14 text-text">“{r.submission.note}”</p>}
                          <ul className="mt-2 space-y-1.5">
                            {r.submission.files.map((f) => (
                              <li key={f.sha256} className="flex flex-wrap items-center gap-2 text-13">
                                <FileText size={14} className="text-muted" aria-hidden /><span className="font-medium">{f.name}</span>
                                <span className="text-muted">{Math.round(f.size / 1024)} KB</span>
                                <span className="font-mono text-11 text-muted" title={`Fingerprint (SHA-256): ${f.sha256}. If the file is changed, the fingerprint changes.`}>fingerprint {f.sha256.slice(0, 10)}…</span>
                              </li>
                            ))}
                          </ul>
                          {r.submission.sameFileElsewhere.length > 0 && <p className="mt-2 flex items-start gap-1.5 text-13 text-turmeric"><AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />The same file was also sent for {r.submission.sameFileElsewhere.join(', ')}. Worth a look; it is not proof of anything by itself.</p>}
                          <p className="mt-2 text-12 text-muted">Received {fmtDate(r.submission.at)}. The reply does not change the case stage by itself: record what happens next.</p>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </section>

          <Panel title="What has happened so far" note="Newest first. Each entry has an audit number you can look up.">
            <ol className="relative ml-1.5 space-y-5 border-l border-line pl-6">
              {[...c.events].reverse().sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).map((e, i) => (
                <li key={i} className="relative">
                  <span className={clsx('absolute -left-[31px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-surface', e.type === 'linked' ? 'bg-turmeric' : e.type === 'disposed' ? 'bg-good' : e.type === 'escalated' || e.type === 'reply_received' ? 'bg-turmeric' : 'bg-ink-700')} aria-hidden />
                  <div className="text-14 text-text">{e.text}</div>
                  <div className="text-12 text-muted">{fmtDate(e.at)}, {e.actor === 'system' ? 'automatic' : e.actor}{e.auditRef && <> · <Link to={`/audit?q=${encodeURIComponent(c.uid)}`} className="font-mono hover:underline">entry {e.auditRef}</Link></>}</div>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <aside className="space-y-6">
          <Panel title="Institution, and how it was found">
            {c.institution ? (
              <>
                <Link to={`/institutions/${c.institution.id}`} className="font-display text-18 font-semibold leading-snug text-ink-950 hover:underline">{c.institution.name}</Link>
                <div className="text-13 text-muted">Permanent ID <span className="font-mono">{c.institution.permanentId}</span> · {c.institution.district}, {c.institution.state}</div>
                <div className="mt-4 border-t border-line pt-4">
                  <MatchBadge s={c.matchState} method={c.matchMethod} />
                  <p className="mt-1 text-13 text-text">The case wrote it as “{c.recorded.name}”{c.recorded.ids ? `, with ${c.recorded.ids}` : ''}.</p>
                  <div className="mt-3"><EvidenceList items={tagEvidence(c.matchEvidence)} /></div>
                </div>
              </>
            ) : (
              <p className="text-14 text-text">Written as “{c.recorded.name}”. Not matched to an institution yet. <Link className="font-medium text-ink-700 hover:underline" to="/matching">Open name check</Link></p>
            )}
          </Panel>

          <Panel title="Time limit">
            {c.deadline.state === 'closed' ? <p className="text-14 text-muted">The clock stopped when the case was {c.lifecycle === 'disposed' ? 'closed' : 'transferred'}.</p> : (
              <>
                <p className="font-mono text-14 text-ink-950">{fmtDate(c.receivedOn)} + {c.deadline.days} days = <strong>{fmtDate(c.deadline.dueOn)}</strong></p>
                <p className={clsx('mt-1 text-13', c.deadline.verified ? 'text-good' : 'text-turmeric')}>{c.deadline.verified ? 'CPGRAMS rule (verified)' : 'Prototype setting — not an AICTE-approved timeline'}</p>
                {c.deadline.interimDay && <p className="mt-1 text-13 text-muted">Interim reply by day {c.deadline.interimDay}: {fmtDate(addDays(c.receivedOn, c.deadline.interimDay))}{c.deadline.interimDue && <strong className="text-turmeric"> — due now</strong>}</p>}
                <h3 className="mt-4 text-12 font-semibold text-muted">Who is chasing it{c.escalation.late ? ` (${c.escalation.late} days late)` : ''}</h3>
                <ol className="mt-2 space-y-1.5">
                  {steps.map((s, i) => (
                    <li key={s.label} className="flex items-center gap-2 text-13">
                      <span className={clsx('flex h-5 w-5 items-center justify-center rounded-full font-mono text-11', s.on ? (i === 0 ? 'bg-ink-700 text-white' : 'bg-tape text-white') : 'border border-line text-muted')}>{i + 1}</span>
                      <span className={s.on ? 'text-ink-950' : 'text-muted'}>{s.label}</span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </Panel>

          {c.closureChecks.length > 0 && (
            <Panel title="Worth a second look">
              <ul className="space-y-2">{c.closureChecks.map((h) => <li key={h} className="flex gap-2 text-13 text-turmeric"><AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />{h}</li>)}</ul>
              <p className="mt-2 text-12 text-muted">Hints only. Nothing is blocked or changed.</p>
            </Panel>
          )}

          {c.institution && (
            <Panel title={otherUnits.size ? `Also with ${[...otherUnits].join(', ')}` : 'Only this unit is involved'} note="Every case about this institution, by unit.">
              <CaseLanes lanes={c.lanes} today={api.today} highlight={[c.id]} compact />
            </Panel>
          )}

          <Panel title="Linked cases">
            {c.linked.length ? (
              <ul className="space-y-2 text-14">{c.linked.map((l) => (
                <li key={l.id}><Link className="font-mono font-semibold text-ink-950 hover:underline" to={`/cases/${l.id}`}>{l.uid}</Link> <span className="text-muted">in {l.ownerUnit}: {DECISION_LABEL[l.how]}{l.lead ? `, ${l.lead} leads` : ''}</span></li>
              ))}</ul>
            ) : <p className="text-13 text-muted">None. Cases are linked only when people record a decision on an overlap.</p>}
          </Panel>

          <Panel title="Complainant">
            {!reveal ? (
              <>
                <p className="flex items-start gap-2 text-13 text-muted"><Lock size={14} className="mt-0.5 shrink-0" aria-hidden />Only officers of {c.ownerUnit} can see who filed this. Every view is written to the audit log.</p>
                <Button variant="secondary" className="mt-3" onClick={() => setReveal(true)}>{ownerOfficer ? 'Show complainant' : 'Try to view'}</Button>
              </>
            ) : sens.isError ? <ErrorBox error={sens.error} /> : sens.data ? (
              <>
                <dl className="space-y-3"><Field label="Name">{sens.data.complainant}</Field><Field label="Complaint text">{sens.data.narrative}</Field></dl>
                <p className="mt-3 text-12 text-muted">Your view was recorded as audit entry <span className="font-mono">{sens.data.auditRef}</span>.</p>
              </>
            ) : <Skeleton className="h-12" />}
          </Panel>
        </aside>
      </div>
    </>
  )
}
