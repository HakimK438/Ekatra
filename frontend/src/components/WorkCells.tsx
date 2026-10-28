// Dashboard chart: open work by department, one cell per open case, coloured by its clock (late, due this week, in time)
// and grey when nobody holds it. A glance shows where work piles up and goes late; a row opens the full list.
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { api } from '../lib/api'
import { addDays } from '../lib/logic'
import { work, SERVER_ONLY } from '../lib/workApi'
import ChartPanel from './ChartPanel'
import { UnitPill } from './Unit'

const MAX_CELLS = 36
const CELL = {
  late: { cls: 'bg-tape', label: 'Late' },
  week: { cls: 'bg-turmeric', label: 'Due within 7 days' },
  ok: { cls: 'bg-ink-500', label: 'In time' },
  none: { cls: 'bg-muted/40', label: 'Nobody holds it' },
}
type Kind = keyof typeof CELL

export default function WorkCells() {
  const q = useQuery({ queryKey: ['people', ''], queryFn: () => work.people(), enabled: !SERVER_ONLY })
  if (SERVER_ONLY || !q.data) return null
  const week = addDays(api.today, 7)
  const rows = q.data.units.map((u) => {
    const items = u.officers.flatMap((o) => o.items)
    const kind = (i: (typeof items)[number]): Kind => (!i.officer ? 'none' : i.late ? 'late' : i.dueOn <= week ? 'week' : 'ok')
    const cells = items.map(kind).sort((a, b) => ['late', 'week', 'ok', 'none'].indexOf(a) - ['late', 'week', 'ok', 'none'].indexOf(b))
    const count = (k: Kind) => cells.filter((c) => c === k).length
    return { unit: u.unit, people: u.officers.filter((o) => !o.name.startsWith('Not yet')).length, cells, late: count('late'), week: count('week'), ok: count('ok'), none: count('none') }
  }).sort((a, b) => b.late - a.late || b.cells.length - a.cells.length)
  const worst = rows[0]
  const totalLate = rows.reduce((a, r) => a + r.late, 0)
  return (
    <ChartPanel className="mt-6 first:mt-0" title="Open work by department"
      note="One cell is one open case. Click a department to see who holds what."
      summary={rows.map((r) => `${r.unit}: ${r.cells.length} open, ${r.late} late, ${r.week} due this week, ${r.none} not assigned`).join('. ')}
      table={{ columns: ['Department', 'Officers', 'Open', 'Late', 'Due this week', 'Nobody holds it'], rows: rows.map((r) => [r.unit, r.people, r.cells.length, r.late, r.week, r.none]) }}
      insight={worst && totalLate ? <>{worst.unit} has the most late cases ({worst.late} of {worst.cells.length} open). {totalLate} late across all departments.</> : 'No department has a late case.'}>
      <ul className="space-y-2.5">{rows.map((r) => (
        <li key={r.unit}>
          <Link to={`/team?unit=${r.unit}`} className="grid grid-cols-[5.5rem_minmax(0,1fr)_4.5rem] items-center gap-3 rounded-lg px-1 py-1 hover:bg-ink-50">
            <UnitPill code={r.unit} />
            <span className="flex flex-wrap gap-[3px]" aria-hidden>
              {r.cells.slice(0, MAX_CELLS).map((c, i) => <span key={i} className={clsx('h-3.5 w-3.5 rounded-[3px]', CELL[c].cls)} />)}
              {r.cells.length > MAX_CELLS && <span className="ml-1 text-11 text-muted">+{r.cells.length - MAX_CELLS}</span>}
            </span>
            <span className="text-right text-12 text-muted"><span className={clsx('font-semibold', r.late ? 'text-tape' : 'text-ink-950')}>{r.late}</span> late · {r.cells.length}</span>
          </Link>
        </li>))}</ul>
      <p className="mt-3 flex flex-wrap gap-4 text-11 text-muted">{(Object.keys(CELL) as Kind[]).map((k) => <span key={k} className="flex items-center gap-1.5"><span className={clsx('h-2.5 w-2.5 rounded-[2px]', CELL[k].cls)} />{CELL[k].label}</span>)}</p>
    </ChartPanel>
  )
}
