// MOCK API layer. Same shape the real FastAPI client will have — swap this file's internals in Phase B.
// Components only talk to `api`; derived values (alerts, counts, suggestions, proof) are computed by lib/logic.ts and lib/proof.ts.
// Every action a person takes writes an audit entry, like the real backend will.
import { CASES, INSTITUTIONS, SOURCE_SYNC, TODAY, UNITS, CATEGORIES, localStatusFor } from './data'
import { IMPORTS, JOB_RUNS, REPLIES, STATUS_MAP } from './extra'
import {
  AGEING, SETTINGS, stageSince, addDays, canActOnCase, canConfirmMatch, canDecide, daysBetween, deadlineFor, detectOverlaps, filterCases,
  isActive, isOpen, normaliseId, resolveInstitution, summarise, suggestionsFor,
} from '../logic'
import type { Resolution, RuleKey } from '../logic'
import { chainHash, closureChecks, compareFields, escalationFor, proofTrail, rulePerformance, verifyChain, type CaseAlertInfo } from '../proof'
import { checkRow, toCsv } from '../imports'
import { ApiError } from '../errors'
import { applyRules, display, ruleByKey, ruleItems, validateRules } from '../rules'
import { mainIssue, sharedIssues } from '../issues'
import { DECISION_LABEL, DISPOSAL_LABEL, RULE_LABEL, STAGE_LABEL, categoryLabel } from '../labels'
import { overlapHeadline, overlapNote, overlapStory } from '../overlapCopy'
import { datedActions, findCollisions, nextStep } from '../calendar'
import { preActionCheck, type ActionKind } from '../solution'
import type {
  AuditEvent, Case, CaseDocument, CaseFilters, Channel, CheckedRow, Decision, DecisionType, DemoUser, DisposalType, ImportBatch, ImportRow,
  InboxItem, Institution, Lifecycle, MatchSuggestion, OverlapAlert, ReplyRequest, StampState, Watch,
} from '../types'

