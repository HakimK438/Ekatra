// Dated actions per institution, and the places where two units act on the same institution within a week of each other.
// This is the "collision calendar": the harm AICTE wants to avoid is two letters on one issue or two visits in one week.
import { addDays, daysBetween } from './logic'

export type ActionKind = 'hearing' | 'reply' | 'interim' | 'deadline'
export interface DatedAction { date: string; unit: string; caseId: string; uid: string; what: string; kind: ActionKind }

/** What a case needs from the calendar. Both the mock and the real API send these fields. */
export interface CalCase {
  id: string; uid: string; unit: string; channel: string; receivedOn: string; lifecycle: string
  scheduled?: { on: string; what: string } | null
  deadline: { dueOn: string; interimDay?: number | null; days: number }
}
const OPEN = (c: CalCase) => c.lifecycle !== 'disposed' && c.lifecycle !== 'transferred'

/** The dated steps of the open cases: a booked hearing or visit, a reply due, the CPGRAMS interim reply, and the final time limit. */
export function datedActions(cases: CalCase[], from: string, to?: string): DatedAction[] {
  const out: DatedAction[] = []
  const add = (c: CalCase, date: string, what: string, kind: ActionKind) => {
    if (date >= from && (!to || date <= to)) out.push({ date, unit: c.unit, caseId: c.id, uid: c.uid, what, kind })
  }
  for (const c of cases.filter(OPEN)) {
    if (c.scheduled) add(c, c.scheduled.on, c.scheduled.what, /reply/i.test(c.scheduled.what) ? 'reply' : 'hearing')
    if (c.deadline.interimDay) add(c, addDays(c.receivedOn, c.deadline.interimDay), 'CPGRAMS interim reply due', 'interim')
    add(c, c.deadline.dueOn, `${c.channel === 'CPGRAMS' ? 'CPGRAMS time limit' : 'Time limit'} ends`, 'deadline')
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.unit.localeCompare(b.unit))
}

export interface Collision { from: string; to: string; units: string[]; actions: DatedAction[] }

/**
 * A collision: actions of two or more different units on one institution that fall within `gap` days of each other.
 * Final time limits are ignored here (they are not something a unit chooses to do), so only deliberate steps collide.
 */
export function findCollisions(actions: DatedAction[], gap = 7): Collision[] {
  const steps = actions.filter((a) => a.kind !== 'deadline')
  const out: Collision[] = []
  let group: DatedAction[] = []
  const flush = () => {
    const units = [...new Set(group.map((a) => a.unit))]
    if (units.length >= 2) out.push({ from: group[0].date, to: group[group.length - 1].date, units, actions: group })
    group = []
  }
  for (const a of steps) {
    if (group.length && daysBetween(group[group.length - 1].date, a.date) > gap) flush()
    group.push(a)
  }
  if (group.length) flush()
  return out
}

/** The first deliberate step still ahead (today or later), for the "next dated action" column. */
export const nextStep = (actions: DatedAction[], today: string) => actions.find((a) => a.kind !== 'deadline' && a.date >= today)

/** Monday of the week a date falls in. */
export const weekStart = (d: string) => { const n = new Date(d + 'T00:00:00').getDay(); return addDays(d, -((n + 6) % 7)) }
