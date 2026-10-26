// A clash in one row: the units that are working on an institution, side by side, joined by a line that says whether their
// next steps fall within a week of each other (amber, with the gap in days) or not (grey, dashed). Used on the Clashes cards.
import clsx from 'clsx'
import { datedActions, findCollisions, nextStep, type CalCase } from '../lib/calendar'
import { UnitPill } from './Unit'
import { STAGE_WORD } from '../lib/overlapView'
import { daysBetween } from '../lib/logic'
import { fmtDay, plural } from '../lib/text'

export default function ClashDuel({ cases, today }: { cases: CalCase[]; today: string }) {
  const open = cases.filter((c) => c.lifecycle !== 'disposed' && c.lifecycle !== 'transferred')
  const acts = datedActions(open, today)
  const cols = findCollisions(acts)
  const units = [...new Set(cases.map((c) => c.unit))].slice(0, 4)
  const block = (unit: string) => {
    const mine = cases.filter((c) => c.unit === unit)
    const live = mine.find((c) => c.lifecycle !== 'disposed' && c.lifecycle !== 'transferred')
    const n = nextStep(acts.filter((a) => a.unit === unit), today)
    return (
      <div className="min-w-0 flex-1 rounded-xl border border-line bg-white px-3 py-2">
        <p className="flex flex-wrap items-center gap-1.5 text-13"><UnitPill code={unit} /><span className="text-muted">{live ? STAGE_WORD[live.lifecycle as keyof typeof STAGE_WORD] : 'closed'}</span></p>
        <p className="mt-0.5 line-clamp-2 text-12 leading-snug text-text">{n ? <><strong className="text-ink-950">{fmtDay(n.date)}</strong> {n.what}</> : <span className="text-muted">No dated step</span>}</p>
      </div>
    )
  }
  const link = (a: string, b: string) => {
    const col = cols.find((c) => c.units.includes(a) && c.units.includes(b))
    const gap = col ? daysBetween(col.from, col.to) : null
    return (
      <div className="flex shrink-0 items-center justify-center md:w-28" aria-hidden>
        <div className="flex w-full items-center gap-1 max-md:flex-col">
          <span className={clsx('h-0.5 flex-1 max-md:h-3 max-md:w-0.5', col ? 'bg-turmeric' : 'border-t-2 border-dashed border-stamp max-md:border-l-2 max-md:border-t-0')} />
          <span className={clsx('whitespace-nowrap rounded-full px-2 py-0.5 text-11 font-semibold', col ? 'bg-turmeric text-white' : 'bg-paper text-muted')}>{col ? (gap === 0 ? 'same day' : `${plural(gap!, 'day')} apart`) : 'no clash'}</span>
          <span className={clsx('h-0.5 flex-1 max-md:h-3 max-md:w-0.5', col ? 'bg-turmeric' : 'border-t-2 border-dashed border-stamp max-md:border-l-2 max-md:border-t-0')} />
        </div>
      </div>
    )
  }
  return (
    <div className="flex items-stretch gap-0 max-md:flex-col" role="group" aria-label={`Units working here: ${units.join(', ')}`}>
      {units.flatMap((u, i) => i === 0 ? [<div key={u} className="contents">{block(u)}</div>] : [<div key={`l-${u}`} className="contents">{link(units[i - 1], u)}</div>, <div key={u} className="contents">{block(u)}</div>])}
    </div>
  )
}
