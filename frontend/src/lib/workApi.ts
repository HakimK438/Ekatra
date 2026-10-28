// Letters, requests to institutions, the policy console, the closure check, the repeat radar and the daily digest.
// These run on the real backend only (the offline demo shows a note instead), because their facts come from server records.
import { call } from './http'
import { MODE } from './api'

export const SERVER_ONLY = MODE !== 'http'

export interface Fact<T = string> { value: T; from: string }
export interface LetterFacts {
  kind: { kind: string; label: string; from: string }
  unit: { unit: string; from: string } | null
  refs: { kind: 'file_no' | 'cpgrams' | 'case_no'; value: string; from: string }[]
  letterDate: { on: string; from: string } | null
  dueOn: { on: string; from: string; how: string; days?: number } | null
  hearing: { on: string; what: string; from: string } | null
  institutionName: { value: string; from: string; district: string | null } | null
  ids: { permanentId?: Fact; currentId?: Fact; aisheCode?: Fact }
  items: { key: string; label: string; from: string }[]
  listed: string[]
  dates: { on: string; text: string }[]
}
export interface InstLite { id: string; name: string; permanentId: string; district: string; region: string }
export interface Finding { code: 'D1' | 'D2' | 'D3' | 'D4'; text: string; demandIds: (number | string)[]; item: string | null }
export interface RequestRow {
  id: number; institutionId: string; unit: string; caseId: string | null; kind: string; kindLabel: string; letterRef: string | null; letterDate: string
  items: string[]; itemLabels: string[]; otherItems: string[]; dueOn: string | null; hearingOn: string | null; hearingWhat: string | null
  state: 'open' | 'answered' | 'withdrawn'; answeredOn: string | null; note: string; source: string; by: string; at: string; daysLate: number
}
export interface LetterRead {
  facts: LetterFacts
  match: { institution: InstLite | null; method: string | null; evidence: string[]; suggestions: { institutionId: string; score: number; institution: InstLite }[] }
  draft: { unit: string | null; letterDate: string; items: string[]; dueOn: string | null; hearingOn: string | null; hearingWhat: string | null; letterRef: string | null }
  case: { id: string; uid: string; unit: string; stage: string; from: string } | null
  alreadyRecorded: RequestRow | null
  openCases: { id: string; uid: string; unit: string; stage: string; category: string }[]
  requests: RequestRow[]
  findings: Finding[]
}
export interface NewRequest {
  institutionId: string; unit?: string; caseId?: string | null; kind: string; letterRef?: string | null; letterDate: string; items: string[]; otherItems: string[]
  dueOn?: string | null; hearingOn?: string | null; hearingWhat?: string | null; text?: string
}
export interface RequestList {
  rows: (RequestRow & { institution: string; findings: Finding[] })[]
  counts: { open: number; late: number; institutionsWithFindings: number; askedAgain: number }
  items: { key: string; label: string }[]
  kinds: { key: string; label: string }[]
}
export interface RuleItem { key: string | null; group: string; label: string; unit: string; value: string; verified: boolean; editable: boolean; basis: string; current?: number; default?: number; min?: number; max?: number; changed?: boolean }
export interface Impact {
  values: { key: string; label: string; from: string; to: string }[]
  changes: { key: string; label: string; before: number; after: number; diff: number }[]
  overlapsGone: string[]; overlapsNew: string[]; summary: string
}
export interface Proposal { id: number; values: Record<string, number>; reason: string; by: string; at: string; effective: string; state: 'pending' | 'approved' | 'rejected'; impact: Impact; decidedBy?: string; decidedAt?: string; note?: string }
export interface PolicyView { rules: RuleItem[]; pending: Proposal[]; history: Proposal[]; who: { propose: string; approve: string } }
export interface ClosureCheck { caseId: string; facts: { level: 'ok' | 'info' | 'check'; text: string }[]; checks: number; headline: string }
export interface Radar {
  repeats: { case: { id: string; uid: string; unit: string; receivedOn: string }; earlier: { id: string; uid: string; unit: string; closedOn: string; how: string | null }; institution: string; institutionId: string; text: string }[]
  systemic: { institutionId: string; institution: string; issue: string; count: number; units: string[]; open: number; cases: { id: string; uid: string; unit: string; stage: string }[]; text: string }[]
  howCounted: string
}
export interface Digest { for: { name: string; unit: string | null; role: string }; date: string; total: number; late: number; headline: string; groups: { key: string; title: string; late: number; items: { title: string; what: string; when: string; late: boolean; to: string; text: string }[] }[]; text: string; sent: boolean; sendNote: string }
export interface Changes { days: number; from: string; to: string; now: Record<string, number>; before: Record<string, number>; line: string; overdueNow: number; howCounted: string }

