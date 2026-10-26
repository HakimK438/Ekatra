// A unit is always drawn with the colour of its kind (grievance cell, Regulation Bureau, Regional Office, other cell),
// so the same unit looks the same on every screen.
import clsx from 'clsx'
import type { ReactNode } from 'react'
import { UNIT_KIND_CLASS, UNIT_KIND_COLOR, unitKind } from '../lib/chartColors'
import { UNIT_LEGEND, unitFull } from '../lib/labels'

export const UnitDot = ({ code, className }: { code: string | null; className?: string }) => (
  <span className={clsx('inline-block h-2.5 w-2.5 shrink-0 rounded-full', UNIT_KIND_CLASS[code ? unitKind(code) : 'none'], className)} aria-hidden />
)

/**
 * A unit is always one badge: its code on a tint of its kind's colour, with a solid dot. The same unit looks the same on every screen,
 * so the colour alone says which kind of unit it is (blue grievance cell, teal Regulation Bureau, ochre Regional Office, violet other).
 */
export function UnitPill({ code, children, className }: { code: string; children?: ReactNode; className?: string }) {
  const hex = UNIT_KIND_COLOR[unitKind(code)]
  return (
    <span title={unitFull(code)} className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-13', className)} style={{ background: `${hex}1A`, borderColor: `${hex}55` }}>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: hex }} aria-hidden />
      <span className="font-semibold text-ink-950">{code}</span>
      {children}
    </span>
  )
}
export const UnitTag = UnitPill

/** What each colour means. Shown wherever several units appear together. */
export function UnitKey({ className }: { className?: string }) {
  const kinds: [string, string][] = [['PGRC', 'Grievance cell'], ['RB-WR', 'Regulation Bureau'], ['RO-WR', 'Regional Office'], ['LEGAL', 'Legal and other cells']]
  return (
    <ul className={clsx('flex flex-wrap items-center gap-x-4 gap-y-1 text-12 text-muted', className)} aria-label="What the unit colours mean">
      {kinds.map(([c, w]) => <li key={c} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: UNIT_KIND_COLOR[unitKind(c)] }} aria-hidden />{w}</li>)}
    </ul>
  )
}

/** The one-line "who handles what" explanation, shown wherever several units appear together. */
export function UnitLegend({ className }: { className?: string }) {
  return <p className={clsx('text-13 leading-snug text-muted', className)}>{UNIT_LEGEND}</p>
}
