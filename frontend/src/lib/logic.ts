// Pure business rules mirroring the planned backend engines (deadlines, overlaps, matching, dashboard).
import type {
  Case, DeadlineInfo, Decision, DemoUser, Institution, Lifecycle, MatchMethod, MatchState, MatchSuggestion, OverlapAlert, RuleFire, Unit, CaseFilters,
} from './types'
import { categoryLabel } from './labels'
import RULES from './rules.json'

export type RuleKey = 'cpgramsDays' | 'cpgramsInterimDay' | 'defaultDays' | 'approachingPct' | 'escalateAfterOverdue' | 'unassignedDays' | 'staleActionDays'
  | 'coordDueDays' | 'coordSecondLevelDays' | 'followUpDays' | 'o3WindowDays' | 'o4NewWithinDays' | 'topN' | 'suggestMinScore' | 'staleHours'
export interface Rule {
  key: RuleKey | null; group: string; label: string; unit: string; default: number; min?: number; max?: number
  verified: boolean; editable: boolean; basis: string
}

const DAY = 86_400_000
export const toDate = (s: string) => new Date(s + 'T00:00:00')
// Local calendar date (not toISOString, which converts to UTC and shifts the day back in zones ahead of UTC, e.g. IST)
export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const daysBetween = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY)
export const addDays = (s: string, n: number) => { const d = toDate(s); d.setDate(d.getDate() + n); return iso(d) }

/** The day the case entered the stage it is in now, from its own history (not from the day it was received). */
export const stageSince = (c: Pick<Case, 'events' | 'receivedOn'>): string =>
  [...c.events].reverse().find((e) => e.type === 'status_changed' || e.type === 'escalated' || e.type === 'reopened')?.at ?? c.receivedOn

// One definition of "open" everywhere: not disposed and not transferred away. Transfers are counted apart (rule 5).
export const isActive = (c: Pick<Case, 'lifecycle'>) => c.lifecycle !== 'disposed' && c.lifecycle !== 'transferred'
export const isOpen = isActive

/** A coordinator, or a nodal officer of one of the units involved, may record a coordination decision. */
export const canDecide = (u: Pick<DemoUser, 'role' | 'unit'>, units: string[]) =>
  u.role === 'coordinator' || (u.role === 'nodal_officer' && !!u.unit && units.includes(u.unit))
/** Only officers (dealing or nodal) of the unit that owns a case can act on it. */
export const canActOnCase = (u: Pick<DemoUser, 'role' | 'unit'>, c: Pick<Case, 'ownerUnit'>) =>
  (u.role === 'dealing_officer' || u.role === 'nodal_officer') && u.unit === c.ownerUnit
/** Coordinators and data stewards confirm or rule out institution matches (T4). */
export const canConfirmMatch = (u: Pick<DemoUser, 'role'>) => u.role === 'coordinator' || u.role === 'data_steward'

export const PROTOTYPE_LABEL = 'Prototype setting — not an AICTE-approved timeline'
export const OVERLAP_TITLE = 'Potential Overlapping Cases — Coordination Required'

// Defaults come from rules.json, the one table of tunable rules (the backend keeps an identical copy, checked by a test).
// The values here are live: an administrator's changes are applied on top (see rules.ts), so every screen agrees.
export const RULES_TABLE = RULES as Rule[]
export const RULE_DEFAULTS = Object.fromEntries(RULES_TABLE.filter((r) => r.key).map((r) => [r.key, r.default])) as Record<RuleKey, number>
export const SETTINGS: Record<RuleKey, number> & { replyDays: number } = { ...RULE_DEFAULTS, replyDays: 14 }

