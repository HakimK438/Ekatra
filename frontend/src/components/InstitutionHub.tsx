// The institution at the centre, every unit working on it around it, each with its stage and next dated step.
// When two units act within a week of each other, their cards and lines turn amber and a label says how many days apart.
// On a phone the same cards stack in a list. A plain-words summary and the action to take sit under the picture.
import clsx from 'clsx'
import { AlertTriangle } from 'lucide-react'
import { datedActions, findCollisions, nextStep, type CalCase, type Collision } from '../lib/calendar'
import { STAGE_LABEL } from '../lib/labels'
import { UnitPill } from './Unit'
import { daysBetween } from '../lib/logic'
import { fmtDay, plural } from '../lib/text'
import type { Lifecycle } from '../lib/types'

export type HubCase = Omit<CalCase, 'unit' | 'lifecycle'> & { ownerUnit: string; lifecycle: Lifecycle }

const W = 920, CARD_W = 270, CARD_H = 98, GAP = 16, R = 76, TOP = 52

/** Break a name into lines of about `max` characters without splitting words. */
function wrap(name: string, max: number, lines: number): string[] {
  const out: string[] = []
  let cur = ''
  for (const w of name.split(/\s+/)) {
    if (cur && (cur + ' ' + w).length > max) { out.push(cur); cur = w } else cur = cur ? cur + ' ' + w : w
  }
  if (cur) out.push(cur)
  return out.length > lines ? [...out.slice(0, lines - 1), out.slice(lines - 1).join(' ').slice(0, max - 1) + '…'] : out
}

interface UnitInfo { unit: string; cases: number; stage: Lifecycle; next?: { date: string; what: string }; hot: boolean; near: string[] }

function UnitCard({ u, className }: { u: UnitInfo; className?: string }) {
  return (
    <div className={clsx('h-full rounded-xl border px-3.5 py-2.5 shadow-sm', u.hot ? 'border-turmeric bg-turmeric-soft' : 'border-line bg-white', className)}>
      <p className="flex items-center gap-2 text-13 font-semibold text-ink-950">
        <UnitPill code={u.unit} />
        <span className="font-normal text-muted">{STAGE_LABEL[u.stage].toLowerCase()}</span>
        {u.cases > 1 && <span className="ml-auto text-12 font-normal text-muted">{plural(u.cases, 'case')}</span>}
      </p>
      <p className="mt-1 line-clamp-2 text-12 leading-snug text-text">
        {u.next ? <><strong className="text-ink-950">{fmtDay(u.next.date)}</strong> {u.next.what}</> : <span className="text-muted">No dated step booked</span>}
      </p>
      {u.hot && <p className="mt-1 flex items-center gap-1 text-11 font-semibold text-turmeric"><AlertTriangle size={11} aria-hidden />Within a week of {u.near.join(' and ')}</p>}
    </div>
  )
}

