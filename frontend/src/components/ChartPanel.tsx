// A chart with a one-line takeaway as its title, a plain-text summary for screen readers,
// and a "Show as table" switch so every value can be read exactly.
import { useState, type ReactNode } from 'react'
import { BarChart3, Lightbulb, Table2 } from 'lucide-react'
import { Panel } from './ui'

export default function ChartPanel({ title, note, insight, summary, table, action, children, className }: {
  title: ReactNode; note?: ReactNode; insight?: ReactNode; summary: string; table: { columns: string[]; rows: (string | number)[][] }; action?: ReactNode; children: ReactNode; className?: string
}) {
  const [asTable, setAsTable] = useState(false)
  const toggle = (
    <div className="flex items-center gap-2">
      {action}
      <button type="button" onClick={() => setAsTable(!asTable)} aria-pressed={asTable}
        className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-12 text-muted hover:border-ink-500 hover:text-ink-700">
        {asTable ? <BarChart3 size={13} aria-hidden /> : <Table2 size={13} aria-hidden />}{asTable ? 'Show chart' : 'Show as table'}
      </button>
    </div>
  )
  return (
    <Panel title={title} note={note} action={toggle} className={className}>
      {asTable ? (
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-left text-13">
            <caption className="sr-only">{summary}</caption>
            <thead className="sticky top-0 bg-surface text-12 text-muted"><tr>{table.columns.map((c) => <th key={c} scope="col" className="border-b border-line py-1.5 pr-4 font-medium">{c}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">{table.rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className="py-1.5 pr-4 font-mono tabular-nums">{v}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : (
        <figure><figcaption className="sr-only">{summary}</figcaption>{children}</figure>
      )}
      {insight && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-ink-50 px-4 py-3 text-14 leading-snug text-ink-950">
          <Lightbulb size={17} className="mt-0.5 shrink-0 text-ink-700" aria-hidden />
          <p><span className="font-semibold">What this shows. </span>{insight}</p>
        </div>
      )}
    </Panel>
  )
}