const latency = <T,>(v: T) => new Promise<T>((res) => setTimeout(() => res(structuredClone(v)), 120))
const PAGE = 15
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
const short = (d: string) => new Date(d.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

export { ApiError }

export const DEMO_USERS: (DemoUser & { title: string; username: string })[] = [
  { id: 'u1', username: 'arao', name: 'Anjali Rao', role: 'nodal_officer', unit: 'PGRC', title: 'Nodal Officer — Public Grievance Redressal Cell (PGRC)' },
  { id: 'u2', username: 'siyer', name: 'Suresh Iyer', role: 'nodal_officer', unit: 'RB-WR', title: 'Nodal Officer — Regulation Bureau, Western Region (RB-WR)' },
  { id: 'u3', username: 'mkhan', name: 'Meher Khan', role: 'coordinator', title: 'Cross-Unit Coordinator' },
  { id: 'u4', username: 'pnair', name: 'Pradeep Nair', role: 'dealing_officer', unit: 'PGRC', title: 'Dealing Officer — Public Grievance Redressal Cell (PGRC)' },
  { id: 'u5', username: 'rdas', name: 'Ritu Das', role: 'senior_management', title: 'Senior Management (view only)' },
  { id: 'u6', username: 'kmenon', name: 'Kavya Menon', role: 'data_steward', title: 'Data Steward — Imports and Institution Records' },
  { id: 'u7', username: 'vjoshi', name: 'Vikram Joshi', role: 'admin', title: 'System Administrator — Settings and Users' },
]
const who = (u: DemoUser) => u.name + (u.unit ? `, ${u.unit}` : '')

// ---------- Mutable in-memory state (resets on reload, or with "Reset demo data") ----------
const cases: Case[] = []
const insts: Institution[] = []
let decisions: Decision[] = []
let rejectedSuggestions: Record<string, string[]> = {}
let replies: ReplyRequest[] = []
let imports: ImportBatch[] = []
let statusMap: Record<string, Record<string, Lifecycle>> = {}
let watches: Watch[] = []
let audit: AuditEvent[] = []
let seen = new Set<string>()
const allKnownAlerts: OverlapAlert[] = []
let lastSweepAt = Date.now() - (Date.now() % 3_600_000)   // the hourly check last ran at the top of the hour
let seqNo = 1000

const nowAt = () => `${TODAY}T${new Date().toTimeString().slice(0, 5)}`

/** Append one entry to the audit chain. Returns its reference, e.g. "#412". */
const WENT_AHEAD = 'Went ahead on a'
/** Same as the server: the pre-action check at the moment of the action, noted on the audit entry when the light was amber or red. */
function wentAheadNote(c: { id: string; ownerUnit: string; category: string; institutionId: string | null }, action: ActionKind, targetStage?: Lifecycle): string {
  if (!c.institutionId) return ''
  const r = preActionCheck({ action, unit: c.ownerUnit, caseId: c.id, category: c.category, lanes: lanesFor(c.institutionId), targetStage })
  return r.light === 'green' ? '' : ` [${WENT_AHEAD} ${r.light} check: ${r.headline}]`
}

function writeAudit(actor: string, action: string, entity: string, details: string, at = nowAt()): string {
  const prev = audit.length ? audit[audit.length - 1].hash : 'genesis'
  const base = { seq: audit.length + 1, at, actor, action, entity, details }
  audit.push({ ...base, prevHash: prev, hash: chainHash(prev, base) })
  return `#${base.seq}`
}

const EVENT_ACTION: Record<string, string> = {
  created: 'Case registered', imported: 'Case imported', status_changed: 'Stage changed', action_recorded: 'Action recorded', transferred: 'Case transferred',
  escalated: 'Case escalated', disposed: 'Case closed', reopened: 'Case reopened', linked: 'Decision recorded', match_resolved: 'Institution matched',
  reply_requested: 'Reply asked for', reply_received: 'Reply received',
}

function seed() {
  cases.length = 0; cases.push(...structuredClone(CASES))
  insts.length = 0; insts.push(...structuredClone(INSTITUTIONS))
  decisions = []; rejectedSuggestions = {}; seen = new Set(); allKnownAlerts.length = 0
  replies = structuredClone(REPLIES); imports = structuredClone(IMPORTS); statusMap = structuredClone(STATUS_MAP)
  watches = [{ userId: 'u3', institutionId: insts.find((i) => i.name === 'Aravali Institute of Management')!.id, since: addDays(TODAY, -20) }]
  audit = []
  // Rebuild the audit chain from the history already in the records, oldest first.
  const past = cases.flatMap((c) => c.events.map((e) => ({ c, e }))).sort((a, b) => a.e.at.localeCompare(b.e.at))
  for (const b of [...imports].reverse()) past.push({ c: null as unknown as Case, e: { type: 'imported', at: b.at.slice(0, 10), actor: b.by, text: `${b.fileName}: ${b.rows} rows, ${b.rejected} not saved` } })
  past.sort((a, b) => a.e.at.localeCompare(b.e.at))
  for (const { c, e } of past) {
    const ref = writeAudit(e.actor === 'system' ? 'Ekatra (automatic)' : e.actor, c ? EVENT_ACTION[e.type] ?? e.type : 'Import finished', c ? c.uid : 'import', e.text, `${e.at}T09:00`)
    if (c) e.auditRef = ref
  }
}
seed()

const alerts = () => detectOverlaps(cases, UNITS, TODAY)
const instOf = (id: string | null) => insts.find((i) => i.id === id) ?? null
const caseOf = (id: string) => { const c = cases.find((x) => x.id === id); if (!c) throw new ApiError('not_found', 'This case could not be found. It may have been removed.'); return c }
const strip = (c: Case) => ({ ...c, sensitive: undefined })
const remember = (a: OverlapAlert) => { if (!allKnownAlerts.some((x) => x.id === a.id)) allKnownAlerts.push(a) }
const historyOf = (alertId: string) => decisions.filter((d) => d.alertId === alertId)
const latestDecision = (alertId: string) => { const h = historyOf(alertId); return h.length ? h[h.length - 1] : null }
/** Settled = a decision other than "needs more review" is recorded. */
const settled = (alertId: string) => { const d = latestDecision(alertId); return !!d && d.decision !== 'request_further_review' }
const unitsOf = (a: OverlapAlert) => [...new Set(a.caseIds.map((id) => caseOf(id).ownerUnit))]
const sinceOf = (a: OverlapAlert) => a.caseIds.map(caseOf).filter(isActive).map((c) => c.receivedOn).sort().pop() ?? TODAY

// When a new case joins an overlap that was already decided, the alert comes back. The earlier decision is carried along.
const earlierDecision = (a: OverlapAlert) => {
  const prior = decisions
    .map((d) => ({ d, k: allKnownAlerts.find((x) => x.id === d.alertId) }))
    .filter((x) => x.k && x.k.id !== a.id && x.k.institutionId === a.institutionId && x.k.caseIds.every((id) => a.caseIds.includes(id)))
  return prior.length ? prior[prior.length - 1].d : null
}

export type BoardState = 'waiting' | 'in_review' | 'escalated' | 'decided'
const boardState = (a: OverlapAlert): BoardState => {
  if (settled(a.id)) return 'decided'
  if (daysBetween(addDays(sinceOf(a), SETTINGS.coordDueDays), TODAY) > 0) return 'escalated'
  if (seen.has(a.id) || latestDecision(a.id)) return 'in_review'
  return 'waiting'
}

// Lanes = every case of one institution, shaped for the timeline visual.
const toCal = (c: Case) => ({ id: c.id, uid: c.uid, unit: c.ownerUnit, channel: c.channel, receivedOn: c.receivedOn, lifecycle: c.lifecycle, scheduled: c.scheduled, deadline: deadlineFor(c, TODAY) })
const lanesFor = (instId: string) =>
  cases.filter((c) => c.institutionId === instId).map((c) => ({
    id: c.id, uid: c.uid, unit: c.ownerUnit, lifecycle: c.lifecycle, category: c.category,
    start: c.receivedOn, end: c.lifecycle === 'disposed' || c.lifecycle === 'transferred' ? c.lastActionOn : null,
  }))
export type Lane = ReturnType<typeof lanesFor>[number]

/** Every overlap a case is part of: live ones, plus decided ones whose case set has since changed. */
function alertInfoFor(caseId: string): CaseAlertInfo[] {
  const live = alerts().filter((a) => a.caseIds.includes(caseId))
  live.forEach(remember)
  const old = allKnownAlerts.filter((a) => a.caseIds.includes(caseId) && !live.some((l) => l.id === a.id) && settled(a.id))
  return [...old, ...live].map((a) => ({ id: a.id, rules: a.rules, units: unitsOf(a), since: sinceOf(a), decision: latestDecision(a.id) }))
}

function proofFor(c: Case) {
  const auditRef = (cc: Case, type: string) => [...cc.events].reverse().find((e) => e.type === type)?.auditRef
  return proofTrail(c, { today: TODAY, institution: instOf(c.institutionId), alerts: alertInfoFor(c.id), replies: replies.filter((r) => r.caseId === c.id), auditRef })
}

// ---------- Automation: what Ekatra runs on every incoming case ----------
export type ScenarioId = 'current_id' | 'permanent_id' | 'name_only'
export interface PipelineStep { key: 'receive' | 'match' | 'overlap' | 'deadline' | 'notify'; title: string; detail: string; outcome: 'auto' | 'person'; ms: number }
export const SCENARIOS: { id: ScenarioId; label: string }[] = [
  { id: 'current_id', label: 'Only a Current ID' },
  { id: 'permanent_id', label: 'Permanent ID with typos' },
  { id: 'name_only', label: 'Only a name' },
]
const scenarioRecord = (id: ScenarioId): Case['recorded'] => {
  const pid = insts.find((i) => i.name === 'Hooghly Polytechnic')!.permanentId
  return id === 'current_id' ? { name: 'Sahyadri Inst of Tech, Pune', district: 'Pune', currentId: '1 2201455' }
    : id === 'permanent_id' ? { name: 'Hoogly Polytechnic', permanentId: ` ${pid.replace('-', ' ')} ` }
    : { name: 'Malnad Polytechnic', district: 'Bengaluru' }
}

interface Draft {
  unit: string; channel: Channel; sourceRef?: string; complaintRef?: string; category: string; summary: string; receivedOn: string
  localStatus?: string; lifecycle?: Lifecycle; recorded: Case['recorded']; complainant?: string; narrative?: string; scheduled?: { on: string; what: string }
}

/** The arrival steps: register, find the institution, check for overlaps, set the clock, tell the right people. */
function arrival(d: Draft, actor: string, how: 'form' | 'import' | 'demo') {
  const t0 = performance.now()
  const lap = () => Math.max(1, Math.round(performance.now() - t0))
  const before = new Set(alerts().map((a) => a.id))
  seqNo += 1
  const uid = `CC-2026-${String(cases.length + 1 + seqNo).padStart(6, '0')}`
  const steps: PipelineStep[] = []
  steps.push({ key: 'receive', title: 'Received and checked', detail: `${uid}, from ${d.channel === 'CPGRAMS' ? 'CPGRAMS' : d.unit}`, outcome: 'auto', ms: lap() })

  const res: Resolution = resolveInstitution(d.recorded, insts)
  const inst = res.institutionId ? instOf(res.institutionId) : null
  steps.push(inst
    ? { key: 'match', title: 'Institution found', detail: `${inst.name}, by ${res.method === 'T1_exact' ? 'Permanent ID' : 'another verified ID'}`, outcome: 'auto', ms: lap() }
    : { key: 'match', title: 'Institution needs a person', detail: res.suggestions.length ? `${res.suggestions.length} likely ${res.suggestions.length === 1 ? 'match' : 'matches'}. A coordinator chooses.` : 'No close match found.', outcome: 'person', ms: lap() })

  const lifecycle = d.lifecycle ?? 'received'
  const c: Case = {
    id: `c${cases.length + 1 + seqNo}`, uid, sourceUnit: d.unit, ownerUnit: d.unit, sourceRef: d.sourceRef || `${d.unit}/2026/${seqNo}`, sourceComplaintRef: d.complaintRef || undefined,
    channel: d.channel, receivedOn: d.receivedOn, category: d.category, summary: d.summary || 'No summary given.',
    localStatus: d.localStatus ?? localStatusFor(d.unit, lifecycle), lifecycle, lastAction: 'Registered', lastActionOn: TODAY, nextAction: 'Examine and respond',
    institutionId: inst?.id ?? null, recorded: d.recorded, matchState: res.state, matchMethod: res.method, matchEvidence: res.evidence,
    sensitive: { complainant: d.complainant || 'Not given', narrative: d.narrative || 'Not given' },
    events: [], scheduled: d.scheduled,
  }
  const t = how === 'import' ? 'imported' : 'created'
  c.events.push({ type: t, at: TODAY, actor: how === 'demo' ? 'system' : actor, text: how === 'import' ? `Imported from a ${d.unit} file` : how === 'form' ? `Added by ${actor}` : 'Received and registered automatically', auditRef: writeAudit(actor, EVENT_ACTION[t], uid, `${d.unit}, ${d.channel}`) })
  c.events.push({ type: 'match_resolved', at: TODAY, actor: 'system', text: inst ? `Institution found automatically (${res.method === 'T1_exact' ? 'Permanent ID' : 'another verified ID'})` : 'Institution could not be found automatically', auditRef: writeAudit('Ekatra (automatic)', 'Institution matched', uid, inst ? inst.name : 'Needs a person') })
  cases.push(c)

  const fresh = alerts().find((a) => !before.has(a.id) && a.caseIds.includes(c.id))
  if (fresh) remember(fresh)
  const units = fresh ? unitsOf(fresh) : []
  steps.push(!inst
    ? { key: 'overlap', title: 'Overlap check waits', detail: 'It runs once the institution is confirmed.', outcome: 'person', ms: lap() }
    : fresh
      ? { key: 'overlap', title: 'Possible overlap found', detail: `${units.join(' and ')} are working on ${inst.name}.`, outcome: 'auto', ms: lap() }
      : { key: 'overlap', title: 'No overlap', detail: 'No other unit is working on this institution.', outcome: 'auto', ms: lap() })

  const dl = deadlineFor(c, TODAY)
  steps.push({ key: 'deadline', title: 'Clock set', detail: `Due ${short(dl.dueOn)}${dl.interimDay ? `, interim reply by day ${dl.interimDay}` : ' (prototype time limit)'}.`, outcome: 'auto', ms: lap() })
  steps.push(fresh
    ? { key: 'notify', title: 'People told', detail: `Nodal officers of ${units.join(' and ')} have a review waiting.`, outcome: 'auto', ms: lap() }
    : !inst
      ? { key: 'notify', title: 'Sent to name check', detail: 'It waits in the coordinator’s list.', outcome: 'person', ms: lap() }
      : { key: 'notify', title: `Added to ${d.unit}’s list`, detail: 'Waiting for an officer to pick it up.', outcome: 'auto', ms: lap() })
  return { caseId: c.id, uid, steps, overlapId: fresh?.id ?? null, matched: !!inst }
}

const automationStats = () => {
  const total = cases.length
  const auto = cases.filter((c) => c.matchState === 'resolved_auto').length
  const open = cases.filter(isOpen)
  const dl = open.map((c) => deadlineFor(c, TODAY))
  const mins = Math.floor((Date.now() - lastSweepAt) / 60_000)
  const live = alerts()
  return {
    autoMatched: auto, totalCases: total, autoPct: total ? Math.round((auto / total) * 100) : 0,
    needsPerson: cases.filter((c) => c.matchState === 'pending_review' || c.matchState === 'unresolved').length,
    overlaps: live.length, overlapsWaiting: live.filter((a) => !settled(a.id)).length, tracked: open.length,
    overdue: dl.filter((d) => d.state === 'overdue').length,
    decisions: decisions.length,
    minutesSinceSweep: mins, minutesToNext: Math.max(1, 60 - mins),
  }
}

/** Steps shown as small stamps in the inbox: what already ran automatically for a new case. */
const arrivalStamps = (c: Case): { label: string; state: StampState }[] => {
  const p = proofFor(c)
  return p.slice(0, 4).map((s) => ({ label: s.title, state: s.state }))
}

/** The Settings screen's data: the shared rules table with live values, how each overlap rule has fared, and each unit's status words. */
const settingsView = () => ({
  items: ruleItems(),
  values: { ...SETTINGS },
    rules: rulePerformance(allKnownAlerts, decisions).map((r) => ({ ...r, label: RULE_LABEL[r.code].short })),
    statusMap: Object.entries(statusMap).map(([unit, m]) => ({ unit, words: Object.entries(m).map(([word, stage]) => ({ word, stage })) })),
})

/** What AICTE cares about, not what the software did: CPGRAMS cases closed inside the verified days, and overlaps decided in time. */
const outcomesNow = () => {
  const cp = cases.filter((c) => c.channel === 'CPGRAMS' && c.lifecycle === 'disposed')
  const decided = decisions.filter((d) => d.decision !== 'request_further_review').map((d) => ({ d, a: allKnownAlerts.find((x) => x.id === d.alertId) })).filter((x) => x.a)
  return {
    cpgrams: { closed: cp.length, onTime: cp.filter((c) => daysBetween(c.receivedOn, c.lastActionOn) <= SETTINGS.cpgramsDays).length, limitDays: SETTINGS.cpgramsDays },
    overlaps: { decided: decided.length, inTarget: decided.filter((x) => daysBetween(sinceOf(x.a!), x.d.at.slice(0, 10)) <= SETTINGS.coordDueDays).length, targetDays: SETTINGS.coordDueDays },
    asOf: TODAY,
  }
}

/** Whom to call in each unit: its nodal officer, or the coordinator when the unit has none on record. */
const contactsFor = (units: string[]) => units.flatMap((unit) => {
  const nodal = DEMO_USERS.find((u) => u.role === 'nodal_officer' && u.unit === unit)
  const coord = DEMO_USERS.find((u) => u.role === 'coordinator')
  return nodal ? [{ unit, name: nodal.name, role: 'Nodal officer' }] : coord ? [{ unit, name: coord.name, role: 'Coordinator (no nodal officer on record for this unit)' }] : []
})

/** Who may decide an overlap: the nodal officer of each unit involved; units with none on record fall to the coordinator. */
const decidersFor = (units: string[]) => {
  const nodal = DEMO_USERS.filter((u) => u.role === 'nodal_officer' && u.unit && units.includes(u.unit))
  const missing = units.some((un) => !nodal.some((n) => n.unit === un))
  return [...nodal.map((u) => ({ name: u.name, unit: u.unit ?? null, role: 'nodal_officer' })), ...(missing ? DEMO_USERS.filter((u) => u.role === 'coordinator').map((u) => ({ name: u.name, unit: null, role: 'coordinator' })) : [])]
}

const fmtShortDate = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

function annotateRows(unit: string, checked: CheckedRow[]): CheckedRow[] {
  const seen = new Map<string, number>()
  for (const r of checked) {
    const ref = (r.data.source_reference ?? '').trim()
    if (ref && seen.has(ref) && r.outcome !== 'reject') {
      r.problems.push({ row: r.row, field: 'Your reference', problem: `The same reference appears on row ${seen.get(ref)} of this file.`, fix: 'Keep one row for each case. Delete or correct the repeat.' })
      r.outcome = 'reject'
    } else if (ref && !seen.has(ref)) seen.set(ref, r.row)
    if (r.outcome === 'reject') continue
    const res = resolveInstitution({ name: r.data.institution_name ?? '', permanentId: r.data.permanent_id?.trim() || undefined, currentId: r.data.current_id?.trim() || undefined }, insts)
    const inst = res.institutionId ? instOf(res.institutionId) : null
    r.notes.push(inst ? `Will be linked to ${inst.name} (${res.method === 'T1_exact' ? 'Permanent ID' : 'another verified ID'}).` : 'The institution is found by name only, so a coordinator will be asked to confirm it before overlap checks can run.')
    const cref = (r.data.complaint_ref ?? '').trim()
    if (cref) for (const c of cases.filter((x) => x.sourceComplaintRef && normaliseId(x.sourceComplaintRef) === normaliseId(cref) && x.ownerUnit !== unit && isOpen(x)).slice(0, 2)) r.notes.push(`The same complaint number is already on ${c.uid} in ${c.ownerUnit}. Ekatra will show the two together as a clash.`)
  }
  return checked
}

export const api = {
  today: TODAY,

  demoUsers: () => latency(DEMO_USERS),
  signOut: async () => undefined,
  bootstrap: async () => null as null | (typeof DEMO_USERS)[number],

  signIn: async (username: string, password: string) => {
    const u = DEMO_USERS.find((x) => x.username === username.trim().toLowerCase())
    if (!u) throw new ApiError('invalid_credentials', 'That username is not registered. Pick one of the demo accounts below.')
    if (!password) throw new ApiError('invalid_credentials', 'Enter a password. Any password works in this prototype.')
    writeAudit(who(u), 'Signed in', 'session', 'Demo sign-in')
    return latency(u)
  },

  // ---------- Today ----------
  // The officer's worklist: real items, most urgent first. Each says what, why it matters, and where to act.
  worklist: (user: DemoUser, limit = 8) => {
    type Item = { id: string; kind: 'decide' | 'overdue' | 'interim' | 'soon' | 'match' | 'unassigned' | 'stale' | 'stale_source' | 'reply' | 'import'; title: string; sub: string; to: string; action: string; urgency: number; tone: 'tape' | 'turmeric' | 'plain'; instId?: string | null; uid?: string; chip?: string }
    const out: Item[] = []
    const scope = (c: Case) => !user.unit || c.ownerUnit === user.unit
    const label = (c: Case) => instOf(c.institutionId)?.name ?? `“${c.recorded.name}”`
    const readOnly = user.role === 'senior_management'

    for (const a of alerts()) {
      remember(a)
      if (settled(a.id)) continue
      const units = unitsOf(a)
      if (!readOnly && !canDecide(user, units)) continue
      out.push({ id: 'o' + a.id, kind: 'decide', title: instOf(a.institutionId)!.name, sub: overlapHeadline(a.rules, units), to: `/overlaps/${encodeURIComponent(a.id)}`, action: readOnly ? 'View' : 'Decide', urgency: a.severity === 'High' ? 95 : 75, tone: 'tape' })
    }
    if (user.role !== 'admin' && user.role !== 'data_steward') {
      const perCase = new Map<string, Item>()
      const put = (c: Case, it: Item) => { const ex = perCase.get(c.id); if (!ex || it.urgency > ex.urgency) perCase.set(c.id, it) }
      for (const c of cases.filter((x) => isOpen(x) && scope(x))) {
        const d = deadlineFor(c, TODAY)
        if (d.state === 'overdue') {
          const late = -d.daysToDue
          put(c, { id: 'c' + c.id, kind: 'overdue', title: label(c), uid: c.uid, instId: c.institutionId, chip: `${plural(late, 'day')} overdue`, sub: `Next action: ${c.nextAction}`, to: `/cases/${c.id}`, action: 'Open', urgency: 80 + Math.min(15, late), tone: 'tape' })
        } else if (d.interimDue) {
          put(c, { id: 'c' + c.id, kind: 'interim', title: label(c), uid: c.uid, instId: c.institutionId, chip: 'Interim reply due', sub: `CPGRAMS interim reply, due by day ${d.interimDay}`, to: `/cases/${c.id}`, action: 'Open', urgency: 78, tone: 'turmeric' })
        } else if (d.state === 'approaching' && d.daysToDue <= 3) {
          put(c, { id: 'c' + c.id, kind: 'soon', title: label(c), uid: c.uid, instId: c.institutionId, chip: d.daysToDue === 0 ? 'Due today' : `Due in ${plural(d.daysToDue, 'day')}`, sub: `Next action: ${c.nextAction}`, to: `/cases/${c.id}`, action: 'Open', urgency: 60 - d.daysToDue, tone: 'turmeric' })
        } else if (!c.officer && !readOnly && user.unit) {
          put(c, { id: 'c' + c.id, kind: 'unassigned', title: label(c), uid: c.uid, instId: c.institutionId, chip: 'Unassigned', sub: 'Assign a dealing officer', to: `/cases/${c.id}`, action: 'Open', urgency: 40, tone: 'plain' })
        }
      }
      out.push(...perCase.values())
      for (const r of replies.filter((x) => x.state === 'received' && scope(caseOf(x.caseId)))) {
        const c = caseOf(r.caseId)
        if (c.events.some((e) => e.type === 'action_recorded' && e.at >= r.submission!.at.slice(0, 10))) continue
        out.push({ id: 'r' + r.id, kind: 'reply', title: label(c), uid: c.uid, instId: c.institutionId, chip: 'Reply received', sub: 'Review the reply and record the next step', to: `/cases/${c.id}`, action: 'Read reply', urgency: 70, tone: 'turmeric' })
      }
    }
    if (canConfirmMatch(user)) {
      for (const c of cases.filter((x) => x.matchState === 'pending_review' || x.matchState === 'unresolved')) {
        out.push({ id: 'm' + c.id, kind: 'match', title: `“${c.recorded.name}”`, uid: c.uid, instId: null, chip: 'Institution not identified', sub: 'Confirm the institution name', to: '/matching', action: 'Check name', urgency: 65, tone: 'turmeric' })
      }
    }
    if (user.role === 'data_steward') {
      for (const b of imports.filter((x) => x.rejected > 0)) out.push({ id: 'b' + b.id, kind: 'import', title: `${b.fileName}`, sub: `${plural(b.rejected, 'row')} could not be saved. Each has a fix.`, to: `/import/${b.id}`, action: 'Fix rows', urgency: 62, tone: 'turmeric' })
    }
    for (const s of SOURCE_SYNC.filter((x) => x.lastImportHoursAgo > SETTINGS.staleHours && (!user.unit || x.unit === user.unit || user.role === 'coordinator' || user.role === 'data_steward'))) {
      out.push({ id: 's' + s.unit, kind: 'stale_source', title: `${s.unit} has not sent data for ${Math.floor(s.lastImportHoursAgo / 24)} days`, sub: 'Its numbers may be behind. Ask the unit to send an update.', to: `/cases?unit=${s.unit}`, action: 'See cases', urgency: 55, tone: 'turmeric' })
    }

    out.sort((a, b) => b.urgency - a.urgency)
    const decideCount = out.filter((i) => i.kind === 'decide').length
    const rest = out.filter((i) => i.kind !== 'decide')
    return latency({ items: rest.slice(0, limit), total: rest.length, decideCount })
  },

  automation: () => latency(automationStats()),

  // The hourly check: re-checks every open case and reports what it found. Each run is recorded.
  runSweep: async () => {
    lastSweepAt = Date.now()
    const dl = cases.filter(isOpen).map((c) => deadlineFor(c, TODAY))
    const r = {
      checked: dl.length,
      overdue: dl.filter((d) => d.state === 'overdue').length,
      soon: dl.filter((d) => d.state === 'approaching').length,
      interim: dl.filter((d) => d.interimDue).length,
      escalate: dl.filter((d) => escalationFor(d).level > 0).length,
    }
    writeAudit('Ekatra (automatic)', 'Hourly check run', 'all open cases', `${r.checked} checked, ${r.overdue} overdue, ${r.escalate} raised`)
    return latency(r)
  },

  jobRuns: () => latency(JOB_RUNS.map((j, i) => ({ ...j, at: new Date(lastSweepAt - i * 3_600_000).toTimeString().slice(0, 5) }))),

  // Runs a demo case through the arrival steps. The case is kept, so every screen updates.
  ingest: async (scenario: ScenarioId) =>
    latency(arrival({ unit: 'PGRC', channel: 'CPGRAMS', complaintRef: `DARPG/E/2026/${String(seqNo + 1).padStart(4, '0')}`, category: 'norm_violation', summary: 'Demo case created by the automation preview.', receivedOn: TODAY, recorded: scenarioRecord(scenario) }, 'Ekatra (demo)', 'demo')),

  resetDemo: async () => { seed(); return latency(true) },

  searchIndex: () => latency({
    today: TODAY,
    units: UNITS.map((u) => u.code),
    regions: [...new Set(insts.map((i) => i.region))],
    institutions: insts.map((i) => ({ id: i.id, name: i.name, permanentId: i.permanentId })),
    cases: cases.map((c) => ({ id: c.id, uid: c.uid })),
  }),

  meta: () => latency({ settings: { ...SETTINGS }, units: UNITS, categories: [...CATEGORIES], regions: [...new Set(insts.map((i) => i.region))].sort(), today: TODAY }),

  /** Every headline number, counted once (same as the backend's /summary). Screens read these so none can disagree. */
  summary: (user: DemoUser) => {
    const live = alerts(); live.forEach(remember)
    const awaiting = live.filter((a) => !settled(a.id))
    const unit = user.unit
    const open = cases.filter(isOpen)
    const own = open.filter((c) => !unit || c.ownerUnit === unit)
    const clock = (c: Case) => deadlineFor(c, TODAY)
    const s = summarise(cases, live, decisions.filter((d) => settled(d.alertId)), insts, UNITS, TODAY)
    return latency({
      asOf: `${TODAY}T${new Date(lastSweepAt).toTimeString().slice(0, 5)}`, unit: unit ?? null,
      overlaps: {
        all: live.length, awaiting: awaiting.length, decided: live.length - awaiting.length,
        mine: awaiting.filter((a) => !unit || unitsOf(a).includes(unit)).length,
        needMyDecision: awaiting.filter((a) => canDecide(user, unitsOf(a))).length,
        pastDue: awaiting.filter((a) => daysBetween(addDays(sinceOf(a), SETTINGS.coordDueDays), TODAY) > 0).length,
        wentAhead: audit.filter((e) => e.details.includes(`[${WENT_AHEAD} `)).length,
      },
      cases: { total: s.total, pending: s.pending, underProcess: s.underProcess, transferred: s.transferred, escalated: s.escalated, disposed: s.disposed, overdue: s.overdue, open: open.length },
      mine: {
        open: own.length,
        overdue: own.filter((c) => clock(c).state === 'overdue').length,
        approaching: own.filter((c) => clock(c).state === 'approaching').length,
        interimDue: own.filter((c) => clock(c).interimDue).length,
        waitingOnOthers: own.filter((c) => c.lifecycle === 'awaiting_party' || c.lifecycle === 'inspection_hearing').length,
        unassigned: own.filter((c) => !c.officer).length,
      },
      matching: { toConfirm: cases.filter((c) => c.matchState === 'pending_review' || c.matchState === 'unresolved').length },
      sources: { total: SOURCE_SYNC.length, stale: SOURCE_SYNC.filter((x) => x.lastImportHoursAgo > SETTINGS.staleHours).map((x) => ({ unit: x.unit, hoursAgo: x.lastImportHoursAgo })) },
      outcomes: outcomesNow(),
    })
  },

  /** The traffic light before an action (same rules as the backend's POST /check). Advises only; it never blocks. */
  check: async (b: { action: ActionKind; institutionId: string; unit?: string; caseId?: string; category?: string; targetStage?: Lifecycle }, user: DemoUser) => {
    const unit = b.unit ?? user.unit
    if (!unit) throw new ApiError('validation_error', 'Say which unit is acting.')
    if (!instOf(b.institutionId)) throw new ApiError('not_found', 'No institution with this ID.')
    const res = preActionCheck({ action: b.action, unit, caseId: b.caseId, category: b.category, lanes: lanesFor(b.institutionId), targetStage: b.targetStage })
    return latency({ ...res, contacts: contactsFor(res.askUnits) })
  },

  /** Dated steps of every unit, by institution, with the weeks where two units collide (same as the backend's GET /calendar). */
  calendar: (from?: string, to?: string) => {
    const start = from ?? TODAY, end = to ?? addDays(start, 41)
    const rows = alerts().filter((a) => !settled(a.id)).map((a) => {
      const acts = datedActions(a.caseIds.map(caseOf).map(toCal), start)
      return { overlapId: a.id, institution: instOf(a.institutionId)!, actions: acts.filter((x) => x.kind !== 'deadline' && x.date <= end), collisions: findCollisions(acts) }
    }).filter((r) => r.actions.length > 0).sort((x, y) => x.actions[0].date.localeCompare(y.actions[0].date))
    return latency({ from: start, to: end, institutions: rows })
  },

  dashboard: (f: CaseFilters = {}) => {
    const scoped = filterCases(cases, f, insts, UNITS, TODAY)
    const ids = new Set(scoped.map((c) => c.id))
    const al = alerts().filter((a) => a.caseIds.some((id) => ids.has(id)))
    al.forEach(remember)
    const open = scoped.filter(isOpen)
    // "Settled" decisions only: an overlap marked "needs more review" still counts as waiting.
    const s = summarise(scoped, al, decisions.filter((d) => settled(d.alertId)), insts, UNITS, TODAY)
    const weekOf = (d: string) => Math.floor(daysBetween(d, TODAY) / 7)
    const weekly = Array.from({ length: 26 }, (_, i) => ({ week: 25 - i, label: addDays(TODAY, -(25 - i) * 7), received: 0, disposed: 0, transferred: 0 }))
    for (const c of scoped) {
      const r = weekOf(c.receivedOn); if (r >= 0 && r < 26) weekly[25 - r].received++
      const w = weekOf(c.lastActionOn)
      if (w >= 0 && w < 26 && c.lifecycle === 'disposed') weekly[25 - w].disposed++
      if (w >= 0 && w < 26 && c.lifecycle === 'transferred') weekly[25 - w].transferred++
    }
    const newThisWeek = scoped.filter((c) => daysBetween(c.receivedOn, TODAY) < 7).length
    const newLastWeek = scoped.filter((c) => { const a = daysBetween(c.receivedOn, TODAY); return a >= 7 && a < 14 }).length
    const disposed30 = scoped.filter((c) => c.lifecycle === 'disposed' && daysBetween(c.lastActionOn, TODAY) < 30).length
    const decided = decisions.filter((d) => d.decision !== 'request_further_review')
    return latency({
      ...s,
      weekly, newThisWeek, newLastWeek, disposed30,
      dueSoon: open.filter((c) => deadlineFor(c, TODAY).state === 'approaching').length,
      totalCases: scoped.length,
      pipeline: (['received', 'under_examination', 'awaiting_party', 'inspection_hearing', 'escalated'] as Lifecycle[]).map((stage) => ({ stage, count: scoped.filter((c) => c.lifecycle === stage).length })),
      workloadAgeing: s.workload.map((w) => ({
        unit: w.unit,
        name: UNITS.find((u) => u.code === w.unit)?.name ?? w.unit,
        open: w.open,
        overdue: open.filter((c) => c.ownerUnit === w.unit && deadlineFor(c, TODAY).state === 'overdue').length,
        buckets: AGEING.map((b, i) => {
          const lo = i === 0 ? -1 : AGEING[i - 1].max
          return open.filter((c) => c.ownerUnit === w.unit && (() => { const a = daysBetween(c.receivedOn, TODAY); return a > lo && a <= b.max })()).length
        }),
      })),
      coordination: {
        byType: (Object.keys(DECISION_LABEL) as DecisionType[]).map((t) => ({ type: t, count: decided.filter((d) => d.decision === t).length })),
        rules: rulePerformance(allKnownAlerts, decisions),
      },
      // The demo date is fixed; the time is the last hourly check.
      dataAsOf: `${TODAY}T${new Date(lastSweepAt).toTimeString().slice(0, 5)}`,
      sources: SOURCE_SYNC.map((x) => ({ unit: x.unit, hoursAgo: x.lastImportHoursAgo, stale: x.lastImportHoursAgo > SETTINGS.staleHours })),
    })
  },

  // ---------- Inbox: everything that arrived, in one place ----------
  inbox: (user: DemoUser) => {
    const items: InboxItem[] = []
    const scope = (c: Case) => !user.unit || c.ownerUnit === user.unit
    const instName = (c: Case) => instOf(c.institutionId)?.name ?? `“${c.recorded.name}”`
    const live = alerts(); live.forEach(remember)
    for (const a of live.filter((x) => !settled(x.id) && canDecide(user, unitsOf(x)))) {
      items.push({ id: 'o' + a.id, tab: 'needs_you', title: `Possible overlap: ${instOf(a.institutionId)!.name}`, sub: overlapHeadline(a.rules, unitsOf(a)), at: sinceOf(a), to: `/overlaps/${encodeURIComponent(a.id)}`, action: 'Review' })
    }
    if (canConfirmMatch(user)) for (const c of cases.filter((x) => x.matchState === 'pending_review')) {
      items.push({ id: 'm' + c.id, tab: 'needs_you', title: `Which institution is “${c.recorded.name}”?`, sub: `${c.uid} in ${c.ownerUnit}. Ekatra found likely matches; a person must choose.`, at: c.receivedOn, to: '/matching', action: 'Check name' })
    }
    for (const c of cases.filter((x) => scope(x) && isOpen(x) && !x.officer && (user.role === 'nodal_officer' || user.role === 'dealing_officer'))) {
      items.push({ id: 'n' + c.id, tab: 'needs_you', title: `New case with no officer: ${c.uid}`, sub: `${instName(c)}. Pick it up or assign it.`, at: c.receivedOn, to: `/cases/${c.id}`, action: 'Open' })
    }
    for (const c of cases.filter((x) => scope(x) && daysBetween(x.receivedOn, TODAY) <= 7).sort((a, b) => b.receivedOn.localeCompare(a.receivedOn))) {
      items.push({ id: 'a' + c.id, tab: 'auto', title: `New case ${c.uid}: ${instName(c)}`, sub: `${c.ownerUnit}, ${categoryLabel(c.category).toLowerCase()}. Checked automatically on arrival.`, at: c.receivedOn, to: `/cases/${c.id}`, action: 'Open', steps: arrivalStamps(c) })
    }
    for (const r of replies.filter((x) => scope(caseOf(x.caseId)))) {
      const c = caseOf(r.caseId)
      items.push(r.state === 'received'
        ? { id: 'r' + r.id, tab: 'replies', title: `${instOf(r.institutionId)!.name} replied`, sub: `${c.uid}: ${plural(r.submission!.files.length, 'document')}${r.submission!.late ? ', after the due date' : ', on time'}.`, at: r.submission!.at, to: `/cases/${c.id}#reply`, action: 'Read reply' }
        : { id: 'r' + r.id, tab: 'replies', title: `Waiting for ${instOf(r.institutionId)!.name}`, sub: `${c.uid}: reply ${daysBetween(TODAY, r.dueOn) < 0 ? `was due ${short(r.dueOn)}` : `due ${short(r.dueOn)}`}.`, at: r.createdAt, to: `/cases/${c.id}#reply`, action: 'Open' })
    }
    for (const b of imports.filter((x) => !user.unit || x.unit === user.unit)) {
      items.push({ id: 'b' + b.id, tab: 'imports', title: `${b.unit} sent ${b.fileName}`, sub: `${b.rows} rows: ${b.created} new, ${b.updated} updated, ${b.rejected} not saved.`, at: b.at.slice(0, 10), to: `/import/${b.id}`, action: 'See receipt' })
    }
    for (const s of SOURCE_SYNC.filter((x) => x.lastImportHoursAgo > SETTINGS.staleHours)) {
      items.push({ id: 's' + s.unit, tab: 'imports', title: `${s.unit} has not sent data for ${Math.floor(s.lastImportHoursAgo / 24)} days`, sub: 'Numbers from this unit may be behind.', at: TODAY, to: `/cases?unit=${s.unit}`, action: 'See cases' })
    }
    for (const w of watches.filter((x) => x.userId === user.id)) {
      const i = instOf(w.institutionId)!
      for (const c of cases.filter((x) => x.institutionId === i.id)) for (const e of c.events.filter((x) => daysBetween(x.at, TODAY) <= 30)) {
        items.push({ id: `w${c.id}${e.type}${e.at}`, tab: 'watching', title: `${i.name}: ${e.text}`, sub: `${c.uid} in ${c.ownerUnit}`, at: e.at, to: `/cases/${c.id}`, action: 'Open' })
      }
    }
    items.sort((a, b) => b.at.localeCompare(a.at))
    const tabs = (['needs_you', 'auto', 'replies', 'imports', 'watching'] as const).map((t) => ({ tab: t, count: items.filter((i) => i.tab === t).length }))
    return latency({ items, tabs })
  },

  // ---------- Cases ----------
  cases: (f: CaseFilters) => {
    let list = filterCases(cases, f, insts, UNITS, TODAY)
    const sort = f.sort ?? '-receivedOn'
    if (sort === 'due') {
      // Most urgent first: the least time left on the clock, closed cases last.
      const left = (c: Case) => { const d = deadlineFor(c, TODAY); return d.state === 'closed' ? 1e6 : d.daysToDue }
      list = [...list].sort((a, b) => left(a) - left(b))
    } else {
      const key = sort.replace('-', '') as 'receivedOn' | 'uid'
      const dir = sort.startsWith('-') ? -1 : 1
      list = [...list].sort((a, b) => (a[key] < b[key] ? -dir : a[key] > b[key] ? dir : 0))
    }
    const page = f.page ?? 1
    const size = Math.max(1, Math.min(200, f.size ?? PAGE))
    return latency({
      total: list.length, page, pageSize: size,
      items: list.slice((page - 1) * size, page * size).map((c) => ({ ...strip(c), deadline: deadlineFor(c, TODAY), institution: instOf(c.institutionId), proof: proofFor(c) })),
    })
  },

  exportCases: async (f: CaseFilters, user: DemoUser) => {
    const list = filterCases(cases, f, insts, UNITS, TODAY)
    const rows = [['Case', 'Unit', 'Institution', 'Permanent ID', 'Category', 'Received', 'Stage', 'Timeline']]
    for (const c of list) {
      const d = deadlineFor(c, TODAY)
      rows.push([c.uid, c.ownerUnit, instOf(c.institutionId)?.name ?? c.recorded.name, instOf(c.institutionId)?.permanentId ?? '', categoryLabel(c.category), c.receivedOn, STAGE_LABEL[c.lifecycle], d.state === 'closed' ? 'Closed' : d.state === 'overdue' ? `${-d.daysToDue} days overdue` : `${d.daysToDue} days left`])
    }
    const ref = writeAudit(who(user), 'Report exported', 'case list', `${list.length} cases`)
    return latency(exportText('Case list', rows, user, ref))
  },

  case: async (id: string, user?: DemoUser) => {
    const c = caseOf(id)
    const linkedDecisions = decisions
      .filter((d) => d.decision === 'related' || d.decision === 'duplicate' || d.decision === 'designate_lead_unit')
      .map((d) => ({ d, a: allKnownAlerts.find((a) => a.id === d.alertId) }))
      .filter((x) => x.a?.caseIds.includes(id))
    const linked = linkedDecisions.flatMap(({ d, a }) => a!.caseIds.filter((x) => x !== id).map((rid) => {
      const r = caseOf(rid)
      return { id: r.id, uid: r.uid, ownerUnit: r.ownerUnit, localStatus: r.localStatus, how: d.decision, lead: d.leadUnit }
    }))
    const dl = deadlineFor(c, TODAY)
    const rs = replies.filter((r) => r.caseId === id)
    const caseDecisions = alertInfoFor(id).flatMap((a) => historyOf(a.id))
    return latency({
      ...strip(c),
      deadline: dl,
      escalation: escalationFor(dl),
      institution: instOf(c.institutionId),
      lanes: c.institutionId ? lanesFor(c.institutionId) : [],
      linked,
      proof: proofFor(c),
      replies: rs,
      closureChecks: closureChecks(c, rs, caseDecisions),
      canAct: user ? canActOnCase(user, c) : false,
      alertsForCase: alerts().filter((a) => a.caseIds.includes(id)).map((a) => ({ id: a.id, severity: a.severity, rules: a.rules.map((r) => r.code), decided: settled(a.id) })),
      units: UNITS.map((u) => u.code).filter((u) => u !== c.ownerUnit),
    })
  },

  // Restricted: owning unit's officers only. Every view is written to the audit log.
  sensitive: async (id: string, user: DemoUser) => {
    const c = caseOf(id)
    const ok = (user.role === 'dealing_officer' || user.role === 'nodal_officer') && user.unit === c.ownerUnit
    if (!ok) throw new ApiError('forbidden', `Only officers of ${c.ownerUnit} can see who filed this complaint.`)
    const ref = writeAudit(who(user), 'Complainant details viewed', c.uid, 'Restricted details opened')
    return latency({ ...c.sensitive, auditRef: ref })
  },

  assignToMe: async (id: string, user: DemoUser) => {
    const c = caseOf(id)
    if (!canActOnCase(user, c)) throw new ApiError('forbidden', `Only officers of ${c.ownerUnit} can pick up this case.`)
    c.officer = user.name
    c.events.push({ type: 'action_recorded', at: TODAY, actor: who(user), text: `Picked up by ${user.name}`, auditRef: writeAudit(who(user), 'Action recorded', c.uid, 'Picked up the case') })
    return latency(true)
  },

  recordAction: async (id: string, input: { text: string; next: string }, user: DemoUser) => {
    const c = caseOf(id)
    if (!canActOnCase(user, c)) throw new ApiError('forbidden', `Only officers of ${c.ownerUnit} can record actions on this case.`)
    if (!input.text.trim()) throw new ApiError('validation_error', 'Say what was done.')
    c.lastAction = input.text.trim(); c.lastActionOn = TODAY
    if (input.next.trim()) c.nextAction = input.next.trim()
    c.events.push({ type: 'action_recorded', at: TODAY, actor: who(user), text: input.text.trim(), auditRef: writeAudit(who(user), 'Action recorded', c.uid, input.text.trim()) })
    return latency(true)
  },

  changeStage: async (id: string, input: { stage: Lifecycle; reason: string }, user: DemoUser) => {
    const c = caseOf(id)
    if (!canActOnCase(user, c)) throw new ApiError('forbidden', `Only officers of ${c.ownerUnit} can change this case.`)
    if (input.stage === 'disposed' || input.stage === 'transferred') throw new ApiError('validation_error', 'Use Close or Transfer for that.')
    if (!input.reason.trim()) throw new ApiError('validation_error', 'Add a reason.')
    const from = c.lifecycle
    c.lifecycle = input.stage; c.localStatus = localStatusFor(c.ownerUnit, input.stage); c.lastAction = `Moved to “${STAGE_LABEL[input.stage]}”`; c.lastActionOn = TODAY
    c.events.push({ type: 'status_changed', at: TODAY, actor: who(user), text: `${STAGE_LABEL[from]} → ${STAGE_LABEL[input.stage]}: ${input.reason.trim()}`, auditRef: writeAudit(who(user), 'Stage changed', c.uid, `${STAGE_LABEL[from]} → ${STAGE_LABEL[input.stage]}${wentAheadNote(c, 'stage', input.stage)}`) })
    return latency(true)
  },

  transfer: async (id: string, input: { to: string; reason: string }, user: DemoUser) => {
    const c = caseOf(id)
    if (!canActOnCase(user, c)) throw new ApiError('forbidden', `Only officers of ${c.ownerUnit} can transfer this case.`)
    if (!input.to || input.to === c.ownerUnit) throw new ApiError('validation_error', 'Choose the unit to send it to.')
    if (!input.reason.trim()) throw new ApiError('validation_error', 'Add a reason.')
    c.lifecycle = 'transferred'; c.localStatus = localStatusFor(c.ownerUnit, 'transferred'); c.lastAction = `Transferred to ${input.to}`; c.lastActionOn = TODAY; c.nextAction = '—'
    c.events.push({ type: 'transferred', at: TODAY, actor: who(user), text: `Transferred to ${input.to}: ${input.reason.trim()}`, auditRef: writeAudit(who(user), 'Case transferred', c.uid, `to ${input.to}${wentAheadNote(c, 'transfer')}`) })
    return latency(true)
  },

  dispose: async (id: string, input: { type: DisposalType; reason: string }, user: DemoUser) => {
    const c = caseOf(id)
    if (!canActOnCase(user, c)) throw new ApiError('forbidden', `Only officers of ${c.ownerUnit} can close this case.`)
    if (!input.reason.trim()) throw new ApiError('validation_error', 'Say why the case is being closed.')
    c.lifecycle = 'disposed'; c.disposalType = input.type; c.localStatus = localStatusFor(c.ownerUnit, 'disposed'); c.lastAction = `Closed: ${DISPOSAL_LABEL[input.type]}`; c.lastActionOn = TODAY; c.nextAction = '—'
    c.events.push({ type: 'disposed', at: TODAY, actor: who(user), text: `Closed (${DISPOSAL_LABEL[input.type]}): ${input.reason.trim()}`, auditRef: writeAudit(who(user), 'Case closed', c.uid, `${DISPOSAL_LABEL[input.type]}${wentAheadNote(c, 'close')}`) })
    return latency(true)
  },

  // ---------- Replies from institutions (one-time link) ----------
  requestReply: async (id: string, input: { askedFor: string; dueOn: string }, user: DemoUser) => {
    const c = caseOf(id)
    if (!canActOnCase(user, c)) throw new ApiError('forbidden', `Only officers of ${c.ownerUnit} can ask for a reply.`)
    if (!c.institutionId) throw new ApiError('validation_error', 'Match the institution first, so the link goes to the right place.')
    if (!input.askedFor.trim()) throw new ApiError('validation_error', 'Say what the institution should send.')
    if (!input.dueOn || input.dueOn < TODAY) throw new ApiError('validation_error', 'Choose a due date from today onwards.')
    const r: ReplyRequest = { id: `r${replies.length + 1}`, token: `${c.uid.slice(-4)}-${Math.random().toString(36).slice(2, 8)}`, caseId: c.id, institutionId: c.institutionId, askedFor: input.askedFor.trim(), dueOn: input.dueOn, createdBy: who(user), createdAt: TODAY, state: 'waiting' }
    replies.push(r)
    c.events.push({ type: 'reply_requested', at: TODAY, actor: who(user), text: `Asked the institution for: ${r.askedFor}`, auditRef: writeAudit(who(user), 'Reply asked for', c.uid, `due ${r.dueOn}`) })
    return latency(r)
  },

  /** What the institution sees on the reply page: only this one request, nothing else. */
  replyInfo: async (token: string) => {
    const r = replies.find((x) => x.token === token)
    if (!r) throw new ApiError('not_found', 'This link is not valid. Please check the link in the letter or email you received.')
    const c = caseOf(r.caseId)
    return latency({ caseRef: c.uid, unit: UNITS.find((u) => u.code === c.ownerUnit)?.name ?? c.ownerUnit, institution: instOf(r.institutionId)!.name, askedFor: r.askedFor, dueOn: r.dueOn, state: r.state, receivedAt: r.submission?.at ?? null, files: r.submission?.files.map((f) => f.name) ?? [] })
  },

  submitReply: async (token: string, input: { note: string; files: Omit<CaseDocument, 'from' | 'at'>[] }) => {
    const r = replies.find((x) => x.token === token)
    if (!r) throw new ApiError('not_found', 'This link is not valid.')
    if (r.state === 'received') throw new ApiError('conflict', 'A reply has already been sent with this link. Contact the AICTE unit if you need to add something.')
    if (!input.files.length && !input.note.trim()) throw new ApiError('validation_error', 'Attach at least one document or write a reply.')
    const c = caseOf(r.caseId)
    const at = nowAt()
    const files: CaseDocument[] = input.files.map((f) => ({ ...f, from: 'institution', at }))
    // The same file sent for another case is worth a look (it is not proof of anything by itself).
    const sameFileElsewhere = [...new Set(files.flatMap((f) => cases.filter((x) => x.id !== c.id && x.documents?.some((d) => d.sha256 === f.sha256)).map((x) => x.uid)))]
    r.state = 'received'
    r.submission = { at, note: input.note.trim(), files, late: TODAY > r.dueOn, sameFileElsewhere }
    c.documents = [...(c.documents ?? []), ...files]
    const ref = writeAudit(`${instOf(r.institutionId)!.name} (reply link)`, 'Reply received', c.uid, `${plural(files.length, 'file')}`)
    c.events.push({ type: 'reply_received', at: TODAY, actor: 'Institution', text: `Reply received with ${plural(files.length, 'document')}${r.submission.late ? ' (after the due date)' : ''}`, auditRef: ref })
    return latency({ receipt: `RPL-${c.uid.slice(-6)}-${audit.length}`, at, files: files.map((f) => ({ name: f.name, sha256: f.sha256 })) })
  },

  // ---------- Add a case ----------
  /** "Already known?": shown live while an officer types a new case. Nothing is saved. */
  checkNewCase: async (d: { permanentId?: string; currentId?: string; name?: string; district?: string; complaintRef?: string }) => {
    const rec = { name: d.name ?? '', district: d.district || undefined, permanentId: d.permanentId || undefined, currentId: d.currentId || undefined }
    const res = rec.name || rec.permanentId || rec.currentId ? resolveInstitution(rec, insts) : null
    const inst = res?.institutionId ? instOf(res.institutionId) : null
    const ref = d.complaintRef?.trim()
    return latency({
      institution: inst,
      method: res?.method ?? null,
      suggestions: inst ? [] : (res?.suggestions ?? []).map((s) => ({ ...s, institution: instOf(s.institutionId)! })),
      openElsewhere: inst ? cases.filter((c) => c.institutionId === inst.id && isActive(c)).map((c) => ({ id: c.id, uid: c.uid, unit: c.ownerUnit, stage: c.lifecycle, category: c.category })) : [],
      sameRef: ref ? cases.filter((c) => c.sourceComplaintRef && normaliseId(c.sourceComplaintRef) === normaliseId(ref)).map((c) => ({ id: c.id, uid: c.uid, unit: c.ownerUnit, stage: c.lifecycle })) : [],
    })
  },

  createCase: async (d: Draft, user: DemoUser) => {
    if (!user.unit || !(user.role === 'dealing_officer' || user.role === 'nodal_officer')) throw new ApiError('forbidden', 'Only officers of a unit can add cases for that unit.')
    if (!d.recorded.name.trim() && !d.recorded.permanentId) throw new ApiError('validation_error', 'Give the institution’s name or Permanent ID.')
    if (!d.receivedOn || d.receivedOn > TODAY) throw new ApiError('validation_error', 'The received date cannot be in the future.')
    return latency(arrival({ ...d, unit: user.unit }, who(user), 'form'))
  },

  // ---------- Imports ----------
  /** Book (or clear) the next dated step of a case. It appears on the calendar and in the clash checks. Same rules as the server. */
  schedule: async (id: string, input: { on: string | null; what: string }, user: DemoUser) => {
    const c = caseOf(id)
    if (!canActOnCase(user, c)) throw new ApiError('forbidden', `Only officers of ${c.ownerUnit} can book a date on this case.`)
    if (!isOpen(c) || c.lifecycle === 'transferred') throw new ApiError('validation_error', 'This case is closed or transferred, so no date can be booked.')
    if (!input.on) {
      c.scheduled = undefined
      c.events.push({ type: 'action_recorded', at: TODAY, actor: who(user), text: 'Booked date removed', auditRef: writeAudit(who(user), 'Date cleared', c.uid, 'The booked date was removed') })
      return latency(true)
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.on) || isNaN(new Date(input.on + 'T00:00:00').getTime())) throw new ApiError('validation_error', 'Write the date as YYYY-MM-DD.')
    if (input.on < TODAY) throw new ApiError('validation_error', 'The date has already passed. Choose today or a later date.')
    const what = input.what.trim()
    if (!what || what.length > 80) throw new ApiError('validation_error', 'Say what happens on that date, in under 80 characters.')
    c.scheduled = { on: input.on, what }
    c.nextAction = `${what} on ${fmtShortDate(input.on)}`
    c.events.push({ type: 'action_recorded', at: TODAY, actor: who(user), text: `Booked: ${what} on ${fmtShortDate(input.on)}`, auditRef: writeAudit(who(user), 'Date booked', c.uid, `${what} on ${input.on}`) })
    return latency(true)
  },

  importCheck: async (unit: string, rows: ImportRow[]) => {
    const existingRefs = new Set(cases.filter((c) => c.sourceUnit === unit).map((c) => c.sourceRef))
    const mapStatus = (w: string) => statusMap[unit]?.[w.trim().toLowerCase()]
    const checked = annotateRows(unit, rows.map((r, i) => checkRow(r, i + 2, { today: TODAY, existingRefs, mapStatus })))
    const unknownStatuses = [...new Set(rows.map((r) => r.local_status?.trim()).filter((w): w is string => !!w && !mapStatus(w)))]
    return latency({ rows: checked, unknownStatuses })
  },

  saveStatusMeaning: async (unit: string, word: string, stage: Lifecycle, user: DemoUser) => {
    statusMap[unit] = { ...(statusMap[unit] ?? {}), [word.trim().toLowerCase()]: stage }
    writeAudit(who(user), 'Status meaning saved', unit, `“${word}” means ${STAGE_LABEL[stage]}`)
    return latency(true)
  },

  importCommit: async (unit: string, fileName: string, rows: ImportRow[], user: DemoUser) => {
    const existing = new Map(cases.filter((c) => c.sourceUnit === unit).map((c) => [c.sourceRef, c]))
    const mapStatus = (w: string) => statusMap[unit]?.[w.trim().toLowerCase()]
    const before = new Set(alerts().map((a) => a.id))
    const b: ImportBatch = { id: `b${213 + imports.length - 4}`, unit, fileName, by: who(user), at: nowAt(), rows: rows.length, created: 0, updated: 0, rejected: 0, rejects: [], autoMatched: 0, namesToCheck: 0, newOverlaps: 0, caseIds: [] }
    const checkedRows = annotateRows(unit, rows.map((r, i) => checkRow(r, i + 2, { today: TODAY, existingRefs: new Set(existing.keys()), mapStatus })))
    rows.forEach((r, i) => {
      const chk = checkedRows[i]
      if (chk.outcome === 'reject') { b.rejected++; b.rejects.push(...chk.problems); return }
      const stage = mapStatus(r.local_status)!
      if (chk.outcome === 'update') {
        const c = existing.get(r.source_reference)!
        c.localStatus = r.local_status; if (c.lifecycle !== stage) { c.events.push({ type: 'status_changed', at: TODAY, actor: who(user), text: `Updated by import: ${STAGE_LABEL[c.lifecycle]} → ${STAGE_LABEL[stage]}` }); c.lifecycle = stage }
        if (r.summary) c.summary = r.summary
        if (r.next_step_on?.trim()) c.scheduled = { on: r.next_step_on.trim(), what: r.next_step.trim() }
        b.updated++; b.caseIds.push(c.id); return
      }
      const res = arrival({
        unit, channel: r.channel.toUpperCase() as Channel, sourceRef: r.source_reference, complaintRef: r.complaint_ref, category: r.category, summary: r.summary, receivedOn: r.received_on,
        localStatus: r.local_status, lifecycle: stage, recorded: { name: r.institution_name, permanentId: r.permanent_id || undefined, currentId: r.current_id || undefined },
        scheduled: r.next_step_on?.trim() ? { on: r.next_step_on.trim(), what: r.next_step.trim() } : undefined,
      }, who(user), 'import')
      b.created++; b.caseIds.push(res.caseId)
      if (res.matched) b.autoMatched++; else b.namesToCheck++
    })
    b.newOverlaps = alerts().filter((a) => !before.has(a.id)).length
    imports.unshift(b)
    writeAudit(who(user), 'Import finished', fileName, `${b.rows} rows: ${b.created} new, ${b.updated} updated, ${b.rejected} not saved`)
    return latency(b)
  },

  imports: () => latency(imports),
  importBatch: async (id: string) => {
    const b = imports.find((x) => x.id === id)
    if (!b) throw new ApiError('not_found', 'This import receipt could not be found.')
    return latency({ ...b, cases: b.caseIds.map((cid) => { const c = caseOf(cid); return { id: c.id, uid: c.uid, institution: instOf(c.institutionId)?.name ?? `“${c.recorded.name}”`, matched: !!c.institutionId } }) })
  },

  // ---------- Deadlines ----------
  deadlines: (user: DemoUser, unit?: string) => {
    const scopeUnit = unit ?? user.unit
    const open = cases.filter((c) => isOpen(c) && (!scopeUnit || c.ownerUnit === scopeUnit))
    const rows = open.map((c) => {
      const d = deadlineFor(c, TODAY)
      return { id: c.id, uid: c.uid, unit: c.ownerUnit, institution: instOf(c.institutionId)?.name ?? `“${c.recorded.name}”`, stage: c.lifecycle, deadline: d, escalation: escalationFor(d), officer: c.officer ?? null, stageSince: stageSince(c), channel: c.channel, institutionId: c.institutionId, permanentId: instOf(c.institutionId)?.permanentId ?? null, nextAction: c.nextAction, category: c.category }
    }).filter((r) => r.deadline.state !== 'closed')
    const strip = Array.from({ length: 30 }, (_, i) => { const date = addDays(TODAY, i); return { date, count: rows.filter((r) => r.deadline.dueOn === date).length } })
    return latency({
      unit: scopeUnit ?? null,
      overdue: rows.filter((r) => r.deadline.state === 'overdue').sort((a, b) => a.deadline.daysToDue - b.deadline.daysToDue),
      thisWeek: rows.filter((r) => r.deadline.state !== 'overdue' && r.deadline.daysToDue <= 7).sort((a, b) => a.deadline.daysToDue - b.deadline.daysToDue),
      interim: rows.filter((r) => r.deadline.interimDue),
      raised: rows.filter((r) => r.escalation.level > 0).sort((a, b) => b.escalation.late - a.escalation.late),
      all: rows,
      strip,
    })
  },

  // ---------- Institutions ----------
  institutions: (f: { q?: string; region?: string; type?: string; only?: 'overlap' | 'open' }) => {
    const q = f.q?.trim().toLowerCase()
    const live = alerts()
    const rows = insts.map((i) => {
      const list = cases.filter((c) => c.institutionId === i.id)
      const active = list.filter(isActive)
      return { id: i.id, name: i.name, permanentId: i.permanentId, district: i.district, state: i.state, region: i.region, type: i.type, total: list.length, open: active.length, units: [...new Set(active.map((c) => c.ownerUnit))], overlap: live.some((a) => a.institutionId === i.id && !settled(a.id)),
        overlapNote: ((a) => (a ? overlapNote(a.caseIds.map(caseOf)) : null))(live.find((x) => x.institutionId === i.id && !settled(x.id))),
        next: ((acts) => { const n = nextStep(acts, TODAY); return n ? { date: n.date, unit: n.unit, what: n.what } : null })(datedActions(active.map((c) => ({ id: c.id, uid: c.uid, unit: c.ownerUnit, channel: c.channel, receivedOn: c.receivedOn, lifecycle: c.lifecycle, scheduled: c.scheduled, deadline: deadlineFor(c, TODAY) })), TODAY)) }
    }).filter((r) => (!q || `${r.name} ${r.permanentId} ${r.district}`.toLowerCase().includes(q)) && (!f.region || r.region === f.region) && (!f.type || r.type === f.type)
      && (f.only !== 'overlap' || r.overlap) && (f.only !== 'open' || r.open > 0))
      .sort((a, b) => Number(b.overlap) - Number(a.overlap) || b.open - a.open || a.name.localeCompare(b.name))
    return latency({ rows, types: [...new Set(insts.map((i) => i.type))].sort() })
  },

  institution: async (id: string, user?: DemoUser) => {
    const i = instOf(id)
    if (!i) throw new ApiError('not_found', 'No institution with this ID.')
    const list = cases.filter((c) => c.institutionId === id)
    const live = alerts().filter((a) => a.institutionId === id); live.forEach(remember)
    const known = allKnownAlerts.filter((a) => a.institutionId === id)
    return latency({
      ...i,
      cases: list.map((c) => ({ ...strip(c), deadline: deadlineFor(c, TODAY) })).sort((a, b) => (a.receivedOn < b.receivedOn ? 1 : -1)),
      lanes: lanesFor(id),
      alerts: known.filter((a) => live.some((l) => l.id === a.id) || settled(a.id)).map((a) => ({ id: a.id, severity: a.severity, rules: a.rules.map((r) => r.code), decided: settled(a.id), decision: latestDecision(a.id) })),
      openUnits: [...new Set(list.filter(isActive).map((c) => c.ownerUnit))],
      issue: mainIssue(list.filter(isActive))?.label ?? null,
      stories: live.map((a) => ({ id: a.id, story: overlapStory(a.caseIds.map(caseOf)), decided: settled(a.id) })),
      replies: replies.filter((r) => r.institutionId === id).map((r) => ({ ...r, caseUid: caseOf(r.caseId).uid })),
      watchers: watches.filter((w) => w.institutionId === id).map((w) => DEMO_USERS.find((u) => u.id === w.userId)?.name ?? w.userId),
      watching: !!user && watches.some((w) => w.institutionId === id && w.userId === user.id),
    })
  },

  toggleWatch: async (id: string, user: DemoUser) => {
    const on = watches.some((w) => w.institutionId === id && w.userId === user.id)
    watches = on ? watches.filter((w) => !(w.institutionId === id && w.userId === user.id)) : [...watches, { userId: user.id, institutionId: id, since: TODAY }]
    writeAudit(who(user), on ? 'Stopped watching' : 'Started watching', instOf(id)?.name ?? id, '')
    return latency(!on)
  },

  // ---------- Overlaps ----------
  overlaps: () => {
    const list = alerts()
    list.forEach(remember)
    const enrich = (a: OverlapAlert) => ({
      ...a,
      institution: instOf(a.institutionId)!,
      units: unitsOf(a),
      decision: settled(a.id) ? latestDecision(a.id) : null,
      lastNote: latestDecision(a.id),
      earlierDecision: earlierDecision(a),
      state: boardState(a),
      dueOn: addDays(sinceOf(a), SETTINGS.coordDueDays),
      lanes: lanesFor(a.institutionId),
      cases: a.caseIds.map((id) => {
        const c = caseOf(id)
        return { id: c.id, uid: c.uid, unit: c.ownerUnit, lifecycle: c.lifecycle, category: c.category, receivedOn: c.receivedOn, officer: c.officer ?? null, deadline: deadlineFor(c, TODAY), channel: c.channel, nextAction: c.nextAction, scheduled: c.scheduled ?? null }
      }),
      deciders: decidersFor(unitsOf(a)),
      since: sinceOf(a),
      story: overlapStory(a.caseIds.map(caseOf)),
      issue: mainIssue(a.caseIds.map(caseOf))?.label ?? null,
    })
    // Decided overlaps stay listed even after a new case joins and the live alert changes.
    const decidedIds = [...new Set(decisions.filter((d) => settled(d.alertId)).map((d) => d.alertId))]
    const decided = decidedIds.map((id) => allKnownAlerts.find((a) => a.id === id)).filter((a): a is OverlapAlert => !!a)
    const done = decisions.filter((d) => d.decision !== 'request_further_review')
    const medianHours = (() => {
      const hrs = done.map((d) => { const a = allKnownAlerts.find((x) => x.id === d.alertId); return a ? Math.max(0, daysBetween(sinceOf(a), d.at.slice(0, 10))) * 24 : null }).filter((x): x is number => x !== null).sort((x, y) => x - y)
      return hrs.length ? hrs[Math.floor(hrs.length / 2)] : null
    })()
    // One or two decisions say nothing about the usual time, so it is shown only from three decisions.
    return latency({ decisionsCount: done.length, open: list.filter((a) => !settled(a.id)).map(enrich), decided: decided.map(enrich).reverse(), medianDaysToDecide: medianHours === null || done.length < 3 ? null : Math.round(medianHours / 24) })
  },

  overlap: async (id: string, user?: DemoUser) => {
    const a = alerts().find((x) => x.id === id) ?? allKnownAlerts.find((x) => x.id === id)
    if (!a) throw new ApiError('not_found', 'This overlap is no longer open. A case may have changed since you opened it.')
    remember(a)
    if (user && canDecide(user, unitsOf(a))) seen.add(a.id)
    const cs = a.caseIds.map((cid) => { const c = caseOf(cid); return { ...strip(c), deadline: deadlineFor(c, TODAY) } })
    // One timeline of everything that happened to these cases, newest first, labelled by unit.
    const merged = cs.flatMap((c) => c.events.map((e) => ({ ...e, unit: c.ownerUnit, uid: c.uid }))).sort((x, y) => y.at.localeCompare(x.at))
    return latency({
      ...a,
      institution: instOf(a.institutionId)!,
      lanes: lanesFor(a.institutionId),
      cases: cs,
      merged,
      units: unitsOf(a),
      state: boardState(a),
      since: sinceOf(a),
      dueOn: addDays(sinceOf(a), SETTINGS.coordDueDays),
      decision: settled(a.id) ? latestDecision(a.id) : null,
      history: historyOf(a.id),
      earlierDecision: earlierDecision(a),
      story: overlapStory(cs),
      issue: mainIssue(cs)?.label ?? null,
      sharedIssues: sharedIssues(cs),
    })
  },

  decide: async (input: { alertId: string; decision: DecisionType; reason: string; leadUnit?: string; followUp?: Decision['followUp']; user: DemoUser }) => {
    const a = alerts().find((x) => x.id === input.alertId)
    if (!a) throw new ApiError('not_found', 'This overlap is no longer open.')
    const involved = unitsOf(a)
    if (!canDecide(input.user, involved)) throw new ApiError('forbidden', `Only a coordinator or a nodal officer of ${involved.join(' or ')} can record this decision.`)
    if (input.decision !== 'related' && !input.reason.trim()) throw new ApiError('validation_error', 'Add a reason. It is required for this decision.')
    if (input.decision === 'designate_lead_unit' && (!input.leadUnit || !involved.includes(input.leadUnit)))
      throw new ApiError('validation_error', 'Choose a lead unit from the units involved.')
    if (settled(a.id)) throw new ApiError('conflict', 'A decision is already recorded for this overlap.')
    const by = who(input.user)
    const ref = writeAudit(by, 'Decision recorded', instOf(a.institutionId)!.name, `${DECISION_LABEL[input.decision]}${input.leadUnit ? `, ${input.leadUnit} leads` : ''} (chosen by the officer)`)
    const d: Decision = { alertId: a.id, decision: input.decision, reason: input.reason.trim(), leadUnit: input.leadUnit, by, at: new Date().toISOString(), followUp: input.followUp }
    decisions.push(d)
    remember(a)
    // Decisions never change ownership or stage — they only add a timeline entry on each case.
    for (const id of a.caseIds) {
      caseOf(id).events.push({ type: 'linked', at: TODAY, actor: by, text: `Coordination: ${DECISION_LABEL[input.decision]}${input.leadUnit ? ` (${input.leadUnit} leads)` : ''}`, auditRef: ref })
    }
    return latency({ ...d, auditRef: ref })
  },

  // ---------- Name check ----------
  matchingQueue: () => {
    const q = cases.filter((c) => c.matchState === 'pending_review' || c.matchState === 'unresolved')
    return latency(q.map((c) => ({
      ...strip(c),
      suggestions: (c.matchState === 'unresolved' ? [] : suggestionsFor(c, insts, rejectedSuggestions[c.id])).map((s: MatchSuggestion) => {
        const inst = instOf(s.institutionId)!
        return { ...s, institution: inst, check: compareFields(c.recorded, inst) }
      }),
    })))
  },
  acceptMatch: async (caseId: string, institutionId: string, user: DemoUser) => {
    if (!canConfirmMatch(user)) throw new ApiError('forbidden', 'Only a coordinator or data steward can confirm an institution.')
    const c = caseOf(caseId)
    const i = instOf(institutionId)!
    const s = suggestionsFor(c, insts, rejectedSuggestions[c.id]).find((x) => x.institutionId === institutionId)
    c.institutionId = institutionId
    c.matchState = 'resolved_confirmed'
    c.matchMethod = 'T4_confirmed'
    c.matchEvidence = [...(s?.evidence ?? []), `Confirmed by ${user.name}`, 'The recorded name is now remembered, so it will match automatically next time']
    i.identifiers.push({ type: 'confirmed_alias', value: c.recorded.name, verified: true })
    c.events.push({ type: 'match_resolved', at: TODAY, actor: who(user), text: `Institution confirmed: ${i.name}`, auditRef: writeAudit(who(user), 'Institution confirmed', c.uid, i.name) })
    return latency({ uid: c.uid, institution: i.name, alias: c.recorded.name })
  },
  rejectMatch: async (caseId: string, institutionId: string, user: DemoUser) => {
    if (!canConfirmMatch(user)) throw new ApiError('forbidden', 'Only a coordinator or data steward can rule out a suggestion.')
    rejectedSuggestions[caseId] = [...(rejectedSuggestions[caseId] ?? []), institutionId]
    writeAudit(who(user), 'Suggestion ruled out', caseOf(caseId).uid, instOf(institutionId)?.name ?? institutionId)
    return latency(true)
  },
  markUnresolved: async (caseId: string, reason: string, user: DemoUser) => {
    if (!canConfirmMatch(user)) throw new ApiError('forbidden', 'Only a coordinator or data steward can do this.')
    if (!reason.trim()) throw new ApiError('validation_error', 'Add a reason.')
    const c = caseOf(caseId)
    c.matchState = 'unresolved'
    c.events.push({ type: 'match_resolved', at: TODAY, actor: who(user), text: `Left unmatched: ${reason}`, auditRef: writeAudit(who(user), 'Left unmatched', c.uid, reason) })
    return latency(true)
  },

  // ---------- Reports ----------
  report: (input: { type: ReportType; period: 'monthly' | 'quarterly'; unit?: string; region?: string }) => latency(buildReport(input)),
  exportReport: async (input: { type: ReportType; period: 'monthly' | 'quarterly'; unit?: string; region?: string }, user: DemoUser) => {
    const r = buildReport(input)
    const ref = writeAudit(who(user), 'Report exported', r.title, `${input.period}${input.unit ? `, ${input.unit}` : ''}${input.region ? `, ${input.region}` : ''}`)
    return latency(exportText(r.title, [r.columns, ...r.rows.map((row) => row.map(String))], user, ref))
  },

  // ---------- Data health ----------
  dataHealth: () => {
    const total = cases.length
    const withPid = cases.filter((c) => c.matchMethod === 'T1_exact' || !!c.recorded.permanentId).length
    const methods = [
      { key: 'T1', label: 'Permanent ID', count: cases.filter((c) => c.matchMethod === 'T1_exact').length },
      { key: 'T2', label: 'Another verified ID', count: cases.filter((c) => c.matchMethod === 'T2_crosswalk').length },
      { key: 'T4', label: 'Confirmed by a person', count: cases.filter((c) => c.matchMethod === 'T4_confirmed').length },
      { key: 'none', label: 'Not matched yet', count: cases.filter((c) => !c.institutionId).length },
    ]
    const rejects = imports.flatMap((b) => b.rejects.map((r) => ({ ...r, file: b.fileName, unit: b.unit, batch: b.id })))
    const byField = Object.entries(rejects.reduce<Record<string, number>>((m, r) => { m[r.field] = (m[r.field] ?? 0) + 1; return m }, {})).map(([field, count]) => ({ field, count })).sort((a, b) => b.count - a.count)
    const closures = cases.filter((c) => c.lifecycle === 'disposed').map((c) => ({ id: c.id, uid: c.uid, unit: c.ownerUnit, hints: closureChecks(c, replies.filter((r) => r.caseId === c.id), alertInfoFor(c.id).flatMap((a) => historyOf(a.id))) })).filter((x) => x.hints.length)
    return latency({
      total, pidPct: total ? Math.round((withPid / total) * 100) : 0, methods, rejects, byField, closures,
      unmappedWords: rejects.filter((r) => r.field === 'Status in your unit').map((r) => ({ unit: r.unit, text: r.problem })),
      sources: SOURCE_SYNC.map((x) => ({ unit: x.unit, hoursAgo: x.lastImportHoursAgo, stale: x.lastImportHoursAgo > SETTINGS.staleHours })),
      numbers: numbersCheck(),
    })
  },

  // ---------- Settings, users, audit ----------
  settings: () => latency(settingsView()),
  // Administrators only. Same checks and the same audit entry as the real backend.
  updateRules: async (input: { values: Record<string, number>; reason: string }, user: DemoUser) => {
    if (user.role !== 'admin') throw new ApiError('forbidden', 'Only an administrator can change settings.')
    if (!input.reason.trim()) throw new ApiError('validation_error', 'Say why the rule is changing.')
    const v = validateRules(input.values)
    if (!v.ok) throw new ApiError('validation_error', v.message)
    const changes = Object.entries(v.stored).filter(([key, val]) => val !== SETTINGS[key as RuleKey])
    if (!changes.length) throw new ApiError('validation_error', 'Nothing was changed.')
    const text = changes.map(([key, val]) => { const r = ruleByKey(key)!; return `${r.label}: ${display(r, SETTINGS[key as RuleKey])} -> ${display(r, val as number)}` }).join('; ')
    applyRules({ ...SETTINGS, ...Object.fromEntries(changes) })
    writeAudit(who(user), 'Rule changed', 'settings', `${text}. Reason: ${input.reason.trim()}`)
    return latency(settingsView())
  },
  resetRules: async (input: { reason: string }, user: DemoUser) => {
    if (user.role !== 'admin') throw new ApiError('forbidden', 'Only an administrator can change settings.')
    if (!input.reason.trim()) throw new ApiError('validation_error', 'Say why the rules are being reset.')
    applyRules({})
    writeAudit(who(user), 'Rules reset', 'settings', `All editable rules went back to their defaults. Reason: ${input.reason.trim()}`)
    return latency(settingsView())
  },

  users: () => latency(DEMO_USERS),

  auditLog: (f: { q?: string; action?: string }) => {
    const q = f.q?.trim().toLowerCase()
    const rows = [...audit].reverse().filter((e) => (!f.action || e.action === f.action) && (!q || `${e.actor} ${e.entity} ${e.details}`.toLowerCase().includes(q)))
    return latency({ rows: rows.slice(0, 200), total: rows.length, actions: [...new Set(audit.map((e) => e.action))].sort(), check: verifyChain(audit) })
  },

  // ---------- Proof that the checks work: planted test cases ----------
  plantedTests: () => latency(plantedTests()),
}

