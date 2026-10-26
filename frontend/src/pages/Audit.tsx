// The audit log: every action in order, with a tamper check. Each entry carries the fingerprint of the one
// before it, so changing or deleting any entry breaks the chain from that point on.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { ScrollText, Search, ShieldAlert, ShieldCheck } from 'lucide-react'
import { api } from '../lib/api'
import { ErrorBox, PageHead, Skeleton } from '../components/ui'

export default function Audit() {
  const [sp, setSp] = useSearchParams()
  const [text, setText] = useState(sp.get('q') ?? '')
  const f = { q: sp.get('q') ?? undefined, action: sp.get('action') ?? undefined }
  const q = useQuery({ queryKey: ['audit', f], queryFn: () => api.auditLog(f), placeholderData: (p) => p })
  const set = (k: string, v?: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n) }

  return (
    <>
      <PageHead kind="audit" icon={<ScrollText size={22} />} title="Audit log" lead="Every action, in order. Entries can be added but never changed or removed. Complainant details are never written here." />
      {q.isError ? <ErrorBox error={q.error} /> : !q.data ? <Skeleton className="h-96" /> : (
        <>
          <section aria-live="polite" className={`mb-5 flex flex-wrap items-center gap-3 rounded-panel border px-5 py-4 ${q.data.check.ok ? 'border-good/30 bg-good-soft' : 'border-tape/30 bg-tape-soft'}`}>
            {q.data.check.ok ? <ShieldCheck size={26} className="text-good" aria-hidden /> : <ShieldAlert size={26} className="text-tape" aria-hidden />}
            <div>
              <p className={`font-display text-17 font-semibold ${q.data.check.ok ? 'text-good' : 'text-tape'}`}>{q.data.check.ok ? `Tamper check passed: all ${q.data.check.count} entries are intact` : `Tamper check failed at entry #${q.data.check.brokenAt}`}</p>
              <p className="text-13 text-text">Each entry stores a fingerprint of the entry before it. If anyone edits or removes an entry, every fingerprint after it stops matching.</p>
            </div>
          </section>
          <form className="mb-4 flex flex-wrap gap-3" onSubmit={(e) => { e.preventDefault(); set('q', text.trim() || undefined) }}>
            <label className="relative min-w-[260px] flex-1">
              <span className="sr-only">Search by person, case or detail</span>
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search by person, case number or detail" className="w-full rounded-full border border-line bg-surface py-2.5 pl-10 pr-4 text-14 focus:border-ink-500 focus:outline-none focus:ring-4 focus:ring-ink-100" />
            </label>
            <select aria-label="Kind of action" className="rounded-full border border-line bg-surface px-4 py-2 text-14" value={f.action ?? ''} onChange={(e) => set('action', e.target.value || undefined)}>
              <option value="">Every kind of action</option>{q.data.actions.map((a) => <option key={a}>{a}</option>)}
            </select>
          </form>
          <p className="mb-2 text-13 text-muted">{q.data.total} entr{q.data.total === 1 ? 'y' : 'ies'}{q.data.total > q.data.rows.length ? `, newest ${q.data.rows.length} shown` : ''}</p>
          <div className="overflow-x-auto rounded-panel border border-line bg-surface shadow-card">
            <table className="w-full min-w-[900px] text-left text-13">
              <thead className="bg-paper/70 text-12 text-muted"><tr><th className="px-4 py-2.5 font-medium">Entry</th><th className="px-4 py-2.5 font-medium">When</th><th className="px-4 py-2.5 font-medium">Who</th><th className="px-4 py-2.5 font-medium">What</th><th className="px-4 py-2.5 font-medium">About</th><th className="px-4 py-2.5 font-medium">Fingerprint</th></tr></thead>
              <tbody className="divide-y divide-line">
                {q.data.rows.map((e) => (
                  <tr key={e.seq}>
                    <td className="px-4 py-2 font-mono text-muted">#{e.seq}</td>
                    <td className="whitespace-nowrap px-4 py-2 font-mono text-12">{e.at.replace('T', ' ')}</td>
                    <td className="px-4 py-2">{e.actor}</td>
                    <td className="px-4 py-2 font-medium">{e.action}</td>
                    <td className="px-4 py-2"><span className="font-mono text-12">{e.entity}</span>{e.details && <div className="text-12 text-muted">{e.details}</div>}</td>
                    <td className="px-4 py-2 font-mono text-11 text-muted" title={`Previous: ${e.prevHash}`}>{e.hash.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}