export interface Allocation {
  unit: string; canMark: boolean; rule: string
  officers: { name: string; open: number; late: number; dueThisWeek: number; cases: { id: string; uid: string; dueOn: string; state: string }[] }[]
  unassigned: { id: string; uid: string; institution: string; category: string; channel: string; receivedOn: string; deadline: { state: string; dueOn: string; daysToDue: number; age: number } }[]
}

export interface WorkItem { caseId: string; uid: string; unit: string; officer: string | null; institutionId: string | null; institution: string; issue: string; stage: string; next: string; dueOn: string; late: boolean }
export interface People {
  units: { unit: string; name: string; open: number; officers: { name: string; items: WorkItem[] }[] }[]
  alsoOnMine: { institutionId: string; institution: string; mine: WorkItem[]; others: WorkItem[]; sameIssue: boolean; text: string }[]
  total: number; me: { name: string; unit: string | null; role: string }
}

export const work = {
  people: (q?: string) => call<People>('/people' + (q ? `?q=${encodeURIComponent(q)}` : '')),
  allocation: (unit?: string) => call<Allocation>('/allocation' + (unit ? `?unit=${encodeURIComponent(unit)}` : '')),
  mark: (caseId: string, officer: string, note: string) => call<{ officer: string; was: string | null }>(`/cases/${caseId}/mark`, { method: 'POST', body: { officer, note } }),
  readLetter: (text: string) => call<LetterRead>('/letters/read', { method: 'POST', body: { text } }),
  createRequest: (b: NewRequest) => call<{ request: RequestRow; findings: Finding[] }>('/requests', { method: 'POST', body: b }),
  requests: (f: { institutionId?: string; unit?: string; state?: string } = {}) =>
    call<RequestList>('/requests?' + new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString()),
  answered: (id: number, note: string) => call<RequestRow>(`/requests/${id}/answered`, { method: 'POST', body: { note } }),
  withdraw: (id: number, reason: string) => call<RequestRow>(`/requests/${id}/withdraw`, { method: 'POST', body: { reason } }),
  policy: () => call<PolicyView>('/policy'),
  preview: (values: Record<string, number>) => call<Impact>('/policy/preview', { method: 'POST', body: { values } }),
  propose: (values: Record<string, number>, reason: string, effective?: string) => call<PolicyView>('/policy/proposals', { method: 'POST', body: { values, reason, effective } }),
  decideProposal: (id: number, approve: boolean, note: string) => call<PolicyView>(`/policy/proposals/${id}/decide`, { method: 'POST', body: { approve, note } }),
  closureCheck: (caseId: string, reason: string, disposalType?: string) => call<ClosureCheck>(`/cases/${caseId}/closure-check`, { method: 'POST', body: { reason, disposalType } }),
  radar: () => call<Radar>('/radar'),
  digest: () => call<Digest>('/digest'),
  changes: (days = 7) => call<Changes>(`/reports/changes?days=${days}`),
  institutionRequests: (id: string) => call<{ requests: RequestRow[]; findings: Finding[] }>(`/institutions/${id}`),
}

/** One combined list of everything the units have asked an institution for, earliest reply date per document.
 *  A draft only: an officer reviews it and sends it through the usual channel. */
export function combinedAsk(rows: RequestRow[], labels: Record<string, string>) {
  const open = rows.filter((r) => r.state === 'open')
  const by = new Map<string, { label: string; units: string[]; due: string | null; refs: string[] }>()
  for (const r of open) {
    const keys = r.items.length ? r.items.map((k) => [k, labels[k] ?? k] as const) : r.otherItems.map((t) => [t, t] as const)
    for (const [k, label] of keys) {
      const x = by.get(k) ?? { label, units: [], due: null, refs: [] }
      if (!x.units.includes(r.unit)) x.units.push(r.unit)
      if (r.dueOn && (!x.due || r.dueOn < x.due)) x.due = r.dueOn
      if (r.letterRef) x.refs.push(r.letterRef)
      by.set(k, x)
    }
  }
  return [...by.values()].sort((a, b) => (a.due ?? '9').localeCompare(b.due ?? '9'))
}