export type ReportType = 'ageing' | 'disposal' | 'overlaps' | 'workload' | 'regions'
export const REPORTS: { type: ReportType; title: string; about: string }[] = [
  { type: 'workload', title: 'Unit workload', about: 'Cases in and out per unit, and what is still open' },
  { type: 'ageing', title: 'Age of open cases', about: 'How long open cases have been waiting, per unit' },
  { type: 'disposal', title: 'Disposals over time', about: 'Received, disposed and transferred per period' },
  { type: 'overlaps', title: 'Overlaps and decisions', about: 'What each overlap rule found, and what people decided' },
  { type: 'regions', title: 'Regions', about: 'Open and overdue cases by region' },
]

function periods(kind: 'monthly' | 'quarterly') {
  const t = new Date(TODAY + 'T00:00:00')
  const out: { label: string; from: string; to: string }[] = []
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  if (kind === 'monthly') for (let i = 5; i >= 0; i--) {
    const a = new Date(t.getFullYear(), t.getMonth() - i, 1), b = new Date(t.getFullYear(), t.getMonth() - i + 1, 0)
    out.push({ label: a.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }), from: iso(a), to: iso(b) })
  } else for (let i = 3; i >= 0; i--) {
    const q0 = Math.floor(t.getMonth() / 3) - i
    const a = new Date(t.getFullYear(), q0 * 3, 1), b = new Date(t.getFullYear(), q0 * 3 + 3, 0)
    out.push({ label: `Q${((q0 % 4) + 4) % 4 + 1} ${a.getFullYear()}`, from: iso(a), to: iso(b) })
  }
  return out
}

