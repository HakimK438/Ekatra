// Name check: cases that name an institution without a usable ID, most urgent first. Each row shows the best match and
// the evidence in one line; "Compare" opens the detail. Nothing is linked until a person chooses.
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AlertTriangle, Check, ChevronDown, ChevronRight, Link2, Minus, X } from 'lucide-react'
import clsx from 'clsx'
import { api } from '../lib/api'
import { useUser } from '../hooks/useUser'
import { CHANNEL_LABEL } from '../lib/labels'
import { canConfirmMatch, deadlineFor } from '../lib/logic'
import { VerdictMark } from '../components/Evidence'
import { CaseNo, InstName, PermId } from '../components/Ids'
import Receipt from '../components/Receipt'
import { Button, Empty, ErrorBox, PageHead, Skeleton, fmtShort } from '../components/ui'

type Item = Awaited<ReturnType<typeof api.matchingQueue>>[number]

const mark = (v?: string) => (v === 'same' ? <Check size={14} className="text-good" aria-label="agrees" /> : v === 'similar' ? <Minus size={14} className="text-turmeric" aria-label="similar" /> : v === 'different' ? <X size={14} className="text-tape" aria-label="differs" /> : <span className="text-muted" aria-label="not given">—</span>)

function Row({ c, canAct, onConfirmed }: { c: Item; canAct: boolean; onConfirmed: (m: string) => void }) {
  const { user } = useUser()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [pick, setPick] = useState(0)
  const [reason, setReason] = useState('')
  const done = () => qc.invalidateQueries()
  const accept = useMutation({ mutationFn: (inst: string) => api.acceptMatch(c.id, inst, user), onSuccess: (r) => { onConfirmed(`${r.uid} is now linked to ${r.institution}. “${r.alias}” will be recognised automatically next time.`); done() } })
  const reject = useMutation({ mutationFn: (inst: string) => api.rejectMatch(c.id, inst, user), onSuccess: done })
  const unres = useMutation({ mutationFn: () => api.markUnresolved(c.id, reason, user), onSuccess: done })
  const err = accept.error ?? reject.error ?? unres.error
  const s = c.suggestions[pick]
  const d = deadlineFor({ ...c, lifecycle: c.lifecycle } as never, api.today)
  const close = c.suggestions.length > 1 && c.suggestions[0].score - c.suggestions[1].score < 0.05
  const row = (label: string) => s?.check.rows.find((r) => r.label === label)
  const visible = s?.check.rows.filter((r) => r.recorded || r.institution) ?? []

  return (
    <>
      <tr className="align-top">
        <td className="whitespace-nowrap px-4 py-3"><CaseNo id={c.id} uid={c.uid} /><div className="text-12 text-muted">{c.ownerUnit}</div></td>
        <td className="px-3 py-3"><div className="font-medium text-ink-950">“{c.recorded.name}”</div><div className="text-12 text-muted">{[c.recorded.district, c.recorded.pin].filter(Boolean).join(' · ') || 'No place given'}</div></td>
        <td className="px-3 py-3">
          {s ? <><InstName id={s.institutionId} name={s.institution.name} permanentId={s.institution.permanentId} className="!flex-col !gap-0" />
            {close && <div className="mt-1 inline-flex items-center gap-1 text-12 text-turmeric"><AlertTriangle size={12} aria-hidden />Look-alike: check before choosing</div>}</>
            : <span className="text-muted">{c.matchState === 'unresolved' ? 'Left unmatched by a person' : 'Nothing close in the register'}</span>}
        </td>
        <td className="px-3 py-3 text-12">
          {s ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="whitespace-nowrap">Name <strong className="font-mono">{Math.round(s.check.nameScore * 100)}</strong> <span className="text-muted">({s.check.rows[0].verdict === 'same' ? 'same' : s.check.rows[0].verdict === 'similar' ? 'similar' : 'different'})</span></span>
              <span className="inline-flex items-center gap-1 whitespace-nowrap">District {mark(row('District')?.verdict)}</span>
              <span className="inline-flex items-center gap-1 whitespace-nowrap">PIN {mark(row('PIN')?.verdict)}</span>
              <span className="whitespace-nowrap text-muted">Overall {Math.round(s.score * 100)}</span>
            </div>
          ) : <span className="text-muted">—</span>}
        </td>
        <td className="whitespace-nowrap px-3 py-3"><span className="font-mono font-semibold">{d.age}/{d.days}</span><div className={clsx('text-12', d.state === 'overdue' ? 'text-tape' : d.state === 'approaching' ? 'text-turmeric' : 'text-muted')}>{CHANNEL_LABEL[c.channel]}</div></td>
        <td className="px-3 py-3">
          <div className="flex flex-wrap gap-2">
            {canAct && s && <Button className="!px-3 !py-1 !text-13" onClick={() => accept.mutate(s.institutionId)} disabled={accept.isPending}>Confirm</Button>}
            <Button variant="secondary" className="!px-3 !py-1 !text-13" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}Compare</Button>
          </div>
        </td>
      </tr>
      <tr className="border-b border-line">
        <td />
        <td colSpan={5} className="px-3 pb-3 text-12 text-turmeric">
          <span className="inline-flex items-center gap-1.5"><AlertTriangle size={12} aria-hidden />Overlap checks are paused until this is matched. Received {fmtShort(c.receivedOn)}.</span>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-line bg-paper/60">
          <td />
          <td colSpan={5} className="px-3 py-4">
            {!s ? <p className="text-14 text-text">No institution in the register is close enough. Nothing has been linked.</p> : (
              <>
                {c.suggestions.length > 1 && (
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-13" role="group" aria-label="Other candidates">
                    <span className="text-muted">Candidates:</span>
                    {c.suggestions.map((x, i) => <button key={x.institutionId} type="button" onClick={() => setPick(i)} aria-pressed={pick === i}
                      className={clsx('rounded-full border px-3 py-1', pick === i ? 'border-ink-700 bg-ink-700 text-white' : 'border-line bg-surface hover:border-ink-500')}>{x.institution.name} <span className="font-mono text-12 opacity-80">{Math.round(x.score * 100)}</span></button>)}
                  </div>
                )}
                <table className="w-full max-w-3xl text-left text-13">
                  <caption className="sr-only">Detail by detail comparison with {s.institution.name}</caption>
                  <thead className="text-11 text-muted"><tr><th scope="col" className="py-1 font-medium">Detail</th><th scope="col" className="py-1 font-medium">In the case</th><th scope="col" className="py-1 font-medium">In the register</th><th scope="col" className="py-1 font-medium">Check</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {visible.map((r) => (
                      <tr key={r.label}>
                        <th scope="row" className="py-1.5 pr-3 font-medium text-muted">{r.label}</th>
                        <td className="py-1.5 pr-3">{r.recorded || <span className="text-muted">—</span>}</td>
                        <td className="py-1.5 pr-3">{r.institution || <span className="text-muted">—</span>}</td>
                        <td className="py-1.5"><VerdictMark v={r.verdict} />{r.note && <div className="text-11 text-muted">{r.note}</div>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!c.recorded.permanentId && !c.recorded.currentId && <p className="mt-2 text-12 text-muted">The case gives no ID, so only the name, district and PIN can be compared.</p>}
                <p className="mt-1 text-12 text-muted">Permanent ID of this candidate: <PermId id={s.institution.permanentId} /> · <Link to={`/institutions/${s.institutionId}`} className="font-medium text-ink-700 hover:underline">Open the institution</Link></p>
              </>
            )}
            {canAct && (
              <div className="mt-4 flex flex-wrap items-end gap-2">
                {s && <Button variant="secondary" className="!px-3 !py-1 !text-13" onClick={() => reject.mutate(s.institutionId)} disabled={reject.isPending}>Not this one</Button>}
                {c.matchState !== 'unresolved' && (
                  <>
                    <label className="min-w-[240px] flex-1 text-12 text-muted">Not in the register? Say why
                      <input className="mt-1 block w-full rounded-xl border border-line bg-surface px-3 py-1.5 text-13 text-text focus:border-ink-500 focus:outline-none focus:ring-4 focus:ring-ink-100" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: the institution is not in the register yet" />
                    </label>
                    <Button variant="secondary" className="!px-3 !py-1 !text-13" disabled={!reason.trim() || unres.isPending} onClick={() => unres.mutate()}>Not in register</Button>
                  </>
                )}
              </div>
            )}
            {err && <div className="mt-3"><ErrorBox error={err} /></div>}
          </td>
        </tr>
      )}
    </>
  )
}

