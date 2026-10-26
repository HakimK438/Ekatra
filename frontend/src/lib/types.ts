export type UnitKind = 'grievance_cell' | 'regulation_bureau' | 'regional_office' | 'other_cell'
export interface Unit { code: string; name: string; kind: UnitKind; region?: string }

export type Lifecycle =
  | 'received' | 'under_examination' | 'awaiting_party' | 'inspection_hearing'
  | 'transferred' | 'escalated' | 'disposed'

export type Channel = 'CPGRAMS' | 'CSS' | 'EMAIL_POST' | 'APH_COMPLAINT' | 'VIP_MINISTRY' | 'COURT' | 'RTI' | 'OTHER'
export type MatchState = 'resolved_auto' | 'resolved_confirmed' | 'pending_review' | 'unresolved'
export type MatchMethod = 'T1_exact' | 'T2_crosswalk' | 'T4_confirmed'

export interface Institution {
  id: string
  permanentId: string
  name: string
  type: string
  region: string
  state: string
  district: string
  pin: string
  identifiers: { type: 'current_id' | 'aishe_code' | 'former_name' | 'confirmed_alias'; value: string; verified: boolean }[]
}

export type EventType =
  | 'created' | 'imported' | 'status_changed' | 'action_recorded' | 'transferred' | 'escalated'
  | 'disposed' | 'reopened' | 'linked' | 'match_resolved' | 'reply_requested' | 'reply_received'
export interface CaseEvent { type: EventType; at: string; actor: string; text: string; auditRef?: string }

export type DisposalType = 'resolved' | 'rejected' | 'action_taken' | 'closed_as_duplicate_by_owner'

/** A document attached to a case. Only the name, size, type and fingerprint are kept in the index. */
export interface CaseDocument { name: string; size: number; type: string; sha256: string; from: 'officer' | 'institution'; at: string }

export interface Case {
  id: string
  uid: string
  sourceUnit: string
  ownerUnit: string
  sourceRef: string
  sourceComplaintRef?: string
  channel: Channel
  receivedOn: string
  category: string
  summary: string
  localStatus: string
  lifecycle: Lifecycle
  officer?: string
  lastAction: string
  lastActionOn: string
  nextAction: string
  institutionId: string | null
  recorded: { name: string; district?: string; pin?: string; ids?: string; permanentId?: string; currentId?: string }
  matchState: MatchState
  matchMethod?: MatchMethod
  matchEvidence: string[]
  sensitive: { complainant: string; narrative: string }
  events: CaseEvent[]
  disposalType?: DisposalType
  documents?: CaseDocument[]
  /** The next dated step: a hearing, a visit, or a reply the institution owes. Feeds the collision calendar. */
  scheduled?: { on: string; what: string }
}

export type RuleCode = 'O1' | 'O2' | 'O3' | 'O4' | 'O5'
export type Severity = 'High' | 'Medium'
export interface RuleFire { code: RuleCode; severity: Severity; why: string; nextStep: string }

export interface OverlapAlert {
  id: string
  institutionId: string
  caseIds: string[]
  rules: RuleFire[]
  severity: Severity
  title: string
}

export type DecisionType = 'related' | 'duplicate' | 'not_related' | 'designate_lead_unit' | 'request_further_review'
export interface Decision {
  alertId: string
  decision: DecisionType
  leadUnit?: string
  reason: string
  by: string
  at: string
  /** A follow-up the deciding officer assigned, e.g. "Send an interim reply" (owner unit, due date). */
  followUp?: { action: string; ownerUnit: string; dueOn: string }
  /** True when the officer accepted the system's suggestion unchanged. */
}

export interface MatchSuggestion {
  institutionId: string
  score: number
  evidence: string[]
}

export type DeadlineState = 'on_track' | 'approaching' | 'overdue' | 'closed'
export interface DeadlineInfo {
  state: DeadlineState
  age: number
  days: number
  dueOn: string
  daysToDue: number
  interimDay?: number
  interimDue: boolean
  verified: boolean
  basis: string
}

export type Role = 'dealing_officer' | 'nodal_officer' | 'coordinator' | 'data_steward' | 'senior_management' | 'admin'
export interface DemoUser { id: string; name: string; role: Role; unit?: string }

export interface CaseFilters {
  q?: string; unit?: string; region?: string; category?: string
  lifecycle?: string; deadline?: string; match?: string; from?: string; to?: string; channel?: string
  sort?: string; page?: number; size?: number
}

// ---------- Proof ----------
/** Where a piece of evidence comes from (system records, an identifier, a name, dates, a complaint ref, or a person). */
export type EvidenceSource = 'records' | 'id' | 'name' | 'timing' | 'ref' | 'person'
export interface Evidence { source: EvidenceSource; text: string }

/** One stamp on the Proof Trail. Every state is shown as icon + word + colour. */
export type StampState = 'auto' | 'needs_person' | 'confirmed' | 'problem' | 'not_reached' | 'not_needed'
export type ProofStageKey = 'received' | 'identified' | 'overlap' | 'clock' | 'coordinated' | 'closed'
export interface ProofStage {
  key: ProofStageKey
  title: string
  state: StampState
  /** One short line under the stamp, e.g. "Current ID 1-2201455" */
  detail: string
  checked: string
  evidence: Evidence[]
  result: string
  by: string
  at?: string
  /** Initials when a person confirmed it */
  initials?: string
  auditRef?: string
}

// ---------- Replies from institutions ----------
/** A one-time link an officer sends to an institution to collect its reply to a notice. */
export interface ReplyRequest {
  id: string
  token: string
  caseId: string
  institutionId: string
  askedFor: string
  dueOn: string
  createdBy: string
  createdAt: string
  state: 'waiting' | 'received'
  submission?: { at: string; note: string; files: CaseDocument[]; late: boolean; sameFileElsewhere: string[] }
}

// ---------- Imports ----------
export interface ImportReject { row: number; field: string; problem: string; fix: string }
export interface ImportBatch {
  id: string
  unit: string
  fileName: string
  by: string
  at: string
  rows: number
  created: number
  updated: number
  rejected: number
  rejects: ImportReject[]
  autoMatched: number
  namesToCheck: number
  newOverlaps: number
  caseIds: string[]
}
/** One row of an import file, after reading it (column name -> value). */
export type ImportRow = Record<string, string>
export interface CheckedRow { row: number; data: ImportRow; outcome: 'new' | 'update' | 'reject'; problems: ImportReject[]; /** What will happen to the row, in plain words (the institution it will join, a complaint number another unit holds). */ notes: string[] }

// ---------- Audit, scheduled checks, watching ----------
export interface AuditEvent { seq: number; at: string; actor: string; action: string; entity: string; details: string; prevHash: string; hash: string }
export interface JobRun { at: string; checked: number; overdue: number; dueSoon: number; interim: number; escalated: number }
export interface Watch { userId: string; institutionId: string; since: string }

export interface InboxItem {
  id: string
  tab: 'needs_you' | 'auto' | 'replies' | 'imports' | 'watching'
  title: string
  sub: string
  at: string
  to: string
  action: string
  /** The automatic steps that already ran, shown as small stamps */
  steps?: { label: string; state: StampState }[]
}