function buildReport(input: { type: ReportType; period: 'monthly' | 'quarterly'; unit?: string; region?: string }) {
  const scoped = filterCases(cases, { unit: input.unit, region: input.region }, insts, UNITS, TODAY)
  const meta = REPORTS.find((r) => r.type === input.type)!
  const active = scoped.filter(isActive)
  const ps = periods(input.period)
  const inP = (d: string, p: { from: string; to: string }) => d >= p.from && d <= p.to
  let columns: string[] = []
  let rows: (string | number)[][] = []
  let takeaway = ''
  if (input.type === 'workload') {
    const from = ps[0].from
    columns = ['Unit', 'Received', 'Disposed', 'Transferred', 'Open now', 'Overdue now', 'Disposal rate']
    const units = [...new Set(scoped.map((c) => c.ownerUnit))].sort()
    rows = units.map((u) => {
      const mine = scoped.filter((c) => c.ownerUnit === u)
      const disp = mine.filter((c) => c.lifecycle === 'disposed' && c.lastActionOn >= from).length
      const open = mine.filter(isActive).length
      return [u, mine.filter((c) => c.receivedOn >= from).length, disp, mine.filter((c) => c.lifecycle === 'transferred' && c.lastActionOn >= from).length, open, mine.filter((c) => isActive(c) && deadlineFor(c, TODAY).state === 'overdue').length, disp + open ? `${Math.round((disp / (disp + open)) * 100)}%` : '—']
    }).sort((a, b) => Number(b[4]) - Number(a[4]))
    takeaway = rows.length ? `${rows[0][0]} has the most open cases (${rows[0][4]}).` : 'No cases in this selection.'
  } else if (input.type === 'ageing') {
    columns = ['Unit', ...AGEING.map((b) => b.label.replace(' d', ' days')), 'Open']
    const units = [...new Set(active.map((c) => c.ownerUnit))].sort()
    rows = units.map((u) => {
      const mine = active.filter((c) => c.ownerUnit === u)
      const b = AGEING.map((x, i) => { const lo = i === 0 ? -1 : AGEING[i - 1].max; return mine.filter((c) => { const a = daysBetween(c.receivedOn, TODAY); return a > lo && a <= x.max }).length })
      return [u, ...b, mine.length]
    })
    const old = active.filter((c) => daysBetween(c.receivedOn, TODAY) > 45).length
    takeaway = `${plural(old, 'open case')} ${old === 1 ? 'is' : 'are'} older than 45 days.`
  } else if (input.type === 'disposal') {
    columns = ['Period', 'Received', 'Disposed', 'Transferred (apart)', 'Disposal rate']
    rows = ps.map((p) => {
      const rec = scoped.filter((c) => inP(c.receivedOn, p)).length
      const disp = scoped.filter((c) => c.lifecycle === 'disposed' && inP(c.lastActionOn, p)).length
      const tr = scoped.filter((c) => c.lifecycle === 'transferred' && inP(c.lastActionOn, p)).length
      // Open at the end of the period: received by then and not closed by then.
      const openEnd = scoped.filter((c) => c.receivedOn <= p.to && !((c.lifecycle === 'disposed' || c.lifecycle === 'transferred') && c.lastActionOn <= p.to)).length
      return [p.label, rec, disp, tr, disp + openEnd ? `${Math.round((disp / (disp + openEnd)) * 100)}%` : '—']
    })
    const last = rows[rows.length - 1]
    takeaway = `In ${last[0]}: ${last[1]} received, ${last[2]} disposed. Transfers are shown apart, never as disposals.`
  } else if (input.type === 'overlaps') {
    columns = ['Rule', 'Found', 'Decided', 'Related', 'Same complaint', 'Not related', 'One unit leads', 'Waiting']
    const live = alerts()
    rows = rulePerformance(allKnownAlerts.length ? allKnownAlerts : live, decisions).map((r) => {
      const fired = (allKnownAlerts.length ? allKnownAlerts : live).filter((a) => a.rules.some((x) => x.code === r.code))
      const last = fired.map((a) => (settled(a.id) ? latestDecision(a.id)!.decision : null))
      return [`${r.code}: ${RULE_LABEL[r.code].short}`, r.fired, r.decided, last.filter((d) => d === 'related').length, last.filter((d) => d === 'duplicate').length, last.filter((d) => d === 'not_related').length, last.filter((d) => d === 'designate_lead_unit').length, last.filter((d) => d === null).length]
    })
    const waiting = live.filter((a) => !settled(a.id)).length
    takeaway = waiting ? `${plural(waiting, 'overlap')} still ${waiting === 1 ? 'waits' : 'wait'} for a decision.` : 'Every overlap found has a decision.'
  } else {
    columns = ['Region', 'Open', 'Overdue', 'Institutions with open cases', 'Overlaps waiting']
    const regions = [...new Set(insts.map((i) => i.region))].sort()
    const live = alerts()
    rows = regions.map((r) => {
      const mine = active.filter((c) => instOf(c.institutionId)?.region === r)
      return [r, mine.length, mine.filter((c) => deadlineFor(c, TODAY).state === 'overdue').length, new Set(mine.map((c) => c.institutionId)).size, live.filter((a) => instOf(a.institutionId)?.region === r && !settled(a.id)).length]
    }).filter((row) => !input.region || row[0] === input.region)
    const top = [...rows].sort((a, b) => Number(b[1]) - Number(a[1]))[0]
    takeaway = top ? `The ${top[0]} region has the most open cases (${top[1]}).` : 'No cases in this selection.'
  }
  return { ...meta, columns, rows, takeaway, period: input.period, periodNote: input.type === 'workload' ? `Since ${short(ps[0].from)}` : input.type === 'disposal' ? `${ps.length} ${input.period === 'monthly' ? 'months' : 'quarters'}` : `As of ${short(TODAY)}` }
}

