// Case lanes: one row per unit, each case a bar from receipt to closure (or today).
// The red-tape band marks the period when cases on the same institution were open in more than one unit.
import clsx from 'clsx'
import { Link } from 'react-router-dom'
import { addDays, daysBetween } from '../lib/logic'
import type { Lane } from '../lib/api'
import { STAGE_LABEL } from '../lib/labels'
import { UnitDot } from './Unit'
import { fmtShort } from './ui'

const PENDING_STEP = new Set(['awaiting_party', 'inspection_hearing'])

export default function CaseLanes({ lanes, today, highlight = [], compact, legend }: {
  lanes: Lane[]; today: string; highlight?: string[]; compact?: boolean; legend?: boolean
}) {
  // Fit the window to the cases that matter (the highlighted ones, else everything recent), 6 weeks to 6 months.
  const focus = lanes.filter((l) => highlight.includes(l.id))
  const basis = (focus.length ? focus : lanes).filter((l) => daysBetween(l.end ?? today, today) <= 180)
  const earliest = basis.reduce((m, l) => Math.max(m, daysBetween(l.start, today)), 0)
  const span = Math.min(180, Math.max(42, Math.ceil((earliest * 1.15 + 7) / 7) * 7))
  const from = addDays(today, -span)
  const windowLen = span
  const pos = (d: string) => Math.max(0, Math.min(100, (daysBetween(from, d) / windowLen) * 100))
  const units = [...new Set(lanes.map((l) => l.unit))].sort((a, b) => {
    const ha = lanes.some((l) => l.unit === a && highlight.includes(l.id)) ? 0 : 1
    const hb = lanes.some((l) => l.unit === b && highlight.includes(l.id)) ? 0 : 1
    return ha - hb || a.localeCompare(b)
  })

  // Overlap band: from the latest start among highlighted, still-open cases until today (needs ≥2 units).
  const hot = lanes.filter((l) => highlight.includes(l.id) && !l.end)
  const band = new Set(hot.map((l) => l.unit)).size >= 2 ? hot.reduce((m, l) => (l.start > m ? l.start : m), from) : null

  // Ticks walk back from today so the right end is always "Today"; ones crowding it are dropped.
  const step = windowLen > 120 ? 30 : windowLen > 63 ? 14 : 7
  const ticks: string[] = []
  for (let i = step; i < windowLen; i += step) if (i / windowLen > 0.12) ticks.push(addDays(today, -i))
  const rowH = compact ? 'h-5' : 'h-7'

  return (
    <figure className="w-full">
      <div className="relative">
        <div className="space-y-1.5">
          {units.map((u) => (
            <div key={u} className="flex items-center gap-3">
              <div className="flex w-[58px] shrink-0 items-center justify-end gap-1.5 text-12 font-semibold text-muted"><UnitDot code={u} className="!h-2 !w-2" />{u}</div>
              <div className={clsx('relative flex-1 rounded-[3px] bg-paper', rowH)}>
                {lanes.filter((l) => l.unit === u && (l.end ?? today) >= from).map((l) => {
                  const left = pos(l.start)
                  const width = Math.max(1.2, pos(l.end ?? today) - left)
                  const hi = highlight.includes(l.id)
                  return (
                    <Link
                      key={l.id}
                      to={`/cases/${l.id}`}
                      aria-label={`${l.uid}, ${u}, ${STAGE_LABEL[l.lifecycle]}, received ${fmtShort(l.start)}${l.end ? `, closed ${fmtShort(l.end)}` : ', still open'}`}
                      title={`${l.uid} · ${STAGE_LABEL[l.lifecycle]}`}
                      className={clsx(
                        'absolute top-1/2 -translate-y-1/2 rounded-[3px] transition-[filter] hover:brightness-110',
                        compact ? 'h-3' : 'h-4',
                        l.end ? 'bg-line' : 'bg-ink-700',
                        !l.end && PENDING_STEP.has(l.lifecycle) && 'hatch bg-ink-500',
                        hi && 'ring-2 ring-tape ring-offset-1 ring-offset-paper',
                      )}
                      style={{ left: `${left}%`, width: `${width}%` }}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        {band && (
          <div className="pointer-events-none absolute -bottom-1 -top-1 right-0 border-l-2 border-tape bg-tape/[0.07]" style={{ left: `calc(58px + 12px + (100% - 70px) * ${pos(band) / 100})` }}>
            {!compact && <span className="absolute -top-5 right-0 whitespace-nowrap text-11 font-semibold text-tape">Open in {new Set(hot.map((l) => l.unit)).size} units since {fmtShort(band)}</span>}
          </div>
        )}
      </div>
      {!compact && (
        <div className="relative ml-[70px] mt-1.5 h-4 text-11 text-muted" aria-hidden>
          {ticks.map((t) => <span key={t} className="absolute -translate-x-1/2" style={{ left: `${pos(t)}%` }}>{fmtShort(t)}</span>)}
          <span className="absolute right-0 font-semibold text-text">Today</span>
        </div>
      )}
      {legend && (
        <figcaption className="ml-[70px] mt-3 flex flex-wrap gap-x-4 gap-y-1 text-12 text-muted">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-[2px] bg-ink-700" />Open</span>
          <span className="inline-flex items-center gap-1.5"><span className="hatch h-2.5 w-5 rounded-[2px] bg-ink-500" />Notice or hearing pending</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-[2px] bg-line" />Closed or transferred</span>
          {highlight.length > 0 && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-[2px] ring-2 ring-tape" />In this overlap</span>}
        </figcaption>
      )}
    </figure>
  )
}
