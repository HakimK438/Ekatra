// Data health: can the numbers be trusted? Every dashboard number recounted a second way, missing IDs,
// rows that could not be saved, old data, and closures that may not reflect real resolution.
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AlertTriangle, Check, HeartPulse, X } from 'lucide-react'
import clsx from 'clsx'
import { api } from '../lib/api'
import { UnitDot } from '../components/Unit'
import { ErrorBox, PageHead, Panel, Skeleton } from '../components/ui'

const METHOD_COLOR: Record<string, string> = { T1: 'bg-ink-700', T2: 'bg-ink-500', T4: 'bg-good', none: 'bg-turmeric' }

export default function DataHealth() {
  const q = useQuery({ queryKey: ['data-health'], queryFn: api.dataHealth })
  if (q.isError) return <ErrorBox error={q.error} />
  if (!q.data) return <Skeleton className="h-96" />
  const d = q.data
  const allOk = d.numbers.every((n) => n.ok)
  const stale = d.sources.filter((s) => s.stale)
  const maxField = Math.max(1, ...d.byField.map((f) => f.count))
  return (
    <>
      <PageHead icon={<HeartPulse size={22} />} title="Data health" lead="Can the numbers be trusted? Here is the proof, and what to fix." />

      <Panel className="mb-6" title={allOk ? 'Every number on the dashboard was counted twice and both counts agree' : 'Some numbers do not agree. Please report this.'}
        note="Each number is counted again in a separate, simple way. If anything were lost or double-counted, the two would differ.">
        <div className="-mx-6 -mb-6 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-14">
            <thead className="border-b border-line text-12 text-muted"><tr><th className="px-6 py-2 font-medium">Number</th><th className="px-3 py-2 font-medium">On the dashboard</th><th className="px-3 py-2 font-medium">Counted again</th><th className="px-3 py-2 font-medium">How it was counted again</th><th className="px-6 py-2 font-medium">Result</th></tr></thead>
            <tbody className="divide-y divide-line">{d.numbers.map((n) => (
              <tr key={n.tile}>
                <td className="px-6 py-2.5 font-medium">{n.tile}</td><td className="px-3 py-2.5 font-mono">{n.shown}</td><td className="px-3 py-2.5 font-mono">{n.recount}</td><td className="px-3 py-2.5 text-13 text-muted">{n.how}</td>
                <td className="px-6 py-2.5">{n.ok ? <span className="inline-flex items-center gap-1 font-semibold text-good"><Check size={15} aria-hidden />Agrees</span> : <span className="inline-flex items-center gap-1 font-semibold text-tape"><X size={15} aria-hidden />Differs</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Panel>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <Panel title={`${d.pidPct}% of cases came with a Permanent ID`} note="The Permanent ID is the surest way to find the institution. Asking units to always record it removes most name checks.">
          <div className="flex h-4 overflow-hidden rounded-full" aria-hidden>
            {d.methods.map((m) => <span key={m.key} className={METHOD_COLOR[m.key]} style={{ width: `${(m.count / Math.max(1, d.total)) * 100}%` }} />)}
          </div>
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {d.methods.map((m) => <li key={m.key} className="flex items-center gap-2 text-13"><span className={clsx('h-3 w-3 rounded-sm', METHOD_COLOR[m.key])} aria-hidden /><span className="flex-1">Institution found by {m.label.toLowerCase()}</span><span className="font-mono font-semibold">{m.count}</span></li>)}
          </ul>
          {d.methods.find((m) => m.key === 'none')!.count > 0 && <p className="mt-3 text-13"><Link to="/matching" className="font-medium text-ink-700 hover:underline">Open name check</Link> to match the rest.</p>}
        </Panel>

        <Panel title={stale.length ? `${stale.map((s) => s.unit).join(', ')} ${stale.length === 1 ? 'has' : 'have'} not sent data for over a day` : 'Every unit sent data within the last day'} note="Numbers from a unit with old data may be behind.">
          <ul className="grid gap-2 sm:grid-cols-2">
            {d.sources.map((s) => (
              <li key={s.unit} className={clsx('flex items-center gap-2 rounded-lg px-3 py-1.5 text-13', s.stale ? 'bg-tape-soft text-tape' : 'bg-paper')}>
                <UnitDot code={s.unit} /><span className="font-semibold">{s.unit}</span><span className="ml-auto font-mono">{s.hoursAgo < 24 ? `${s.hoursAgo} h` : `${Math.floor(s.hoursAgo / 24)} d`} ago</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <Panel title={d.rejects.length ? `${d.rejects.length} rows could not be saved. Most problems are in “${d.byField[0]?.field}”` : 'Every imported row was saved'} note="From files sent in by units. Each row has a fix on its import receipt.">
          <ul className="space-y-2">
            {d.byField.map((f) => (
              <li key={f.field} className="grid grid-cols-[150px_1fr_28px] items-center gap-3 text-13">
                <span>{f.field}</span><span className="h-2.5 rounded-full bg-paper"><span className="block h-2.5 rounded-full bg-tape" style={{ width: `${(f.count / maxField) * 100}%` }} /></span><span className="text-right font-mono font-semibold">{f.count}</span>
              </li>
            ))}
          </ul>
          <ul className="mt-4 space-y-1 border-t border-line pt-3 text-13">
            {d.rejects.slice(0, 6).map((r, i) => <li key={i}><Link to={`/import/${r.batch}`} className="font-mono text-12 text-ink-700 hover:underline">{r.file}</Link> row {r.row}: {r.problem}</li>)}
          </ul>
        </Panel>

        <Panel title={d.closures.length ? `${d.closures.length} closed case${d.closures.length === 1 ? '' : 's'} may not have been really resolved` : 'No doubtful closures'} note="Hints only: a case closed with no action on record, while a reply was awaited, or as a duplicate with no decision.">
          {d.closures.length ? (
            <ul className="max-h-64 space-y-2 overflow-y-auto">
              {d.closures.map((c) => <li key={c.id} className="text-13"><Link to={`/cases/${c.id}`} className="font-mono font-semibold text-ink-950 hover:underline">{c.uid}</Link> <span className="text-muted">({c.unit})</span><ul className="ml-4 text-turmeric">{c.hints.map((h) => <li key={h} className="flex gap-1.5"><AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />{h}</li>)}</ul></li>)}
            </ul>
          ) : <p className="text-14 text-muted">Every closed case has an action on record.</p>}
        </Panel>
      </div>

      {d.unmappedWords.length > 0 && (
        <Panel title="Status words a unit used that we did not know" note="Rows using them were held back. Explain them once on the import screen and they are remembered.">
          <ul className="space-y-1 text-13">{d.unmappedWords.map((w, i) => <li key={i}><UnitDot code={w.unit} /> <strong>{w.unit}</strong>: {w.text}</li>)}</ul>
        </Panel>
      )}
    </>
  )
}