function exportText(title: string, rows: (string | number)[][], user: DemoUser, ref: string) {
  const head = [
    [`# ${title}`],
    ['# Synthetic prototype data. Not real AICTE figures.'],
    [`# Exported by ${who(user)} on ${nowAt().replace('T', ' at ')}. Audit entry ${ref}.`],
    ['# Complainant names and complaint text are never included.'],
  ]
  return { fileName: `ekatra-${title.toLowerCase().replace(/[^a-z]+/g, '-')}-${TODAY}.csv`, text: toCsv([...head, ...rows]), auditRef: ref }
}

/** Every dashboard number counted a second, independent way. Both must agree. */
function numbersCheck() {
  const live = alerts()
  const s = summarise(cases, live, decisions.filter((d) => settled(d.alertId)), insts, UNITS, TODAY)
  let open = 0, pending = 0, disposed = 0, transferred = 0, overdue = 0, unmatched = 0
  for (const c of cases) {
    switch (c.lifecycle) {
      case 'disposed': disposed++; break
      case 'transferred': transferred++; break
      default: open++; if (c.lifecycle === 'received') pending++
    }
    if (c.lifecycle !== 'disposed' && c.lifecycle !== 'transferred') {
      const age = daysBetween(c.receivedOn, TODAY)
      if (age > (c.channel === 'CPGRAMS' ? SETTINGS.cpgramsDays : SETTINGS.defaultDays)) overdue++
    }
    if (!c.institutionId) unmatched++
  }
  let waiting = 0
  for (const a of live) if (!settled(a.id)) waiting++
  const dashOpen = s.pending + s.underProcess + s.escalated
  return [
    { tile: 'Open now', shown: dashOpen, recount: open, how: 'Counted every case that is not disposed and not transferred' },
    { tile: 'New, not yet picked up', shown: s.pending, recount: pending, how: 'Counted cases in the “New” stage' },
    { tile: 'Past their timeline', shown: s.overdue, recount: overdue, how: 'Compared each open case’s age with its time limit' },
    { tile: 'Overlaps to decide', shown: s.overlapsAwaiting, recount: waiting, how: 'Counted possible overlaps with no final decision' },
    { tile: 'Names to check', shown: s.unresolvedMatches, recount: unmatched, how: 'Counted cases with no institution linked' },
    { tile: 'Disposed', shown: s.disposed, recount: disposed, how: 'Counted cases with a final action' },
    { tile: 'Transferred (apart)', shown: s.transferred, recount: transferred, how: 'Counted transferred cases separately' },
  ].map((r) => ({ ...r, ok: r.shown === r.recount }))
}

