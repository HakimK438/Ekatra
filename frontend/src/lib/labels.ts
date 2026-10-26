// Every user-facing name in one place. Codes never change; labels are plain, stable and sentence case.
import type { Channel, DecisionType, Lifecycle, MatchState, Role, RuleCode } from './types'

/** Common lifecycle stage, as shown everywhere (lists, badges, lanes, charts). */
export const STAGE_LABEL: Record<Lifecycle, string> = {
  received: 'New',
  under_examination: 'With an officer',
  awaiting_party: 'Waiting for the institution',
  inspection_hearing: 'Visit or hearing',
  transferred: 'Transferred',
  escalated: 'Sent to senior authority',
  disposed: 'Disposed',
}

/** One plain sentence per stage, so nobody has to guess what a stage means. */
export const STAGE_HELP: Record<Lifecycle, string> = {
  received: 'Registered. Nobody has started on it yet.',
  under_examination: 'An officer is reading and checking the case.',
  awaiting_party: 'The institution has been asked to reply, and has not yet.',
  inspection_hearing: 'An inspection visit or a hearing is planned or under way.',
  escalated: 'Passed to a senior authority for a decision.',
  disposed: 'Closed, with an outcome recorded.',
  transferred: 'Sent to another unit. Counted apart from closed cases.',
}

/** Stage groups used by filters and count cards. "Open" excludes transferred cases (they are counted apart). */
export const STAGE_FILTER: Record<string, string> = {
  pending: 'New',
  under_process: 'Under process',
  active: 'Open',
  escalated: 'Sent to senior authority',
  transferred: 'Transferred',
  disposed: 'Disposed',
}

export const DEADLINE_LABEL: Record<string, string> = { on_track: 'On time', approaching: 'Due soon', overdue: 'Overdue' }

export const CATEGORY_LABEL: Record<string, string> = {
  norm_violation: 'Norms not followed',
  evc_deficiency: 'Inspection shortfall (EVC)',
  court_matter: 'Court matter',
  compliance_verification: 'Compliance check',
  ragging: 'Ragging',
  fee_refund: 'Fees and refunds',
  faculty_salary: 'Faculty and salary',
  admission: 'Admissions',
  other: 'Other',
}
export const categoryLabel = (code: string) => CATEGORY_LABEL[code] ?? code.replace(/_/g, ' ')

export const CHANNEL_LABEL: Record<Channel, string> = {
  CPGRAMS: 'CPGRAMS',
  CSS: 'AICTE CSS',
  EMAIL_POST: 'Email or post',
  APH_COMPLAINT: 'Approval process complaint',
  VIP_MINISTRY: 'VIP or Ministry reference',
  COURT: 'Court',
  RTI: 'RTI',
  OTHER: 'Other',
}

/** Overlap rules: a plain sentence (the headline style) and the full rule as written in the spec. */
export const RULE_LABEL: Record<RuleCode, { short: string; full: string }> = {
  O1: { short: 'Grievance Cell and a Regulation Bureau both have open cases', full: 'O1: grievance cell and Regulation Bureau both have open cases' },
  O2: { short: 'Open cases in several units', full: 'O2: open cases in two or more units' },
  O3: { short: 'The same kind of complaint is in more than one unit', full: 'O3: same category in two or more units within 180 days' },
  O4: { short: 'A new case arrived while a notice or hearing is pending in another unit', full: 'O4: new case while another unit has a notice or hearing pending' },
  O5: { short: 'The same complaint number is held by more than one unit', full: 'O5: the same complaint number is held by two or more units' },
}

/** Very short names for filter chips. */
export const RULE_CHIP: Record<RuleCode, string> = {
  O1: 'Grievance Cell + Bureau', O2: 'Several units', O3: 'Same kind of complaint', O4: 'New case during a hearing', O5: 'Same complaint number',
}

