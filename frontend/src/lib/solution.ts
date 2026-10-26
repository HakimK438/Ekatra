// The three ideas that turn Ekatra from a viewer into a helper (see documents/01_problem_and_solution.md):
//   1. Pre-action check  - before an officer acts, say whether another unit's work could clash.
//   2. Next-step owner   - every open case has exactly one person (or "the institution") holding the next step.
//   3. Stage time budgets - split the time limit per stage, so lateness shows where it starts.
// Pure functions, no network. The clash table and the stage split are PROTOTYPE settings until AICTE approves them.
import type { Lifecycle } from './types'
import { STAGE_LABEL, categoryLabel } from './labels'
import { SETTINGS, addDays } from './logic'
import { plural } from './text'

// ---------- 1. Pre-action check ----------
export type ActionKind = 'record' | 'stage' | 'reply' | 'transfer' | 'close'
export type Light = 'green' | 'amber' | 'red'

/** The part of a case lane the check needs (both the mock and the real API send these fields). */
export interface LaneLite { id: string; uid: string; unit: string; lifecycle: Lifecycle; category: string }

export interface CheckResult {
  light: Light
  headline: string
  /** One short line per other case that matters, e.g. "RB-WR case RB-0412 is at inspection or hearing". */
  because: string[]
  /** Units worth a call before going ahead. */
  askUnits: string[]
}

/** What each action is checked against. Shown on the Settings screen so the rule is never hidden. */
export const CLASH_TABLE: { action: ActionKind; label: string; amber: string; red: string }[] = [
  { action: 'record', label: 'Record an action', amber: 'Never', red: 'Never' },
  { action: 'stage', label: 'Change the stage', amber: 'Same issue is open elsewhere, or the move enters a waiting or hearing stage while another unit is active', red: 'The move enters a waiting or hearing stage and the same issue is open elsewhere' },
  { action: 'reply', label: 'Ask the institution for a reply', amber: 'Another unit is active', red: 'Another unit already handles the same issue' },
  { action: 'transfer', label: 'Transfer', amber: 'Another unit is active', red: 'Another unit already handles the same issue' },
  { action: 'close', label: 'Close the case', amber: 'Another unit is active', red: 'Another unit already handles the same issue' },
]