/** The difficult situations planted in the sample data, and whether Ekatra handled each one correctly. */
function plantedTests() {
  const base = structuredClone(CASES)
  const live = detectOverlaps(base, UNITS, TODAY)
  const inst = (n: string) => INSTITUTIONS.find((i) => i.name === n)!.id
  const rulesFor = (n: string) => live.filter((a) => a.institutionId === inst(n)).flatMap((a) => a.rules.map((r) => r.code))
  const hooghlyPid = INSTITUTIONS.find((i) => i.name === 'Hooghly Polytechnic')!.permanentId
  const decoy = resolveInstitution({ name: 'Malnad Polytechnic', district: 'Bengaluru' }, INSTITUTIONS)
  const spaced = resolveInstitution({ name: 'Hoogly Polytechnic', permanentId: ` ${hooghlyPid.replace('-', ' ')} ` }, INSTITUTIONS)
  const t2 = resolveInstitution({ name: 'Sahyadri Inst of Tech', currentId: '1 2201455' }, INSTITUTIONS)
  const none = resolveInstitution({ name: 'Wholly unknown Institute of Learning' }, INSTITUTIONS)
  const s = summarise(base, live, [], INSTITUTIONS, UNITS, TODAY)
  const rows = [
    { planted: 'The same CPGRAMS complaint number sent to PGRC and to RB-NWR (Aravali)', expected: 'Flag “same complaint number in two units”', happened: rulesFor('Aravali Institute of Management').includes('O5') ? 'Flagged for a person to confirm' : 'Not flagged', ok: rulesFor('Aravali Institute of Management').includes('O5') },
    { planted: 'A new PGRC grievance while RB-WR is in an inspection (Sahyadri)', expected: 'Flag “both units working on it” and “new case during a hearing”', happened: ['O1', 'O4'].every((r) => rulesFor('Sahyadri Institute of Technology').includes(r as 'O1')) ? 'Both flags raised' : 'Missed one or both', ok: ['O1', 'O4'].every((r) => rulesFor('Sahyadri Institute of Technology').includes(r as 'O1')) },
    { planted: 'The same kind of complaint in two units within six months (Gomti)', expected: 'Flag “same kind of complaint”', happened: rulesFor('Gomti College of Engineering').includes('O3') ? 'Flagged' : 'Not flagged', ok: rulesFor('Gomti College of Engineering').includes('O3') },
    { planted: 'Same institution, two different issues (Hooghly: a court case and a compliance check)', expected: 'Flag for a person, never mark as duplicate', happened: rulesFor('Hooghly Polytechnic').length && !rulesFor('Hooghly Polytechnic').includes('O5') ? 'Flagged as possible only' : 'Wrong', ok: rulesFor('Hooghly Polytechnic').length > 0 && !rulesFor('Hooghly Polytechnic').includes('O5') },
    { planted: 'Two look-alike names in the same city (Malnad Polytechnic College / Institute)', expected: 'Show choices to a person, link nothing', happened: !decoy.institutionId && decoy.suggestions.length >= 2 ? `${decoy.suggestions.length} choices shown, nothing linked` : 'Linked automatically', ok: !decoy.institutionId && decoy.suggestions.length >= 2 },
    { planted: 'A Permanent ID typed with spaces and a misspelt name', expected: 'Still find the institution by Permanent ID', happened: spaced.method === 'T1_exact' ? 'Found by Permanent ID' : 'Not found', ok: spaced.method === 'T1_exact' },
    { planted: 'Only a Current ID given, no Permanent ID', expected: 'Find it using the verified Current ID', happened: t2.method === 'T2_crosswalk' ? 'Found by Current ID' : 'Not found', ok: t2.method === 'T2_crosswalk' },
    { planted: 'A name that matches no institution', expected: 'Leave it unmatched for a person', happened: none.state === 'unresolved' ? 'Left unmatched' : 'Guessed a match', ok: none.state === 'unresolved' },
    { planted: 'Transferred cases in the data', expected: 'Never count them as disposed', happened: s.disposed === base.filter((c) => c.lifecycle === 'disposed').length ? 'Counted apart' : 'Mixed in', ok: s.disposed === base.filter((c) => c.lifecycle === 'disposed').length },
  ]
  return { rows, passed: rows.filter((r) => r.ok).length }
}