export function deadlineFor(c: Case, today: string): DeadlineInfo {
  const cp = c.channel === 'CPGRAMS'
  const days = cp ? SETTINGS.cpgramsDays : SETTINGS.defaultDays
  const age = daysBetween(c.receivedOn, today)
  const dueOn = addDays(c.receivedOn, days)
  const daysToDue = daysBetween(today, dueOn)
  const base = {
    age, days, dueOn, daysToDue,
    interimDay: cp ? SETTINGS.cpgramsInterimDay : undefined,
    verified: cp,
    basis: cp ? 'Verified: DARPG guidelines 23 Aug 2024 (CPGRAMS cases only)' : PROTOTYPE_LABEL,
  }
  if (c.lifecycle === 'disposed' || c.lifecycle === 'transferred') {
    return { ...base, state: 'closed', interimDue: false }
  }
  const interimDue = cp && age >= SETTINGS.cpgramsInterimDay && age <= SETTINGS.cpgramsDays
  const state = age > days ? 'overdue' : age >= days * SETTINGS.approachingPct ? 'approaching' : 'on_track'
  return { ...base, state, interimDue }
}

// ---------- Overlap detection (rules O1–O5) ----------
const RB = 'regulation_bureau'
const GR = 'grievance_cell'

export function detectOverlaps(cases: Case[], units: Unit[], today: string): OverlapAlert[] {
  const kind = (u: string) => units.find((x) => x.code === u)?.kind
  const byInst = new Map<string, Case[]>()
  for (const c of cases) if (c.institutionId) byInst.set(c.institutionId, [...(byInst.get(c.institutionId) ?? []), c])

  // One alert per institution: every rule that fired and every case involved, so the units have one
  // conversation about one institution. Its id (fingerprint) is the institution plus the sorted case ids,
  // so when a new case joins, the alert comes back for review once.
  const out: OverlapAlert[] = []
  const found = new Map<string, { ids: Set<string>; rules: RuleFire[] }>()
  const add = (instId: string, ids: string[], rule: RuleFire) => {
    const f = found.get(instId) ?? { ids: new Set<string>(), rules: [] }
    ids.forEach((id) => f.ids.add(id))
    if (!f.rules.some((r) => r.code === rule.code)) f.rules.push(rule)
    found.set(instId, f)
  }

  for (const [instId, list] of byInst) {
    const active = list.filter(isActive)
    const units = new Set(active.map((c) => c.ownerUnit))
    const pg = active.filter((c) => kind(c.ownerUnit) === GR)
    const rb = active.filter((c) => kind(c.ownerUnit) === RB)

    let o1 = false
    if (pg.length && rb.length) {
      o1 = true
      add(instId, [...pg, ...rb].map((c) => c.id), {
        code: 'O1', severity: 'High',
        why: 'A Grievance Cell (PGRC) case and a Regulation Bureau case are both open for the same institution, so two units may act on one matter.',
        nextStep: 'PGRC and RB nodal officers to compare the cases and decide whether one unit should lead.',
      })
    }
    if (!o1 && units.size >= 2) {
      add(instId, active.map((c) => c.id), {
        code: 'O2', severity: 'Medium',
        why: `Open cases are held by ${units.size} different units for the same institution.`,
        nextStep: 'Nodal officers of the involved units to check whether the cases concern the same matter.',
      })
    }
    const byCat = new Map<string, Case[]>()
    for (const c of list) {
      if (c.lifecycle === 'transferred') continue
      if (c.lifecycle === 'disposed' && daysBetween(c.lastActionOn, today) > SETTINGS.o3WindowDays) continue
      byCat.set(c.category, [...(byCat.get(c.category) ?? []), c])
    }
    for (const [cat, g] of byCat) {
      if (new Set(g.map((c) => c.ownerUnit)).size >= 2 && g.some(isActive)) {
        add(instId, g.map((c) => c.id), {
          code: 'O3', severity: 'Medium',
          why: `The same category (${categoryLabel(cat).toLowerCase()}) appears in ${new Set(g.map((c) => c.ownerUnit)).size} units within ${SETTINGS.o3WindowDays} days.`,
          nextStep: 'Review whether the earlier case already covers the new one before more work is done.',
        })
      }
    }
    const pending = active.filter((c) => c.lifecycle === 'awaiting_party' || c.lifecycle === 'inspection_hearing')
    for (const n of active.filter((c) => daysBetween(c.receivedOn, today) <= SETTINGS.o4NewWithinDays)) {
      const others = pending.filter((p) => p.ownerUnit !== n.ownerUnit)
      if (others.length) {
        add(instId, [n.id, ...others.map((p) => p.id)], {
          code: 'O4', severity: 'High',
          why: 'A newly received case arrived while another unit has a regulatory step pending (notice sent or inspection/hearing stage).',
          nextStep: 'Inform the unit running the pending step and agree who should respond, before any parallel action.',
        })
      }
    }
    const byRef = new Map<string, Case[]>()
    for (const c of list) if (c.sourceComplaintRef) byRef.set(c.sourceComplaintRef, [...(byRef.get(c.sourceComplaintRef) ?? []), c])
    for (const [ref, g] of byRef) {
      if (new Set(g.map((c) => c.ownerUnit)).size >= 2) {
        add(instId, g.map((c) => c.id), {
          code: 'O5', severity: 'High',
          why: `Complaint reference ${ref} is held by more than one unit — likely duplicate, please confirm.`,
          nextStep: 'Confirm whether these are the same complaint; if so record a duplicate decision (owners close their own case).',
        })
      }
    }
  }
  for (const [instId, f] of found) {
    const sorted = [...f.ids].sort()
    const rules = [...f.rules].sort((x, y) => x.code.localeCompare(y.code))
    out.push({ id: `${instId}|${sorted.join(',')}`, institutionId: instId, caseIds: sorted, rules, severity: rules.some((r) => r.severity === 'High') ? 'High' : 'Medium', title: OVERLAP_TITLE })
  }
  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'High' ? -1 : 1))
}

