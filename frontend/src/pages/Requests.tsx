// Requests to institutions: every letter any unit has sent, its reply date, and where requests meet (asked twice,
// two dates, a reply due near another unit's hearing). For an institution with several open requests, one combined
// list (earliest date per document) that an officer can send instead of separate letters.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlarmClock, CalendarClock, Copy, CopyCheck, FileSearch, Inbox, Layers, Repeat2 } from 'lucide-react'
import { LetterTimeline, LogicStrip } from '../components/Logic'
import { SETTINGS } from '../lib/logic'
import { api } from '../lib/api'
import clsx from 'clsx'
import { useUser } from '../hooks/useUser'
import { combinedAsk, work, SERVER_ONLY, type RequestList } from '../lib/workApi'
import { UnitPill } from '../components/Unit'
import { FindingCard, ServerOnly } from '../components/WorkBits'
import { Button, Chip, Empty, ErrorBox, PageHead, Panel, Skeleton, fmtDate } from '../components/ui'

type Row = RequestList['rows'][number]

export default function Requests() {
  const { user } = useUser()
  const [state, setState] = useState<'open' | 'answered' | ''>('open')
  const [mine, setMine] = useState(!!user.unit)
  const q = useQuery({ queryKey: ['requests', state, mine, user.unit], queryFn: () => work.requests({ state, unit: mine ? user.unit : undefined }), enabled: !SERVER_ONLY })
  const all = useQuery({ queryKey: ['requests', 'all-open'], queryFn: () => work.requests({ state: 'open' }), enabled: !SERVER_ONLY })
  const [combineFor, setCombineFor] = useState<string | null>(null)

  if (SERVER_ONLY) return <><PageHead icon={<Inbox size={22} />} title="Letters to institutions" /><ServerOnly /></>
  const c = q.data?.counts
  const labels = Object.fromEntries((q.data?.items ?? []).map((i) => [i.key, i.label]))
  const byInst = new Map<string, Row[]>()
  for (const r of all.data?.rows ?? []) byInst.set(r.institutionId, [...(byInst.get(r.institutionId) ?? []), r])
  const multi = [...byInst.entries()].filter(([, rs]) => new Set(rs.map((r) => r.unit)).size >= 2)

  return (
    <>
      <PageHead icon={<Inbox size={22} />} title="Letters to institutions"
        lead="What each unit asked each institution to send, and by when."
        stats={c ? [
          { label: 'Open requests', value: c.open },
          { label: 'Replies past their date', value: c.late, tone: c.late ? 'red' : undefined },
          { label: 'Asked again by another unit', value: c.askedAgain, tone: c.askedAgain ? 'amber' : undefined },
          { label: 'Institutions with findings', value: c.institutionsWithFindings },
        ] : undefined}>
        <Link to="/letters" className="flex items-center gap-2 rounded-full bg-ink-700 px-4 py-2 text-14 text-white"><FileSearch size={16} aria-hidden />Read a letter</Link>
      </PageHead>

      <LogicStrip title="Checks on every letter" steps={[
        { icon: Repeat2, title: 'Asked before', text: <>Same document, another unit, last {SETTINGS.demandLookbackDays} days.</>, tone: 'rule' },
        { icon: CalendarClock, title: 'Two dates', text: 'Same document, different reply dates.', tone: 'rule' },
        { icon: AlarmClock, title: 'Near a hearing', text: <>Reply due within {SETTINGS.demandNearDays} days of another unit’s hearing.</>, tone: 'rule' },
        { icon: Layers, title: 'Many at once', text: 'Three or more open, from two or more units.', tone: 'rule' },
        { icon: CopyCheck, title: 'Late reply', text: 'Flagged to the unit that asked.' },
      ]} foot="Facts only; an officer decides. Prototype settings. Synthetic data." />

      {multi.length > 0 && (
        <Panel title="Institutions asked by more than one unit" note="One combined list instead of separate letters: every document asked, the earliest reply date, and which units asked. A draft only; an officer sends it.">
          <ul className="grid gap-3 md:grid-cols-2">
            {multi.map(([iid, rs]) => (
              <li key={iid} className="rounded-xl border border-line p-4">
                <div className="flex items-start justify-between gap-3">
                  <div><Link to={`/institutions/${iid}`} className="font-display text-16 font-semibold text-ink-950 hover:underline">{rs[0].institution}</Link>
                    <p className="mt-1 flex flex-wrap gap-1.5">{[...new Set(rs.map((r) => r.unit))].map((u) => <UnitPill key={u} code={u} />)}</p></div>
                  <Button variant="secondary" onClick={() => setCombineFor(combineFor === iid ? null : iid)}><Layers size={15} aria-hidden />{combineFor === iid ? 'Hide' : 'Combined list'}</Button>
                </div>
                <div className="mt-3"><LetterTimeline today={api.today} rows={rs.map((r) => ({ ...r, key: r.id }))} /></div>
                {combineFor === iid && <Combined rows={rs} labels={labels} />}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel className="mt-6" title="All letters" action={
        <div className="flex flex-wrap gap-2">
          {user.unit && <Chip active={mine} onClick={() => setMine(!mine)}>Only {user.unit}</Chip>}
          {(['open', 'answered', ''] as const).map((s) => <Chip key={s || 'all'} active={state === s} onClick={() => setState(s)}>{s === 'open' ? 'Open' : s === 'answered' ? 'Answered' : 'All'}</Chip>)}
        </div>}>
        {q.isLoading && <Skeleton className="h-48" />}
        {q.isError && <ErrorBox error={q.error} />}
        {q.data && !q.data.rows.length && <Empty title="No requests here">Record one with “Read a new letter”.</Empty>}
        <ul className="space-y-3">{q.data?.rows.map((r) => <RequestCard key={r.id} r={r} />)}</ul>
      </Panel>
    </>
  )
}

function Combined({ rows, labels }: { rows: Row[]; labels: Record<string, string> }) {
  const list = useMemo(() => combinedAsk(rows, labels), [rows, labels])
  const text = [`To: The Principal, ${rows[0].institution}`, '', 'Please send the following to AICTE. Several units asked for them; one reply serves all of them.', '',
    ...list.map((x, i) => `${i + 1}. ${x.label}, by ${x.due ? fmtDate(x.due) : 'the date in the letter'} (asked by ${x.units.join(', ')}${x.refs.length ? `; ${x.refs.join(', ')}` : ''})`)].join('\n')
  const [copied, setCopied] = useState(false)
  return (
    <div className="mt-3 rounded-lg bg-paper p-3">
      <ol className="space-y-1.5 text-13 text-ink-950">{list.map((x) => (
        <li key={x.label} className="flex flex-wrap items-center gap-2"><span className="font-medium">{x.label}</span><span className="text-muted">by {x.due ? fmtDate(x.due) : 'no date'}</span>{x.units.map((u) => <UnitPill key={u} code={u} />)}</li>))}</ol>
      <button type="button" className="mt-3 flex items-center gap-1.5 text-13 underline" onClick={() => { navigator.clipboard?.writeText(text); setCopied(true) }}><Copy size={13} aria-hidden />{copied ? 'Copied the draft' : 'Copy as a draft letter'}</button>
    </div>
  )
}

function RequestCard({ r }: { r: Row }) {
  const { user } = useUser()
  const qc = useQueryClient()
  const [note, setNote] = useState('')
  const [mode, setMode] = useState<'answered' | 'withdraw' | null>(null)
  const can = user.role === 'coordinator' || ((user.role === 'dealing_officer' || user.role === 'nodal_officer') && user.unit === r.unit)
  const m = useMutation({ mutationFn: () => (mode === 'answered' ? work.answered(r.id, note) : work.withdraw(r.id, note)), onSuccess: () => { setMode(null); qc.invalidateQueries() } })
  return (
    <li className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-center gap-2">
        <UnitPill code={r.unit} />
        <Link to={`/institutions/${r.institutionId}`} className="font-medium text-ink-950 hover:underline">{r.institution}</Link>
        <span className="text-13 text-muted">{r.kindLabel} of {fmtDate(r.letterDate)}{r.letterRef ? ` · ${r.letterRef}` : ''}</span>
        <span className={clsx('ml-auto rounded-full px-2.5 py-0.5 text-12', r.state === 'answered' ? 'bg-good/10 text-good' : r.state === 'withdrawn' ? 'bg-ink-50 text-muted' : r.daysLate ? 'bg-tape/10 text-tape' : 'bg-ink-50 text-ink-900')}>
          {r.state === 'answered' ? `Answered ${fmtDate(r.answeredOn!)}` : r.state === 'withdrawn' ? 'Withdrawn' : r.daysLate ? `Reply ${r.daysLate} days late` : r.dueOn ? `Reply due ${fmtDate(r.dueOn)}` : 'No reply date'}</span>
      </div>
      <p className="mt-2 text-14 text-ink-950">{[...r.itemLabels, ...r.otherItems].join(' · ') || 'No documents listed'}</p>
      {r.hearingOn && <p className="mt-1 text-13 text-muted">{r.hearingWhat ?? 'Hearing'} on {fmtDate(r.hearingOn)}</p>}
      {r.findings.length > 0 && <ul className="mt-3 space-y-2">{r.findings.map((f) => <FindingCard key={f.code + f.text} f={f} />)}</ul>}
      {r.state === 'open' && can && (
        <div className="mt-3">
          {!mode ? (
            <div className="flex gap-2"><Button variant="secondary" onClick={() => setMode('answered')}>Reply received</Button><Button variant="quiet" onClick={() => setMode('withdraw')}>Withdraw</Button></div>
          ) : (
            <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); m.mutate() }}>
              <input className="min-w-[16rem] flex-1 rounded-full border border-line px-4 py-2 text-13" value={note} onChange={(e) => setNote(e.target.value)} required={mode === 'withdraw'}
                placeholder={mode === 'answered' ? 'What was received (optional)' : 'Why it is withdrawn'} aria-label="Note" />
              <Button type="submit" disabled={m.isPending}>{mode === 'answered' ? 'Save reply' : 'Withdraw'}</Button>
              <Button type="button" variant="quiet" onClick={() => setMode(null)}>Cancel</Button>
            </form>
          )}
          {m.isError && <div className="mt-2"><ErrorBox error={m.error} /></div>}
        </div>
      )}
      <p className="mt-2 text-12 text-muted">Recorded by {r.by}</p>
    </li>
  )
}
