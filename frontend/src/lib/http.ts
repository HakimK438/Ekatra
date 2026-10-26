// The real API client. Same method names and result shapes as the mock (lib/mock/mockApi.ts), so no page changes.
// Requests go to /api/v1 on the same site (a rewrite in production, a proxy in development), so the sign-in cookie stays first-party.
// Counts, matches, overlaps and deadlines are all computed by the backend from database records.
import { ApiError } from './errors'
import { applyRules } from './rules'
import { proofTrail, type CaseAlertInfo } from './proof'
import type { Case, CaseFilters, Decision, DemoUser, DisposalType, ImportRow, Lifecycle, ProofStage, Institution } from './types'

const BASE = '/api/v1'

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let res: Response
  try {
    res = await fetch(BASE + path, {
      method: init?.method ?? 'GET',
      credentials: 'include',
      headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    })
  } catch {
    throw new ApiError('network', 'The server could not be reached. Check your connection and try again.')
  }
  if (!res.ok) {
    const b = await res.json().catch(() => null) as { code?: string; message?: string } | null
    throw new ApiError(b?.code ?? 'error', b?.message ?? 'Something went wrong. Please try again.')
  }
  return res.json() as Promise<T>
}

const qs = (o: Record<string, unknown>) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

type WithProof = { events: Case['events']; alertInfo: CaseAlertInfo[]; institution: Institution | null; replies: never[] }
/** The Proof Trail is an explanation of facts the server already returned, so it is assembled here from them. */
const withProof = <T extends WithProof & Case>(c: T, today: string): T & { proof: ProofStage[] } => ({
  ...c,
  proof: proofTrail(c, {
    today, institution: c.institution, alerts: c.alertInfo, replies: [],
    auditRef: (cc, type) => [...cc.events].reverse().find((e) => e.type === type)?.auditRef,
  }),
})

const unavailable = async () => { throw new ApiError('not_available', 'This feature is not part of the connected version yet.') }