export default function InstitutionHub({ name, cases, today, className }: { name: string; cases: HubCase[]; today: string; className?: string }) {
  const open = cases.filter((c) => c.lifecycle !== 'disposed' && c.lifecycle !== 'transferred').map((c) => ({ ...c, unit: c.ownerUnit }))
  const acts = datedActions(open, today)
  const collisions: Collision[] = findCollisions(acts)
  const clashing = new Set(collisions.flatMap((c) => c.units))
  // Clashing units go first so they land on opposite sides of the circle, facing each other.
  const order = [...new Set(open.map((c) => c.unit))].sort((a, b) => Number(clashing.has(b)) - Number(clashing.has(a)) || a.localeCompare(b))
  const info: UnitInfo[] = order.map((unit) => {
    const mine = open.filter((c) => c.unit === unit)
    const n = nextStep(acts.filter((a) => a.unit === unit), today)
    const col = collisions.find((c) => c.units.includes(unit))
    return { unit, cases: mine.length, stage: mine[0].lifecycle, next: n ? { date: n.date, what: n.what } : undefined, hot: clashing.has(unit), near: col ? col.units.filter((x) => x !== unit) : [] }
  })

  const left = info.filter((_, i) => i % 2 === 0), right = info.filter((_, i) => i % 2 === 1)
  const rows = Math.max(left.length, right.length, 1)
  const areaH = Math.max(rows * (CARD_H + GAP) - GAP, 2 * R + 16)
  const H = TOP + areaH + 8
  const cy = TOP + areaH / 2
  const slot = (n: number, i: number) => TOP + (areaH - (n * CARD_H + (n - 1) * GAP)) / 2 + i * (CARD_H + GAP)
  const lines = wrap(name, 15, 4)

  const first = collisions[0]
  const gap = first ? daysBetween(first.from, first.to) : 0
  const pill = first ? `${first.units.join(' and ')} act ${gap === 0 ? 'on the same day' : `${plural(gap, 'day')} apart`}` : ''
  const summary = info.length === 0 ? 'No unit has an open case here.'
    : info.length === 1 ? `Only ${info[0].unit} is working on ${name}. Nothing to clash with.`
    : first ? `${collisions.map((c) => `${c.units.join(' and ')} act within a week of each other (${fmtDay(c.from)}${c.to !== c.from ? ` to ${fmtDay(c.to)}` : ''})`).join('; ')}.`
    : `${plural(info.length, 'unit')} are working on ${name}, but their next steps are more than a week apart.`
  const todo = first ? `What the dates show: ${first.units.join(' and ')} each have a step at this institution within ${gap === 0 ? 'the same day' : plural(gap + 1, 'day')}. If both act, the institution receives two separate communications about the same matter.` : info.length > 1 ? 'Their next steps are more than a week apart. Ekatra flags it if two steps move within a week of each other.' : ''

  const line = (x: number, y: number, side: 'l' | 'r', hot: boolean, key: string) => {
    const sx = side === 'l' ? W / 2 - R : W / 2 + R
    const dx = side === 'l' ? -70 : 70
    return <path key={key} d={`M${sx},${cy} C${sx + dx},${cy} ${x - dx},${y} ${x},${y}`} fill="none" stroke={hot ? '#A44C08' : '#CBD1DC'} strokeWidth={hot ? 3 : 2} strokeDasharray={hot ? undefined : '6 6'} strokeLinecap="round" />
  }

  return (
    <figure className={clsx('rounded-panel border border-line bg-surface p-4 md:p-5', className)} aria-label="Who is working on this institution">
      <figcaption className="mb-1">
        <span className={clsx('font-display text-17 font-semibold', first ? 'text-turmeric' : 'text-ink-950')}>{summary}</span>
      </figcaption>

      <div className="hidden md:block">
        <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block h-auto w-full" role="img" aria-label={summary}>
          {left.map((u, i) => line(CARD_W, slot(left.length, i) + CARD_H / 2, 'l', u.hot, `l-${u.unit}`))}
          {right.map((u, i) => line(W - CARD_W, slot(right.length, i) + CARD_H / 2, 'r', u.hot, `r-${u.unit}`))}
          {first && (
            <g>
              <rect x={W / 2 - (pill.length * 3.7 + 20)} y={6} width={pill.length * 7.4 + 40} height={30} rx={15} fill="#A44C08" />
              <text x={W / 2} y={26} textAnchor="middle" fontSize={13} fontWeight={600} fill="#fff">{pill}</text>
            </g>
          )}
          <circle cx={W / 2} cy={cy} r={R} fill="#0F172A" />
          <circle cx={W / 2} cy={cy} r={R + 6} fill="none" stroke="#0F172A" strokeOpacity={0.12} strokeWidth={6} />
          <text textAnchor="middle" fill="#fff" fontSize={13} fontWeight={600} fontFamily="IBM Plex Sans, sans-serif">
            {lines.map((l, i) => <tspan key={i} x={W / 2} y={cy - 8 - ((lines.length - 1) * 8) + i * 16}>{l}</tspan>)}
          </text>
          <text x={W / 2} y={cy + 8 + ((lines.length - 1) * 8) + 12} textAnchor="middle" fill="#94A3B8" fontSize={11}>{plural(open.length, 'open case')}</text>
          {left.map((u, i) => <foreignObject key={u.unit} x={0} y={slot(left.length, i)} width={CARD_W} height={CARD_H}><UnitCard u={u} /></foreignObject>)}
          {right.map((u, i) => <foreignObject key={u.unit} x={W - CARD_W} y={slot(right.length, i)} width={CARD_W} height={CARD_H}><UnitCard u={u} /></foreignObject>)}
        </svg>
      </div>

      {/* phone: the same cards, stacked under the institution */}
      <div className="md:hidden">
        <p className="mb-2 rounded-xl bg-ink-950 px-4 py-3 text-center font-display text-15 font-semibold text-white">{name}<span className="block text-12 font-normal text-slate-300">{plural(open.length, 'open case')}</span></p>
        <ul className="space-y-2">{info.map((u) => <li key={u.unit}><UnitCard u={u} /></li>)}</ul>
      </div>

      {todo && <p className={clsx('mt-3 rounded-lg px-3.5 py-2.5 text-13', first ? 'bg-turmeric-soft text-ink-950' : 'bg-paper text-muted')}>{todo}</p>}
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-12 text-muted" aria-label="Key">
        <li className="inline-flex items-center gap-1.5"><span className="h-0.5 w-5 bg-turmeric" />Acts within a week of another unit</li>
        <li className="inline-flex items-center gap-1.5"><span className="h-0.5 w-5 border-t-2 border-dashed border-stamp" />No clash</li>
        <li>Dot colour = kind of unit (blue grievance cell, teal Regulation Bureau, ochre Regional Office, violet other)</li>
      </ul>
      <ul className="sr-only">{info.map((u) => <li key={u.unit}>{u.unit}: {plural(u.cases, 'open case')}{u.next ? `, next step ${fmtDay(u.next.date)}, ${u.next.what}` : ''}.</li>)}</ul>
    </figure>
  )
}
