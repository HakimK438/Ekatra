// On the institution page: every letter any unit has sent this institution, where they meet, and one combined list.
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { combinedAsk, work, SERVER_ONLY } from '../lib/workApi'
import { UnitPill } from './Unit'
import { FindingCard } from './WorkBits'
import { LetterTimeline } from './Logic'
import { api } from '../lib/api'
import { Panel, fmtDate } from './ui'

export default function InstitutionRequests({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['institution-requests', id], queryFn: () => work.institutionRequests(id), enabled: !SERVER_ONLY })
  const vocab = useQuery({ queryKey: ['requests', 'vocab'], queryFn: () => work.requests({ state: 'none' }), enabled: !SERVER_ONLY })
  if (SERVER_ONLY || !q.data) return null
  const { requests, findings } = q.data
  const labels = Object.fromEntries((vocab.data?.items ?? []).map((i) => [i.key, i.label]))
  const open = requests.filter((r) => r.state === 'open')
  const combined = new Set(open.map((r) => r.unit)).size >= 2 ? combinedAsk(requests, labels) : []
  return (
    <Panel title="Letters to this institution" note="What every unit has asked it to send, by when." action={<Link to="/letters" className="text-13 underline">Read a letter</Link>}>
      {!requests.length && <p className="text-14 text-muted">No unit has recorded a letter to this institution.</p>}
      {requests.length > 0 && <div className="mb-4"><LetterTimeline today={api.today} rows={requests.filter((r) => r.state !== 'withdrawn').map((r) => ({ ...r, key: r.id }))} /></div>}
      {findings.length > 0 && <ul className="mb-4 space-y-2">{findings.map((f) => <FindingCard key={f.code + f.text} f={f} />)}</ul>}
      <ol className="relative ml-2 space-y-3 border-l border-line pl-5">{[...requests].reverse().map((r) => (
        <li key={r.id} className="relative">
          <span className={clsx('absolute -left-[27px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-surface', r.state === 'answered' ? 'bg-good' : r.daysLate ? 'bg-tape' : 'bg-ink-700')} aria-hidden />
          <p className="flex flex-wrap items-center gap-2 text-13"><span className="text-muted">{fmtDate(r.letterDate)}</span><UnitPill code={r.unit} /><span className="font-medium text-ink-950">{r.kindLabel}</span>
            <span className="text-muted">{r.state === 'answered' ? `answered ${fmtDate(r.answeredOn!)}` : r.state === 'withdrawn' ? 'withdrawn' : r.daysLate ? `reply ${r.daysLate} days late` : r.dueOn ? `reply due ${fmtDate(r.dueOn)}` : ''}</span></p>
          <p className="text-14 text-ink-950">{[...r.itemLabels, ...r.otherItems].join(' · ')}</p>
        </li>))}</ol>
      {combined.length > 0 && (
        <div className="mt-4 rounded-lg bg-paper p-3">
          <p className="text-13 font-semibold text-ink-950">One combined list for the institution (a draft; an officer sends it)</p>
          <ol className="mt-1.5 space-y-1 text-13">{combined.map((x) => <li key={x.label} className="flex flex-wrap items-center gap-2">{x.label}<span className="text-muted">by {x.due ? fmtDate(x.due) : 'no date'}</span>{x.units.map((u) => <UnitPill key={u} code={u} />)}</li>)}</ol>
        </div>
      )}
    </Panel>
  )
}