export const DECISION_LABEL: Record<DecisionType, string> = {
  related: 'Related, keep both',
  duplicate: 'Same complaint (duplicate)',
  not_related: 'Not related',
  designate_lead_unit: 'One unit leads',
  request_further_review: 'Needs more review',
}

/** What each decision does and does not do, shown before a person confirms it. */
export const DECISION_EFFECT: Record<DecisionType, { will: string[]; wont: string[] }> = {
  related: {
    will: ['Both cases get a "related" link and a timeline entry.', 'Each unit can see the other case.'],
    wont: ['Owners, stages and deadlines do not change.'],
  },
  duplicate: {
    will: ['Both cases are marked as the same complaint.', 'Each owning unit can then close its own case as a duplicate.'],
    wont: ['Nothing is closed or merged automatically.'],
  },
  not_related: {
    will: ['This overlap goes quiet and your reason is kept.', 'It comes back only if a new case joins or one reopens.'],
    wont: ['No link is created.'],
  },
  designate_lead_unit: {
    will: ['The lead unit is recorded on both cases.', 'Both cases get a link and a timeline entry.'],
    wont: ['Ownership does not move. The other unit keeps its case.'],
  },
  request_further_review: {
    will: ['The coordinator is asked to look again.', 'The review stays open with a new due date.'],
    wont: ['No link is created yet.'],
  },
}

export const ROLE_LABEL: Record<Role, string> = {
  dealing_officer: 'Dealing Officer',
  nodal_officer: 'Nodal Officer',
  coordinator: 'Coordinator',
  data_steward: 'Data Steward',
  senior_management: 'Senior Management',
  admin: 'System Administrator',
}

export const MATCH_LABEL: Record<MatchState, string> = {
  resolved_auto: 'Matched automatically',
  resolved_confirmed: 'Confirmed by a person',
  pending_review: 'Needs a match',
  unresolved: 'Unmatched',
}

export const ID_LABEL = {
  permanent_id: 'Permanent ID',
  current_id: 'Current ID',
  application_id: 'Application ID',
  aishe_code: 'AISHE code',
  former_name: 'Former name',
  confirmed_alias: 'Confirmed alternate name',
} as const

export const DISPOSAL_LABEL = {
  resolved: 'Resolved',
  rejected: 'Rejected',
  action_taken: 'Action taken',
  closed_as_duplicate_by_owner: 'Closed as duplicate',
} as const

/** Where a piece of evidence comes from. Shown as a small tag so a system fact is never confused with a claim. */
export const EVIDENCE_SOURCE_LABEL = {
  records: 'Records',
  id: 'ID',
  name: 'Name',
  timing: 'Timing',
  ref: 'Complaint ref',
  person: 'Person',
} as const

// ---------- Unit names: full name always available, short form for tight spaces ----------
const RB_REGION: Record<string, string> = { CR: 'Central', ER: 'Eastern', NWR: 'North-West', NR: 'Northern', SCR: 'South-Central', SWR: 'South-West', SR: 'Southern', WR: 'Western' }

/** "Regulation Bureau, Western Region (RB-WR)". Used on first mention and in tooltips. */
export function unitFull(code: string): string {
  if (code === 'PGRC') return 'Public Grievance Redressal Cell (PGRC)'
  if (code === 'LEGAL') return 'Legal Cell (LEGAL)'
  const [kind, region] = code.split('-')
  if (kind === 'RB' && RB_REGION[region]) return `Regulation Bureau, ${RB_REGION[region]} Region (${code})`
  if (kind === 'RO' && RB_REGION[region]) return `Regional Office, ${RB_REGION[region]} Region (${code})`
  return code
}

/** One line that explains the units on every screen where several are shown. */
export const UNIT_LEGEND = 'PGRC (Public Grievance Redressal Cell) handles complaints and grievances. RB (Regulation Bureau) handles regulatory action such as notices, inspections and hearings, region by region. RO is the Regional Office.'
