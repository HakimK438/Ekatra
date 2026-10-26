// The receipt for one import: the counts add up (proof nothing was lost), each row that was not saved has
// a fix, and what the automatic checks found in the new cases.
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { Check, Download, GitMerge, Link2, ReceiptText, X } from 'lucide-react'
import clsx from 'clsx'
import { api } from '../lib/api'
import { toCsv } from '../lib/imports'
import { saveText } from '../lib/download'
import { UnitPill } from '../components/Unit'
import { ErrorBox, PageHead, Panel, Skeleton, btn, fmtDate } from '../components/ui'

export default function ImportReceipt() {
  const { id = '' } = useParams()
  const q = useQuery({ queryKey: ['import', id], queryFn: () => api.importBatch(id) })
  if (q.isError) return <ErrorBox error={q.error} />
  if (!q.data) return <Skeleton className="h-80" />
  const b = q.data
  const adds = b.created + b.updated + b.rejected === b.rows
  const term = (n: number, label: string, cls: string) => <span className="inline-flex flex-col items-center"><span className={clsx('font-display text-32 font-semibold leading-none', cls)}>{n}</span><span className="mt-1 text-12 text-muted">{label}</span></span>
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-13 text-muted"><Link className="hover:underline" to="/import">Import</Link> <span aria-hidden>/</span> receipt</nav>
      <PageHead icon={<ReceiptText size={22} />} title="Import receipt" lead={<><span className="font-mono">{b.fileName}</span> from <UnitPill code={b.unit} />, sent by {b.by} on {fmtDate(b.at)}.</>} />

      <Panel title={adds ? 'Every row is accounted for' : 'The counts do not add up — please report this'} className="mb-6">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3" aria-label={`${b.rows} rows in = ${b.created} new + ${b.updated} updated + ${b.rejected} not saved`}>
          {term(b.rows, 'rows in the file', 'text-ink-950')}<span className="font-display text-28 text-muted">=</span>
          {term(b.created, 'new cases', 'text-good')}<span className="font-display text-28 text-muted">+</span>
          {term(b.updated, 'updated', 'text-ink-700')}<span className="font-display text-28 text-muted">+</span>
          {term(b.rejected, 'not saved', b.rejected ? 'text-tape' : 'text-muted')}
          <span className={clsx('ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-13 font-semibold', adds ? 'bg-good-soft text-good' : 'bg-tape-soft text-tape')}>{adds ? <Check size={14} aria-hidden /> : <X size={14} aria-hidden />}{adds ? 'Checked' : 'Mismatch'}</span>
        </div>
      </Panel>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-panel border border-line bg-surface p-5"><div className="flex items-center gap-2 text-13 text-muted"><Check size={15} className="text-ink-700" aria-hidden />Institution found automatically</div><div className="mt-1 font-display text-28 font-semibold text-ink-950">{b.autoMatched}</div></div>
        <Link to="/matching" className="rounded-panel border border-line bg-surface p-5 hover:border-ink-500"><div className="flex items-center gap-2 text-13 text-muted"><Link2 size={15} className="text-turmeric" aria-hidden />Names for a person to check</div><div className="mt-1 font-display text-28 font-semibold text-turmeric">{b.namesToCheck}</div></Link>
        <Link to="/overlaps" className="rounded-panel border border-line bg-surface p-5 hover:border-ink-500"><div className="flex items-center gap-2 text-13 text-muted"><GitMerge size={15} className="text-tape" aria-hidden />New possible overlaps</div><div className="mt-1 font-display text-28 font-semibold text-ink-950">{b.newOverlaps}</div></Link>
      </div>

      <Panel title={b.rejects.length ? `${b.rejects.length} problem${b.rejects.length === 1 ? '' : 's'} to fix` : 'Nothing to fix'} className="mb-6"
        action={b.rejects.length ? <button className={btn('secondary', '!py-1.5 !text-13')} onClick={() => saveText(`rows-to-fix-${b.fileName}`, toCsv([['row', 'field', 'problem', 'how to fix'], ...b.rejects.map((r) => [r.row, r.field, r.problem, r.fix])]))}><Download size={14} aria-hidden />Download the list</button> : undefined}>
        {b.rejects.length ? (
          <table className="w-full text-left text-14">
            <thead className="text-12 text-muted"><tr><th className="py-1.5 pr-3 font-medium">Row</th><th className="py-1.5 pr-3 font-medium">Field</th><th className="py-1.5 pr-3 font-medium">What is wrong</th><th className="py-1.5 font-medium">How to fix it</th></tr></thead>
            <tbody className="divide-y divide-line">{b.rejects.map((r, i) => <tr key={i}><td className="py-2 pr-3 font-mono">{r.row}</td><td className="py-2 pr-3 font-medium">{r.field}</td><td className="py-2 pr-3 text-tape">{r.problem}</td><td className="py-2 text-text">{r.fix}</td></tr>)}</tbody>
          </table>
        ) : <p className="text-14 text-muted">Every row passed the checks.</p>}
      </Panel>

      {b.cases.length > 0 && (
        <Panel title="Cases from this file">
          <ul className="grid gap-1.5 sm:grid-cols-2">{b.cases.map((c) => (
            <li key={c.id} className="flex items-center gap-2 text-14"><Link to={`/cases/${c.id}`} className="font-mono font-semibold text-ink-950 hover:underline">{c.uid}</Link><span className={c.matched ? 'text-muted' : 'text-turmeric'}>{c.institution}</span></li>
          ))}</ul>
        </Panel>
      )}
    </>
  )
}