export const decisionFor = (a: OverlapAlert, decisions: Decision[]) => decisions.find((d) => d.alertId === a.id)

/** Field check for side-by-side comparisons. A missing value is "not given", never "same". */
export type Verdict = 'same' | 'similar' | 'different' | 'not_given'
/** Same (95 or more), Similar (75 to 94), Different (below 75). A name match is never called the same unless it is nearly exact. */
export const nameVerdict = (score: number): Verdict => (score >= 0.95 ? 'same' : score >= 0.75 ? 'similar' : 'different')
export function compareValues(values: (string | null | undefined)[]): Verdict {
  const norm = values.map((v) => (v ?? '').trim().toLowerCase())
  if (norm.length < 2 || norm.some((v) => !v)) return 'not_given'
  return norm.every((v) => v === norm[0]) ? 'same' : 'different'
}

// ---------- Institution-name matching (T3 suggestions only) ----------
// The overall score is the name score plus at most 0.04 for a matching district and PIN, so a weak name match never looks certain.
const ABBR: Record<string, string> = {
  engg: 'engineering', eng: 'engineering', inst: 'institute', tech: 'technology', mgmt: 'management',
  poly: 'polytechnic', govt: 'government', coll: 'college', univ: 'university',
}
const STOP = new Set(['the', 'of', 'and', 'trust', 'society', 'education', 'educational', 'a'])

export function normaliseName(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)
    .map((t) => ABBR[t] ?? t).filter((t) => !STOP.has(t))
}
const bigrams = (s: string) => { const r = new Set<string>(); for (let i = 0; i < s.length - 1; i++) r.add(s.slice(i, i + 2)); return r }

export function nameScore(a: string, b: string): number {
  const ta = new Set(normaliseName(a)), tb = new Set(normaliseName(b))
  if (!ta.size || !tb.size) return 0
  const inter = [...ta].filter((t) => tb.has(t)).length
  const tokenSet = inter / Math.min(ta.size, tb.size) * 0.5 + inter / new Set([...ta, ...tb]).size * 0.5
  const ba = bigrams([...ta].join('')), bb = bigrams([...tb].join(''))
  const dice = (2 * [...ba].filter((x) => bb.has(x)).length) / (ba.size + bb.size || 1)
  return 0.6 * tokenSet + 0.4 * dice
}