export default function Matching() {
  const { user } = useUser()
  const q = useQuery({ queryKey: ['matching'], queryFn: api.matchingQueue })
  const canAct = canConfirmMatch(user)
  const [receipt, setReceipt] = useState<string | null>(null)
  // Most urgent first: the least time left on the clock. Cases with nothing to choose from go last.
  const list = [...(q.data ?? [])].sort((a, b) => {
    const left = (c: Item) => deadlineFor({ ...c } as never, api.today).daysToDue + (c.suggestions.length ? 0 : 1000)
    return left(a) - left(b)
  })
  return (
    <>
      <PageHead kind="matching" icon={<Link2 size={22} />} title="Is this the same college?" lead="These cases name an institution without a usable ID, so overlap checks cannot run on them yet. Confirm the right institution. Your choice is remembered." />
      {receipt && <Receipt className="mb-5 max-w-3xl" at={new Date().toISOString()} by={`${user.name}`} text={receipt} />}
      {q.isError ? <ErrorBox error={q.error} /> : !q.data ? <Skeleton className="h-64" /> :
        list.length === 0 ? <Empty title="Every case is matched to an institution">New cases without an ID will appear here.</Empty> : (
          <div className="overflow-x-auto rounded-panel border border-line bg-surface shadow-card">
            <table className="w-full min-w-[980px] text-left text-13">
              <thead className="border-b border-line text-12 text-muted"><tr>
                <th className="px-4 py-2 font-medium">Case</th><th className="px-3 py-2 font-medium">What the case says</th><th className="px-3 py-2 font-medium">Best match</th>
                <th className="px-3 py-2 font-medium">Evidence</th><th className="px-3 py-2 font-medium">Clock (day / limit)</th><th className="px-3 py-2 font-medium">{canAct ? 'Action' : 'Detail'}</th>
              </tr></thead>
              <tbody>{list.map((c) => <Row key={c.id} c={c} canAct={canAct} onConfirmed={setReceipt} />)}</tbody>
            </table>
          </div>
        )}
    </>
  )
}
