// Proof: the pure functions that let every case, number and decision explain itself.
// Proof Trail stamps, closure checks, escalation level, rule performance, name checks and the audit chain.
import { CHANNEL_LABEL, DECISION_LABEL, DISPOSAL_LABEL, RULE_LABEL } from './labels'
import { SETTINGS, addDays, compareValues, daysBetween, deadlineFor, nameScore, nameVerdict, type Verdict } from './logic'
import type { AuditEvent, Case, Decision, DeadlineInfo, Evidence, Institution, OverlapAlert, ProofStage, ReplyRequest, RuleCode, RuleFire } from './types'

const short = (d: string) => new Date(d.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
/** "Anjali Rao, PGRC" -> "AR" */
export const initialsOf = (name: string) => name.split(',')[0].split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase()

/** Turn the matching engine's plain-text evidence into tagged evidence. */
export function tagEvidence(lines: string[]): Evidence[] {
  return lines.map((text) => ({
    text,
    source: /confirmed by/i.test(text) ? 'person' : /\bID\b|AISHE|identifier/i.test(text) ? 'id' : /name|similar/i.test(text) ? 'name' : /district|PIN/i.test(text) ? 'records' : 'records',
  }))
}

export interface CaseAlertInfo { id: string; rules: RuleFire[]; units: string[]; since: string; decision: Decision | null }
export interface ProofContext { today: string; institution: Institution | null; alerts: CaseAlertInfo[]; replies: ReplyRequest[]; auditRef?: (c: Case, type: string) => string | undefined }

/**
 * The six stamps for one case: Received, Institution found, Overlap check, Clock set, Units agreed, Closed.
 * Each stamp says what was checked, the evidence, the result, who did it, and the audit entry.
 */
export function proofTrail(c: Case, ctx: ProofContext): ProofStage[] {
  const ev = (t: string) => c.events.find((e) => e.type === t)
  const ref = (t: string) => ctx.auditRef?.(c, t)
  const created = ev('created') ?? ev('imported')
  const out: ProofStage[] = []

  // 1. Received
  out.push({
    key: 'received', title: 'Received', state: 'auto',
    detail: `${CHANNEL_LABEL[c.channel]}, ${short(c.receivedOn)}`,
    checked: 'The case arrived and its details were checked: required fields, dates, unit and category.',
    evidence: [
      { source: 'records', text: `Unit reference ${c.sourceRef}` },
      { source: 'timing', text: `Received ${short(c.receivedOn)}` },
      ...(c.sourceComplaintRef ? [{ source: 'ref' as const, text: `Complaint number ${c.sourceComplaintRef}` }] : []),
    ],
    result: `Registered as ${c.uid} in ${c.ownerUnit}.`,
    by: created?.actor === 'system' ? 'Automatic' : `Sent in by ${c.sourceUnit}`,
    at: c.receivedOn, auditRef: ref('created'),
  })

  // 2. Institution found
  const confirm = [...c.events].reverse().find((e) => e.type === 'match_resolved' && e.actor !== 'system')
  const evidence = tagEvidence(c.matchEvidence)
  const idCheck = 'Is this the same institution as one in the AICTE register? Checked by Permanent ID, then other verified IDs, then by name.'
  if (c.matchState === 'resolved_auto') {
    out.push({ key: 'identified', title: 'Institution found', state: 'auto', detail: c.matchMethod === 'T2_crosswalk' ? 'By another verified ID' : 'By Permanent ID',
      checked: idCheck, evidence, result: `Matched to ${ctx.institution?.name ?? 'the institution'} with no doubt, so no person was needed.`, by: 'Automatic', at: c.receivedOn, auditRef: ref('match_resolved') })
  } else if (c.matchState === 'resolved_confirmed') {
    out.push({ key: 'identified', title: 'Institution found', state: 'confirmed', detail: `Confirmed by ${confirm?.actor ?? 'a person'}`, initials: initialsOf(confirm?.actor ?? '?'),
      checked: idCheck, evidence: [...evidence], result: `${ctx.institution?.name ?? 'Institution'} confirmed by a person. The recorded name is now remembered.`, by: confirm?.actor ?? 'A person', at: confirm?.at, auditRef: ref('match_resolved') })
  } else if (c.matchState === 'pending_review') {
    out.push({ key: 'identified', title: 'Institution found', state: 'needs_person', detail: 'Only a name was given',
      checked: idCheck, evidence: [{ source: 'name', text: `Recorded as “${c.recorded.name}”` }], result: 'No ID matched. Likely institutions are suggested, but a person must choose.', by: 'Waiting for a coordinator' })
  } else {
    out.push({ key: 'identified', title: 'Institution found', state: 'problem', detail: 'No match found',
      checked: idCheck, evidence: [{ source: 'name', text: `Recorded as “${c.recorded.name}”` }], result: 'No institution in the register is close enough. It stays visible until someone matches it.', by: confirm?.actor ?? 'Automatic', at: confirm?.at })
  }

  // 3. Overlap check
  const overlapCheck = 'Is another unit already working on this institution? Checked every time a case arrives or changes.'
  const open = ctx.alerts.filter((a) => !a.decision || a.decision.decision === 'request_further_review')
  const done = ctx.alerts.filter((a) => a.decision && a.decision.decision !== 'request_further_review')
  const ruleEvidence = (as: CaseAlertInfo[]): Evidence[] => as.flatMap((a) => a.rules.map((r) => ({ source: 'records' as const, text: RULE_LABEL[r.code].short })))
  if (!ctx.institution) {
    out.push({ key: 'overlap', title: 'Overlap check', state: 'not_reached', detail: 'Waits for the institution', checked: overlapCheck, evidence: [], result: 'Runs as soon as the institution is known.', by: 'Automatic' })
  } else if (!ctx.alerts.length) {
    out.push({ key: 'overlap', title: 'Overlap check', state: 'auto', detail: 'No other unit involved', checked: overlapCheck, evidence: [{ source: 'records', text: 'No open case for this institution in any other unit' }], result: 'Nothing to coordinate.', by: 'Automatic', at: c.receivedOn })
  } else if (open.length) {
    const units = [...new Set(open.flatMap((a) => a.units))].filter((u) => u !== c.ownerUnit)
    out.push({ key: 'overlap', title: 'Overlap check', state: 'needs_person', detail: `Also with ${units.join(', ')}`, checked: overlapCheck, evidence: ruleEvidence(open), result: 'Possible overlap found. People from both units must look at it.', by: 'Automatic', at: open[0].since })
  } else {
    const d = done[done.length - 1].decision!
    out.push({ key: 'overlap', title: 'Overlap check', state: 'auto', detail: 'Found and looked at', checked: overlapCheck, evidence: ruleEvidence(done), result: 'A possible overlap was found and has been decided.', by: 'Automatic', at: d.at })
  }

  // 4. Clock set
  const dl = deadlineFor(c, ctx.today)
  const clockEvidence: Evidence[] = [
    { source: 'timing', text: `${dl.days} days from ${short(c.receivedOn)}: due ${short(dl.dueOn)}` },
    { source: 'records', text: dl.verified ? 'CPGRAMS rule (verified)' : 'Prototype setting, not an AICTE-approved timeline' },
    ...(dl.interimDay ? [{ source: 'timing' as const, text: `Interim reply by day ${dl.interimDay} (${short(addDays(c.receivedOn, dl.interimDay))})` }] : []),
  ]
  const clockCheck = 'Which time limit applies to this case, and is it being met? Re-checked every hour.'
  out.push(dl.state === 'closed'
    ? { key: 'clock', title: 'Clock set', state: 'auto', detail: 'Stopped: case closed', checked: clockCheck, evidence: clockEvidence, result: 'The clock stopped when the case was closed or transferred.', by: 'Automatic (hourly check)', at: ctx.today }
    : dl.state === 'overdue'
      ? { key: 'clock', title: 'Clock set', state: 'problem', detail: `${-dl.daysToDue} days overdue`, checked: clockCheck, evidence: clockEvidence, result: `Past the time limit. ${escalationFor(dl).label}.`, by: 'Automatic (hourly check)', at: ctx.today }
      : { key: 'clock', title: 'Clock set', state: 'auto', detail: `Due ${short(dl.dueOn)}${dl.verified ? '' : ' (prototype)'}`, checked: clockCheck, evidence: clockEvidence, result: dl.state === 'approaching' ? 'On time, but due soon.' : 'On time.', by: 'Automatic (hourly check)', at: ctx.today })

  // 5. Units agreed
  const agreeCheck = 'Have the units involved agreed how to handle the overlap? A person decides; the system only records it.'
  if (!ctx.alerts.length) {
    out.push({ key: 'coordinated', title: 'Units agreed', state: ctx.institution ? 'not_needed' : 'not_reached', detail: ctx.institution ? 'Not needed' : 'Waits for the overlap check', checked: agreeCheck, evidence: [], result: ctx.institution ? 'Only one unit is involved.' : 'Not reached yet.', by: '—' })
  } else if (open.length) {
    const due = addDays(open[0].since, SETTINGS.coordDueDays)
    const late = daysBetween(due, ctx.today) > 0
    const asked = open.find((a) => a.decision?.decision === 'request_further_review')?.decision
    out.push({ key: 'coordinated', title: 'Units agreed', state: late ? 'problem' : 'needs_person', detail: late ? `Decision was due ${short(due)}` : `Decision due ${short(due)}`,
      checked: agreeCheck, evidence: asked ? [{ source: 'person', text: `${asked.by} asked for more review: “${asked.reason}”` }] : [{ source: 'timing', text: `Review opened ${short(open[0].since)}, due within ${SETTINGS.coordDueDays} days (prototype setting)` }],
      result: late ? 'The decision is late and has gone to the coordinator.' : 'Waiting for a person from one of the units, or the coordinator.', by: 'Waiting for a decision' })
  } else {
    const d = done[done.length - 1].decision!
    out.push({ key: 'coordinated', title: 'Units agreed', state: 'confirmed', detail: `${DECISION_LABEL[d.decision]}${d.leadUnit ? `: ${d.leadUnit} leads` : ''}`, initials: initialsOf(d.by),
      checked: agreeCheck, evidence: [{ source: 'person', text: d.reason ? `“${d.reason}”` : 'No reason needed for this decision' }], result: 'Recorded. Owners and stages did not change.', by: d.by, at: d.at, auditRef: ref('linked') })
  }

  // 6. Closed
  const closeCheck = 'Has the owning unit finished the case, and how?'
  const closer = [...c.events].reverse().find((e) => e.type === 'disposed' || e.type === 'transferred')
  if (c.lifecycle === 'disposed') {
    out.push({ key: 'closed', title: 'Closed', state: 'confirmed', detail: c.disposalType ? DISPOSAL_LABEL[c.disposalType] : 'Disposed', initials: initialsOf(closer?.actor ?? '?'),
      checked: closeCheck, evidence: [{ source: 'person', text: closer?.text ?? 'Final action recorded' }], result: 'Closed by the owning unit.', by: closer?.actor ?? c.ownerUnit, at: closer?.at ?? c.lastActionOn, auditRef: ref('disposed') })
  } else if (c.lifecycle === 'transferred') {
    out.push({ key: 'closed', title: 'Closed', state: 'confirmed', detail: 'Transferred', initials: initialsOf(closer?.actor ?? '?'),
      checked: closeCheck, evidence: [{ source: 'person', text: closer?.text ?? 'Transferred' }], result: 'Sent to another unit. Counted as transferred, never as disposed.', by: closer?.actor ?? c.ownerUnit, at: closer?.at ?? c.lastActionOn, auditRef: ref('transferred') })
  } else {
    const waiting = ctx.replies.find((r) => r.state === 'waiting')
    out.push({ key: 'closed', title: 'Closed', state: 'not_reached', detail: waiting ? 'Waiting for the institution' : 'Still open', checked: closeCheck,
      evidence: waiting ? [{ source: 'timing', text: `Reply asked for by ${short(waiting.dueOn)}` }] : [], result: 'The owning unit closes the case when its work is done.', by: '—' })
  }
  return out
}

/** Hints, never blocks: closures that may not reflect real resolution. */
export function closureChecks(c: Case, replies: ReplyRequest[], decisions: Decision[]): string[] {
  if (c.lifecycle !== 'disposed') return []
  const out: string[] = []
  if (!c.events.some((e) => e.type === 'action_recorded' || e.type === 'status_changed')) out.push('Closed with no action on record.')
  if (replies.some((r) => r.state === 'waiting')) out.push('Closed while the institution’s reply was still awaited.')
  if (c.disposalType === 'closed_as_duplicate_by_owner' && !decisions.some((d) => d.decision === 'duplicate')) out.push('Closed as a duplicate, but no one recorded a “same complaint” decision.')
  return out
}

/** Who should be chasing an overdue case: owner, then nodal officer (+7 days), then senior management (+7 more). */
export function escalationFor(d: DeadlineInfo): { level: 0 | 1 | 2; late: number; label: string } {
  const late = d.state === 'overdue' ? -d.daysToDue : 0
  const step = SETTINGS.escalateAfterOverdue
  const level = late >= step * 2 ? 2 : late >= step ? 1 : 0
  return { level, late, label: ['With the dealing officer', 'Raised to the nodal officer', 'Raised to senior management'][level] }
}

/** How often each overlap rule turned out to matter. Advisory only: nothing changes until an admin edits a setting. */
export function rulePerformance(known: OverlapAlert[], decisions: Decision[]) {
  const codes: RuleCode[] = ['O1', 'O2', 'O3', 'O4', 'O5']
  return codes.map((code) => {
    const fired = known.filter((a) => a.rules.some((r) => r.code === code))
    const decided = fired.map((a) => [...decisions].reverse().find((d) => d.alertId === a.id)).filter((d): d is Decision => !!d && d.decision !== 'request_further_review')
    const notRelated = decided.filter((d) => d.decision === 'not_related').length
    return { code, fired: fired.length, decided: decided.length, notRelated, dismissRate: decided.length ? notRelated / decided.length : null }
  })
}

// ---------- Name check: field by field ----------
export interface FieldCheck { label: string; recorded: string; institution: string; verdict: Verdict; note?: string }
export function compareFields(rec: Case['recorded'], inst: Institution): { rows: FieldCheck[]; agree: number; given: number; nameScore: number } {
  const score = nameScore(rec.name, inst.name)
  const cur = inst.identifiers.find((i) => i.type === 'current_id' && i.verified)?.value
  const aishe = inst.identifiers.find((i) => i.type === 'aishe_code' && i.verified)?.value
  const rows: FieldCheck[] = [
    { label: 'Name', recorded: rec.name, institution: inst.name, verdict: nameVerdict(score), note: `${Math.round(score * 100)}% similar after tidying abbreviations` },
    { label: 'District', recorded: rec.district ?? '', institution: inst.district, verdict: compareValues([rec.district, inst.district]) },
    { label: 'PIN', recorded: rec.pin ?? '', institution: inst.pin, verdict: compareValues([rec.pin, inst.pin]) },
    { label: 'Current ID', recorded: rec.currentId ?? '', institution: cur ?? '', verdict: compareValues([rec.currentId?.replace(/\s/g, '-'), cur]) },
    { label: 'Permanent ID', recorded: rec.permanentId ?? '', institution: inst.permanentId, verdict: compareValues([rec.permanentId, inst.permanentId]) },
    { label: 'AISHE code', recorded: '', institution: aishe ?? '', verdict: 'not_given' },
  ]
  const given = rows.filter((r) => r.verdict !== 'not_given')
  return { rows, agree: given.filter((r) => r.verdict === 'same').length, given: given.length, nameScore: score }
}

// ---------- Audit chain ----------
/** Small, fast, non-cryptographic hash (cyrb53). The real backend uses SHA-256; the idea is the same. */
export function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0')
}
const payload = (e: Omit<AuditEvent, 'hash' | 'prevHash'>) => `${e.seq}|${e.at}|${e.actor}|${e.action}|${e.entity}|${e.details}`
export const chainHash = (prevHash: string, e: Omit<AuditEvent, 'hash' | 'prevHash'>) => cyrb53(prevHash + '|' + payload(e))

/** Each entry carries the fingerprint of the one before it, so changing or removing any entry breaks the chain. */
export function verifyChain(events: AuditEvent[]): { ok: boolean; count: number; brokenAt?: number } {
  let prev = 'genesis'
  for (const e of events) {
    if (e.prevHash !== prev || e.hash !== chainHash(prev, e)) return { ok: false, count: events.length, brokenAt: e.seq }
    prev = e.hash
  }
  return { ok: true, count: events.length }
}