export function suggestionsFor(c: Pick<Case, 'recorded'>, insts: Institution[], rejected: string[] = []): MatchSuggestion[] {
  const out: MatchSuggestion[] = []
  for (const i of insts) {
    if (rejected.includes(i.id)) continue
    const base = nameScore(c.recorded.name, i.name)
    const evidence = [`Name similarity ${base.toFixed(2)} after normalisation`]
    let s = base
    if (c.recorded.district) {
      const same = c.recorded.district.toLowerCase() === i.district.toLowerCase()
      s += same ? 0.02 : -0.05
      evidence.push(same ? `Same district (${i.district})` : `District differs (recorded ${c.recorded.district}, institution ${i.district})`)
    }
    if (c.recorded.pin) {
      const same = c.recorded.pin === i.pin
      s += same ? 0.01 : -0.01
      evidence.push(same ? 'Same PIN' : 'PIN differs')
    }
    s = Math.max(0, Math.min(1, s))
    if (s >= SETTINGS.suggestMinScore) out.push({ institutionId: i.id, score: Number(s.toFixed(2)), evidence })
  }
  return out.sort((a, b) => b.score - a.score).slice(0, SETTINGS.topN)
}

// ---------- Filtering & dashboard aggregates ----------
export function filterCases(cases: Case[], f: CaseFilters, insts: Institution[], units: Unit[], today: string): Case[] {
  const q = f.q?.trim().toLowerCase()
  const unitRegion = (u: string) => units.find((x) => x.code === u)?.region
  return cases.filter((c) => {
    const inst = insts.find((i) => i.id === c.institutionId)
    if (q) {
      const hay = [c.uid, c.sourceRef, c.recorded.name, inst?.name, inst?.permanentId].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (f.unit && c.ownerUnit !== f.unit) return false
    if (f.region && (inst?.region ?? unitRegion(c.ownerUnit)) !== f.region) return false
    if (f.category && c.category !== f.category) return false
    if (f.channel && c.channel !== f.channel) return false
    if (f.lifecycle && f.lifecycle !== 'any') {
      if (f.lifecycle === 'pending' ? c.lifecycle !== 'received'
        : f.lifecycle === 'under_process' ? !['under_examination', 'awaiting_party', 'inspection_hearing'].includes(c.lifecycle)
        : f.lifecycle === 'active' ? !isActive(c)
        : f.lifecycle === 'open' ? !isOpen(c) : c.lifecycle !== f.lifecycle) return false
    }
    if (f.match) {
      if (f.match === 'unresolved' ? !['pending_review', 'unresolved'].includes(c.matchState) : c.matchState !== f.match) return false
    }
    if (f.deadline && deadlineFor(c, today).state !== f.deadline) return false
    if (f.from && c.receivedOn < f.from) return false
    if (f.to && c.receivedOn > f.to) return false
    return true
  })
}

export const AGEING = [
  { label: '0–7 d', max: 7 }, { label: '8–21 d', max: 21 }, { label: '22–45 d', max: 45 },
  { label: '46–90 d', max: 90 }, { label: '>90 d', max: Infinity },
]

const group = (l: Lifecycle) =>
  l === 'received' ? 'pending' : l === 'disposed' ? 'disposed' : l === 'transferred' ? 'transferred' : l === 'escalated' ? 'escalated' : 'under_process'

export function summarise(cases: Case[], alerts: OverlapAlert[], decisions: Decision[], insts: Institution[], units: Unit[], today: string) {
  const count = (fn: (c: Case) => boolean) => cases.filter(fn).length
  const open = cases.filter(isOpen)
  const disposed = count((c) => c.lifecycle === 'disposed')
  const unitCodes = units.filter((u) => cases.some((c) => c.ownerUnit === u.code)).map((u) => u.code)

  const months: string[] = []
  const t = toDate(today)
  for (let i = 11; i >= 0; i--) months.push(iso(new Date(t.getFullYear(), t.getMonth() - i, 1)).slice(0, 7))
  const trend = months.map((m) => ({
    month: m,
    disposed: cases.filter((c) => c.lifecycle === 'disposed' && c.lastActionOn.startsWith(m)).length,
    transferred: cases.filter((c) => c.lifecycle === 'transferred' && c.lastActionOn.startsWith(m)).length,
  }))

  return {
    total: cases.length,
    pending: count((c) => group(c.lifecycle) === 'pending'),
    underProcess: count((c) => group(c.lifecycle) === 'under_process'),
    disposed,
    transferred: count((c) => c.lifecycle === 'transferred'),
    escalated: count((c) => c.lifecycle === 'escalated'),
    overdue: count((c) => deadlineFor(c, today).state === 'overdue'),
    overlapsAwaiting: alerts.filter((a) => !decisions.some((d) => d.alertId === a.id)).length,
    unresolvedMatches: count((c) => c.matchState === 'pending_review' || c.matchState === 'unresolved'),
    // disposal rate = disposed / (disposed + open); transfers are reported separately, never in the numerator
    disposalRate: disposed + open.length ? disposed / (disposed + open.length) : 0,
    workload: unitCodes.map((u) => ({ unit: u, open: open.filter((c) => c.ownerUnit === u).length })).sort((a, b) => b.open - a.open),
    ageing: AGEING.map((b, i) => {
      const lo = i === 0 ? -1 : AGEING[i - 1].max
      return { bucket: b.label, count: open.filter((c) => { const a = daysBetween(c.receivedOn, today); return a > lo && a <= b.max }).length }
    }),
    regions: Object.entries(
      open.reduce<Record<string, number>>((m, c) => {
        const r = insts.find((i) => i.id === c.institutionId)?.region ?? 'Unmatched'
        m[r] = (m[r] ?? 0) + 1
        return m
      }, {}),
    ).map(([region, count]) => ({ region, count })).sort((a, b) => b.count - a.count),
    trend,
  }
}

// ---------- Automatic institution resolution (tiers T1, T2, T3) ----------
/** Trim, upper-case, and unify spaces, underscores and unicode dashes so "1 2201455" equals "1-2201455". */
export const normaliseId = (s: string) => s.trim().toUpperCase().replace(/[\s_‐-―−]+/g, '-')

export interface Resolution { state: MatchState; method?: MatchMethod; institutionId?: string; evidence: string[]; suggestions: MatchSuggestion[] }

/**
 * T1: exact Permanent ID. T2: a VERIFIED alternate identifier (Current ID, AISHE code, confirmed alias).
 * T3: name similarity gives suggestions only; nothing is linked until a person confirms (T4).
 */
export function resolveInstitution(rec: Case['recorded'], insts: Institution[]): Resolution {
  if (rec.permanentId) {
    const want = normaliseId(rec.permanentId)
    const hit = insts.find((i) => normaliseId(i.permanentId) === want)
    if (hit) return { state: 'resolved_auto', method: 'T1_exact', institutionId: hit.id, suggestions: [], evidence: [`Recorded Permanent ID ${hit.permanentId} matches exactly`] }
  }
  if (rec.currentId) {
    const want = normaliseId(rec.currentId)
    for (const i of insts) {
      const id = i.identifiers.find((x) => x.verified && x.type !== 'former_name' && normaliseId(x.value) === want)
      if (id) return { state: 'resolved_auto', method: 'T2_crosswalk', institutionId: i.id, suggestions: [], evidence: [`No Permanent ID recorded`, `Recorded ${id.type === 'aishe_code' ? 'AISHE code' : 'Current ID'} ${id.value} matches a verified identifier of this institution`] }
    }
  }
  // A name a person already confirmed (T4) now resolves automatically, the same way as a verified ID.
  const wantName = normaliseName(rec.name).join(' ')
  if (wantName) {
    for (const i of insts) {
      const alias = i.identifiers.find((x) => x.verified && x.type === 'confirmed_alias' && normaliseName(x.value).join(' ') === wantName)
      if (alias) return { state: 'resolved_auto', method: 'T2_crosswalk', institutionId: i.id, suggestions: [], evidence: ['No Permanent ID recorded', `The name “${alias.value}” was confirmed by a person earlier, so it matches automatically`] }
    }
  }
  const suggestions = suggestionsFor({ recorded: rec }, insts)
  return { state: suggestions.length ? 'pending_review' : 'unresolved', suggestions, evidence: suggestions.length ? ['No exact or verified identifier matched. Name suggestions need a coordinator to confirm.'] : ['No identifier and no close name match.'] }
}