const isLive = (l: Pick<LaneLite, 'lifecycle'>) => l.lifecycle !== 'disposed' && l.lifecycle !== 'transferred'
const STEPS_PENDING: Lifecycle[] = ['awaiting_party', 'inspection_hearing']
const uniq = <T,>(a: T[]) => [...new Set(a)]
const join = (a: string[]) => (a.length <= 1 ? a[0] ?? '' : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`)

export function preActionCheck(i: { action: ActionKind; caseId?: string; unit: string; category?: string; lanes: LaneLite[]; targetStage?: Lifecycle }): CheckResult {
  const others = i.lanes.filter((l) => isLive(l) && l.unit !== i.unit && l.id !== i.caseId)
  const sameIssue = others.filter((l) => !!i.category && l.category === i.category)

  if (i.action === 'record') {
    return { light: 'green', headline: 'A note is only a record. It cannot clash with another unit.', because: [], askUnits: [] }
  }
  if (!others.length) {
    return { light: 'green', headline: 'No other unit has an open case for this institution.', because: [], askUnits: [] }
  }
  // Moving a case inside your own unit is only a concern when it enters a step the institution will notice.
  const mild = i.action === 'stage' && !(i.targetStage && STEPS_PENDING.includes(i.targetStage))
  const light: Light = sameIssue.length ? (mild ? 'amber' : 'red') : mild ? 'green' : 'amber'
  const focus = light === 'red' ? sameIssue : others
  const askUnits = uniq(focus.map((l) => l.unit))
  const because = focus.map((l) => `${l.unit} case ${l.uid} is “${STAGE_LABEL[l.lifecycle].toLowerCase()}” (${categoryLabel(l.category).toLowerCase()})`)

  if (light === 'green') return { light, headline: 'This is an internal step. Other units are not affected by it.', because: [], askUnits: [] }
  return {
    light,
    headline: light === 'red'
      ? `${join(askUnits)} already ${askUnits.length === 1 ? 'has' : 'have'} an open case on the same issue.`
      : `${join(askUnits)} ${askUnits.length === 1 ? 'has' : 'have'} an open case for this institution.`,
    because,
    askUnits,
  }
}

// ---------- 2. Next-step owner ----------
export interface NextStep {
  /** Who holds the step now: a named officer, a role in the unit, or the institution. */
  owner: string
  /** What they must do, as a short verb phrase. */
  verb: string
  /** The date it should be done by (a prototype or verified limit; see `verified`). */
  by: string | null
  /** True when the step is with someone outside AICTE. */
  waiting: boolean
  /** True when the date comes from the verified CPGRAMS limit. */
  verified: boolean
}

export function nextStepFor(c: {
  lifecycle: Lifecycle; officer?: string | null; ownerUnit: string; receivedOn: string; nextAction?: string
  deadline: { dueOn: string; interimDue: boolean; verified: boolean }
}): NextStep | null {
  if (c.lifecycle === 'disposed' || c.lifecycle === 'transferred') return null
  const named = c.officer ?? `Nodal officer, ${c.ownerUnit}`
  if (!c.officer) {
    return { owner: named, verb: 'Assign a dealing officer', by: addDays(c.receivedOn, SETTINGS.unassignedDays), waiting: false, verified: false }
  }
  if (c.lifecycle === 'awaiting_party') {
    return { owner: 'The institution', verb: `Send its reply (${c.officer} then reviews it)`, by: c.deadline.dueOn, waiting: true, verified: c.deadline.verified }
  }
  if (c.deadline.interimDue) {
    return { owner: named, verb: 'Send the interim reply', by: c.deadline.dueOn, waiting: false, verified: c.deadline.verified }
  }
  return { owner: named, verb: c.nextAction?.trim() || 'Examine the case', by: c.deadline.dueOn, waiting: false, verified: c.deadline.verified }
}

// ---------- 3. Stage time budgets ----------
export type BudgetKey = 'examine' | 'reply' | 'hearing' | 'decide'
export interface StageBudget {
  key: BudgetKey
  label: string
  /** Short name for narrow places. */
  short: string
  /** Days given to this stage. */
  days: number
  state: 'done' | 'current' | 'next'
  /** Days the case has spent in this stage so far (the current stage only; finished stages count as fully spent). */
  spent: number
  /** Days past the end of this stage's budget (the current stage only). */
  lateDays: number
}

/** Prototype split of the total time limit. Only the 21-day CPGRAMS total is verified. */
export const BUDGET_SPLIT: { key: BudgetKey; label: string; short: string; share: number }[] = [
  { key: 'examine', label: 'Examination', short: 'Examine', share: 0.3 },
  { key: 'reply', label: 'Institution reply', short: 'Reply', share: 0.3 },
  { key: 'hearing', label: 'Hearing or inspection', short: 'Hearing', share: 0.2 },
  { key: 'decide', label: 'Decision', short: 'Decide', share: 0.2 },
]

/** Every stage of a case maps to one budget stage. */
export const budgetStageOf = (l: Lifecycle): BudgetKey =>
  l === 'awaiting_party' ? 'reply' : l === 'inspection_hearing' ? 'hearing' : l === 'escalated' ? 'decide' : 'examine'

/**
 * Split `totalDays` into stage budgets and mark where a case stands. `daysInStage` is the time since the case entered its
 * current stage (from its own history), so a case that waited a long time before reaching a stage is not blamed for it there.
 */
export function stageBudgets(totalDays: number, lifecycle: Lifecycle, daysInStage: number): StageBudget[] {
  if (lifecycle === 'disposed' || lifecycle === 'transferred') return []
  const days = BUDGET_SPLIT.map((x) => Math.round(totalDays * x.share))
  days[3] = totalDays - days[0] - days[1] - days[2]
  const cur = BUDGET_SPLIT.findIndex((x) => x.key === budgetStageOf(lifecycle))
  return BUDGET_SPLIT.map((x, i) => ({
    key: x.key, label: x.label, short: x.short, days: days[i],
    state: i < cur ? 'done' : i === cur ? 'current' : 'next',
    spent: i < cur ? days[i] : i === cur ? Math.max(0, daysInStage) : 0,
    lateDays: i === cur ? Math.max(0, daysInStage - days[i]) : 0,
  }))
}

/** The one-line reading of the current stage: "Stuck at: Examination (14 days; budget 6)" or "Institution reply: day 3 of 6". */
export function stageReading(budgets: StageBudget[]): string {
  const cur = budgets.find((b) => b.state === 'current')
  if (!cur) return 'Closed'
  if (cur.lateDays > 0) return `Stuck at: ${cur.label} (${plural(cur.spent, 'day')}; budget ${cur.days})`
  return `${cur.label}: day ${cur.spent} of ${cur.days}`
}
