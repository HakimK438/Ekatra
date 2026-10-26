// Overlaps waiting for a decision, soonest decision date first: who holds what, the next dated step, and the decide-by date.
import { Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import clsx from 'clsx'
import type { api } from '../../lib/api'
import { ahead, decideBy } from '../../lib/overlapView'
import { fmtDay } from '../../lib/text'
import { InstName } from '../../components/Ids'
import { UnitPill } from '../../components/Unit'
import { btn, fmtShort } from '../../components/ui'
import { Empty1, TableWrap, Th } from './shared'

type Row = Awaited<ReturnType<typeof api.overlaps>>['open'][number]

export default function DecideTable({ rows, today, empty }: { rows: Row[]; today: string; empty: string }) {
  if (rows.length === 0) return <Empty1>{empty}</Empty1>
  return (
    <TableWrap min={820}>
      <thead className="border-b border-line text-12 text-muted"><tr><Th>Institution</Th><Th>Who holds what</Th><Th>Next dated action</Th><Th>Decide by</Th><Th><span className="sr-only">Action</span></Th></tr></thead>
      <tbody className="divide-y divide-line">
        {rows.map((a) => {
          const { next, clashes } = ahead(a.cases, today)
          const by = decideBy(a.dueOn, today)
          return (
            <tr key={a.id} className="align-top">
              <td className="max-w-[260px] px-4 py-3"><InstName id={a.institutionId} name={a.institution.name} permanentId={a.institution.permanentId} className="!flex-col !gap-0" /></td>
              <td className="px-4 py-3"><ul className="space-y-0.5">{a.cases.map((c) => <li key={c.id} className="whitespace-nowrap"><UnitPill code={c.unit} className="mr-1 !px-1.5 !py-0 !text-12" /> <span className="text-muted">{c.lifecycle === 'disposed' ? `closed ${c.category.replace(/_/g, ' ')} case` : c.nextAction === '—' ? c.lifecycle.replace('_', ' ') : c.nextAction}</span></li>)}</ul></td>
              <td className="px-4 py-3">{next ? <><span className="font-medium">{next.unit}</span> {next.what}<div className="text-12 text-muted">{fmtDay(next.date)}</div></> : <span className="text-muted">None booked</span>}{clashes.length > 0 && <div className="mt-1 inline-flex items-center gap-1 text-12 font-semibold text-turmeric"><AlertTriangle size={12} aria-hidden />Same week</div>}</td>
              <td className={clsx('whitespace-nowrap px-4 py-3 font-medium', by.late && 'text-tape')}>{by.text || fmtShort(a.dueOn)}</td>
              <td className="px-4 py-3 text-right"><Link to={`/overlaps/${encodeURIComponent(a.id)}`} className={btn('primary', '!px-4 !py-1 !text-13')}>Decide</Link></td>
            </tr>
          )
        })}
      </tbody>
    </TableWrap>
  )
}