export const httpApi = {
  today: '',
  /** Called once before the app renders: the server's working date and the signed-in user, if any. */
  bootstrap: async () => {
    const meta = await call<{ today: string; settings: Record<string, number> }>('/meta')
    httpApi.today = meta.today
    applyRules(meta.settings)
    return call<(DemoUser & { title: string; username: string }) | null>('/auth/me').catch(() => null)
  },
  demoUsers: () => call<(DemoUser & { title: string; username: string })[]>('/auth/demo-users'),
  signIn: (username: string, password: string) => call<DemoUser & { title: string; username: string }>('/auth/login', { method: 'POST', body: { username, password } }),
  signOut: () => call('/auth/logout', { method: 'POST' }).catch(() => undefined),

  // Every read of /meta also refreshes the rules in force, so a change an administrator makes reaches every open screen.
  meta: () => call<{ settings: Record<string, number> }>('/meta').then((m) => { applyRules(m.settings); return m }),
  searchIndex: () => call<unknown>('/search-index'),
  summary: (_user?: DemoUser) => call<unknown>('/summary'),
  check: (b: { action: string; institutionId: string; unit?: string; caseId?: string; category?: string; targetStage?: string }, _user?: DemoUser) => call<unknown>('/check', { method: 'POST', body: b }),
  calendar: (from?: string, to?: string) => call<unknown>('/calendar' + qs({ from, to })),
  worklist: (_user?: DemoUser, limit?: number) => call<unknown>(`/worklist${limit ? `?limit=${limit}` : ''}`),
  dashboard: (f: CaseFilters = {}) => call<unknown>('/dashboard' + qs({ ...f })),
  automation: () => call<unknown>('/automation'),
  runSweep: () => call<unknown>('/sweep/now', { method: 'POST' }),
  jobRuns: () => call<unknown>('/job-runs'),
  ingest: (scenario: string) => call<unknown>(`/ingest/${scenario}`, { method: 'POST' }),
  resetDemo: () => call<boolean>('/admin/reset', { method: 'POST' }),

  cases: async (f: CaseFilters) => {
    const r = await call<{ items: (Case & WithProof)[] } & Record<string, unknown>>('/cases' + qs({ ...f }))
    return { ...r, items: r.items.map((c) => withProof(c, httpApi.today)) }
  },
  exportCases: (f: CaseFilters, _user?: DemoUser) => call<unknown>('/cases/export' + qs({ ...f })),
  case: async (id: string, _user?: DemoUser) => withProof(await call<Case & WithProof>(`/cases/${id}`), httpApi.today),
  sensitive: (id: string, _user?: DemoUser) => call<unknown>(`/cases/${id}/sensitive`),
  assignToMe: (id: string, _user?: DemoUser) => call<boolean>(`/cases/${id}/assign`, { method: 'POST' }),
  recordAction: (id: string, input: { text: string; next: string }, _user?: DemoUser) => call<boolean>(`/cases/${id}/action`, { method: 'POST', body: input }),
  schedule: (id: string, input: { on: string | null; what: string }, _user?: DemoUser) => call<boolean>(`/cases/${id}/schedule`, { method: 'POST', body: input }),
  changeStage: (id: string, input: { stage: Lifecycle; reason: string }, _user?: DemoUser) => call<boolean>(`/cases/${id}/stage`, { method: 'POST', body: input }),
  transfer: (id: string, input: { to: string; reason: string }, _user?: DemoUser) => call<boolean>(`/cases/${id}/transfer`, { method: 'POST', body: input }),
  dispose: (id: string, input: { type: DisposalType; reason: string }, _user?: DemoUser) => call<boolean>(`/cases/${id}/dispose`, { method: 'POST', body: input }),
  checkNewCase: (d: { permanentId?: string; currentId?: string; name?: string; district?: string; complaintRef?: string }) => call<unknown>('/cases/check-new' + qs({ ...d })),
  createCase: (d: unknown, _user?: DemoUser) => call<unknown>('/cases', { method: 'POST', body: d }),

  importCheck: (unit: string, rows: ImportRow[]) => call<unknown>('/imports/check', { method: 'POST', body: { unit, rows } }),
  saveStatusMeaning: (unit: string, word: string, stage: Lifecycle, _user?: DemoUser) => call<boolean>('/imports/status-meaning', { method: 'POST', body: { unit, word, stage } }),
  importCommit: (unit: string, fileName: string, rows: ImportRow[], _user?: DemoUser) => call<unknown>('/imports/commit', { method: 'POST', body: { unit, fileName, rows } }),
  imports: () => call<unknown>('/imports'),
  importBatch: (id: string) => call<unknown>(`/imports/${id}`),

  deadlines: (_user?: DemoUser, unit?: string) => call<unknown>('/deadlines' + qs({ unit })),
  institutions: (f: { q?: string; region?: string; type?: string; only?: string }) => call<unknown>('/institutions' + qs({ ...f })),
  institution: (id: string, _user?: DemoUser) => call<unknown>(`/institutions/${id}`),

  overlaps: () => call<unknown>('/overlaps'),
  overlap: (id: string, _user?: DemoUser) => call<unknown>('/overlap' + qs({ id })),
  decide: (input: { alertId: string; decision: string; reason: string; leadUnit?: string | null; followUp?: Decision['followUp'] | null; user?: DemoUser }) => {
    const { user: _u, ...body } = input
    return call<unknown>('/overlaps/decide', { method: 'POST', body })
  },
  tasks: () => call<unknown>('/tasks'),
  completeTask: (id: number) => call<unknown>(`/tasks/${id}/complete`, { method: 'POST' }),

  matchingQueue: () => call<unknown>('/matching'),
  acceptMatch: (caseId: string, institutionId: string, _user?: DemoUser) => call<unknown>(`/matching/${caseId}/accept`, { method: 'POST', body: { institutionId } }),
  rejectMatch: (caseId: string, institutionId: string, _user?: DemoUser) => call<boolean>(`/matching/${caseId}/reject`, { method: 'POST', body: { institutionId } }),
  markUnresolved: (caseId: string, reason: string, _user?: DemoUser) => call<boolean>(`/matching/${caseId}/unresolved`, { method: 'POST', body: { reason } }),

  report: (input: { type: string; period: string; unit?: string; region?: string }) => call<unknown>('/reports' + qs({ ...input })),
  exportReport: (input: { type: string; period: string; unit?: string; region?: string }, _user?: DemoUser) => call<unknown>('/reports/export' + qs({ ...input })),
  numbersCheck: () => call<unknown>('/reports/check'),
  settings: () => call<{ values: Record<string, number> }>('/settings').then((s) => { applyRules(s.values); return s }),
  updateRules: (input: { values: Record<string, number>; reason: string }, _user?: DemoUser) => call<unknown>('/settings/rules', { method: 'PUT', body: input }),
  resetRules: (input: { reason: string }, _user?: DemoUser) => call<unknown>('/settings/rules/reset', { method: 'POST', body: input }),
  users: () => call<unknown>('/users'),
  auditLog: (f: { q?: string; action?: string }) => call<unknown>('/audit' + qs({ ...f })),

  // Not part of the connected version (see documents/DECISIONS.md): institution reply links, watch lists, data-health and the planted-test page.
  inbox: unavailable, dataHealth: unavailable, plantedTests: unavailable, requestReply: unavailable, replyInfo: unavailable, submitReply: unavailable, toggleWatch: unavailable,
}
