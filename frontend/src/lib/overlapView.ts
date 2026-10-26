// What an overlap row shows, worked out once: who holds what, the next dated step, and when the decision is due.
import { daysBetween } from './logic'
import { datedActions, findCollisions, nextStep } from './calendar'
import { plural } from './text'
import type { Lifecycle } from './types'

export const STAGE_WORD: Record<Lifecycle, string> = {
  received: 'new', under_examination: 'examining', awaiting_party: 'awaiting reply', inspection_hearing: 'hearing stage',
  escalated: 'escalated', transferred: 'transferred', disposed: 'closed',
}

interface RowCase { id: string; uid: string; unit: string; channel: string; receivedOn: string; lifecycle: string; scheduled?: { on: string; what: string } | null; deadline: { dueOn: string; interimDay?: number | null; days: number } }

/** "overdue 14 days", "today" or the date, and whether it is late. */
export function decideBy(dueOn: string, today: string): { text: string; late: boolean; days: number } {
  const diff = daysBetween(today, dueOn)
  return { days: diff, late: diff < 0, text: diff < 0 ? `overdue ${plural(-diff, 'day')}` : diff === 0 ? 'today' : '' }
}

/** The next deliberate step still ahead, and whether any two units act within a week of each other. */
export function ahead(cases: RowCase[], today: string) {
  const acts = datedActions(cases, today)
  return { next: nextStep(acts, today), clashes: findCollisions(acts) }
}
