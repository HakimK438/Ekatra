// The next 30 days as bars: the taller the bar, the more cases fall due that day. Today is marked, weekends are tinted,
// and selecting a day filters the list under it.
import clsx from 'clsx'
import { fmtShort } from './ui'

export interface DueDay { date: string; count: number }

export default function DueStrip({ days, selected, onSelect }: { days: DueDay[]; selected?: string; onSelect: (date: string | undefined) => void }) {
  const max = Math.max(1, ...days.map((d) => d.count))
  const H = 96
  return (
    <div role="group" aria-label="Cases due per day, next 30 days">
      <div className="flex items-end gap-1" style={{ height: H + 22 }}>
        {days.map((d, i) => {
          const dt = new Date(d.date + 'T00:00:00')
          const weekend = dt.getDay() === 0 || dt.getDay() === 6
          const h = d.count ? Math.max(10, Math.round((d.count / max) * H)) : 3
          const on = selected === d.date
          return (
            <button key={d.date} type="button" onClick={() => onSelect(on ? undefined : d.date)} aria-pressed={on}
              aria-label={`${fmtShort(d.date)}${i === 0 ? ' (today)' : ''}: ${d.count} due`} title={`${fmtShort(d.date)}: ${d.count} due`}
              className={clsx('group flex min-w-0 flex-1 flex-col items-center justify-end gap-1 rounded-md pb-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ink-500', on && 'bg-turmeric-soft')}>
              <span className="font-mono text-11 font-semibold text-ink-950">{d.count || ''}</span>
              <span className={clsx('grow-x block w-full origin-bottom rounded-t', d.count ? (d.count / max > 0.66 ? 'bg-ink-800' : 'bg-ink-700') : 'bg-line', weekend && 'opacity-60')} style={{ height: h, animationName: 'none' }} />
              <span className={clsx('text-11 leading-none', i === 0 ? 'font-semibold text-turmeric' : 'text-muted')}>{i === 0 ? 'Today' : dt.getDate()}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
