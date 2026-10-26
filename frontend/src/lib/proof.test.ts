import { describe, expect, it } from 'vitest'
import { chainHash, closureChecks, compareFields, escalationFor, proofTrail, rulePerformance, verifyChain } from './proof'
import { checkRow, parseCsv, templateCsv, toCsv } from './imports'
import { deadlineFor } from './logic'
import { api } from './api'
import type { AuditEvent, Case, Institution, OverlapAlert } from './types'

const TODAY = '2026-10-23'
const inst: Institution = { id: 'i1', permanentId: '1-2201234', name: 'Sahyadri Institute of Technology', type: 'Engineering', region: 'Western', state: 'Maharashtra', district: 'Pune', pin: '411001', identifiers: [{ type: 'current_id', value: '1-2201455', verified: true }] }
const mk = (o: Partial<Case>): Case => ({
  id: 'c1', uid: 'CC-2026-000001', sourceUnit: 'PGRC', ownerUnit: 'PGRC', sourceRef: 'PGRC/1', channel: 'CPGRAMS', receivedOn: '2026-10-10', category: 'other', summary: '', localStatus: '', lifecycle: 'under_examination',
  lastAction: '', lastActionOn: '2026-10-10', nextAction: '', institutionId: 'i1', recorded: { name: 'Sahyadri Inst of Tech' }, matchState: 'resolved_auto', matchMethod: 'T2_crosswalk', matchEvidence: ['Recorded Current ID 1-2201455 matches'],
  sensitive: { complainant: '', narrative: '' }, events: [{ type: 'created', at: '2026-10-10', actor: 'system', text: '' }], ...o,
})

describe('proof trail', () => {
  it('has six stages and asks a person only where a person is needed', () => {
    const p = proofTrail(mk({}), { today: TODAY, institution: inst, alerts: [], replies: [] })
    expect(p.map((s) => s.key)).toEqual(['received', 'identified', 'overlap', 'clock', 'coordinated', 'closed'])
    expect(p[1].state).toBe('auto')
    expect(p[2].state).toBe('auto')
    expect(p[4].state).toBe('not_needed')
    expect(p[5].state).toBe('not_reached')
  })
  it('a name-only case waits for a person, and the overlap check waits for the institution', () => {
    const p = proofTrail(mk({ matchState: 'pending_review', institutionId: null, matchMethod: undefined }), { today: TODAY, institution: null, alerts: [], replies: [] })
    expect(p[1].state).toBe('needs_person')
    expect(p[2].state).toBe('not_reached')
  })
  it('an undecided overlap needs a person; a decision is stamped with initials', () => {
    const alert = { id: 'a1', rules: [{ code: 'O1' as const, severity: 'High' as const, why: '', nextStep: '' }], units: ['PGRC', 'RB-WR'], since: '2026-10-20' }
    const open = proofTrail(mk({}), { today: TODAY, institution: inst, alerts: [{ ...alert, decision: null }], replies: [] })
    expect(open[2].state).toBe('needs_person')
    expect(open[4].state).toBe('needs_person')
    const done = proofTrail(mk({}), { today: TODAY, institution: inst, alerts: [{ ...alert, decision: { alertId: 'a1', decision: 'designate_lead_unit', leadUnit: 'RB-WR', reason: 'x', by: 'Anjali Rao, PGRC', at: '2026-10-22T10:00' } }], replies: [] })
    expect(done[4].state).toBe('confirmed')
    expect(done[4].initials).toBe('AR')
  })
  it('an overdue case shows a problem on the clock', () => {
    const p = proofTrail(mk({ receivedOn: '2026-09-01' }), { today: TODAY, institution: inst, alerts: [], replies: [] })
    expect(p[3].state).toBe('problem')
  })
})

describe('closure checks and escalation', () => {
  it('flags a closure with no action and a duplicate closure with no decision', () => {
    const c = mk({ lifecycle: 'disposed', disposalType: 'closed_as_duplicate_by_owner' })
    expect(closureChecks(c, [], [])).toHaveLength(2)
  })
  it('raises an overdue case step by step', () => {
    const at = (received: string) => escalationFor(deadlineFor(mk({ receivedOn: received }), TODAY)).level
    expect(at('2026-10-01')).toBe(0)    // 22 days old, CPGRAMS 21 -> 1 day late
    expect(at('2026-09-24')).toBe(1)    // 8 days late
    expect(at('2026-09-15')).toBe(2)    // 17 days late
  })
})

describe('rule performance', () => {
  it('counts how often each rule was dismissed', () => {
    const a = (id: string, code: 'O2' | 'O1'): OverlapAlert => ({ id, institutionId: 'i', caseIds: [], rules: [{ code, severity: 'Medium', why: '', nextStep: '' }], severity: 'Medium', title: '' })
    const r = rulePerformance([a('x', 'O2'), a('y', 'O2'), a('z', 'O1')], [
      { alertId: 'x', decision: 'not_related', reason: 'r', by: 'b', at: '' },
      { alertId: 'y', decision: 'related', reason: '', by: 'b', at: '' },
    ])
    const o2 = r.find((x) => x.code === 'O2')!
    expect(o2).toMatchObject({ fired: 2, decided: 2, notRelated: 1, dismissRate: 0.5 })
  })
})

describe('name check', () => {
  it('compares field by field and never counts a missing field as the same', () => {
    const r = compareFields({ name: 'Sahyadri Inst of Tech', district: 'Pune', currentId: '1 2201455' }, inst)
    expect(r.rows.find((x) => x.label === 'District')!.verdict).toBe('same')
    expect(r.rows.find((x) => x.label === 'Current ID')!.verdict).toBe('same')
    expect(r.rows.find((x) => x.label === 'PIN')!.verdict).toBe('not_given')
    expect(r.given).toBeLessThan(r.rows.length)
  })
})

describe('audit chain', () => {
  const chain = () => {
    const out: AuditEvent[] = []
    for (let i = 1; i <= 3; i++) {
      const prev = out.length ? out[out.length - 1].hash : 'genesis'
      const base = { seq: i, at: `2026-10-2${i}T10:00`, actor: 'A', action: 'Decision recorded', entity: 'x', details: `d${i}` }
      out.push({ ...base, prevHash: prev, hash: chainHash(prev, base) })
    }
    return out
  }
  it('an untouched chain checks out', () => expect(verifyChain(chain()).ok).toBe(true))
  it('editing any entry breaks the chain at that entry', () => {
    const c = chain()
    c[1].details = 'changed later'
    expect(verifyChain(c)).toMatchObject({ ok: false, brokenAt: 2 })
  })
})

describe('imports', () => {
  it('reads CSV with quotes and commas', () => {
    const rows = parseCsv('a,b\r\n"x, y","he said ""hi"""\n')
    expect(rows).toEqual([{ a: 'x, y', b: 'he said "hi"' }])
    expect(parseCsv(toCsv([['a'], ['1,2']]))).toEqual([{ a: '1,2' }])
  })
  it('the template passes the checks (once its statuses are known)', () => {
    const rows = parseCsv(templateCsv())
    const ctx = { today: TODAY, existingRefs: new Set<string>(), mapStatus: () => 'received' as const }
    expect(rows.map((r, i) => checkRow(r, i + 2, ctx).outcome)).toEqual(['new', 'new'])
  })
  it('explains each problem with a fix', () => {
    const ctx = { today: TODAY, existingRefs: new Set(['PGRC/1']), mapStatus: (w: string) => (w === 'Registered' ? ('received' as const) : undefined) }
    const bad = checkRow({ source_reference: 'PGRC/2', received_on: '2027-01-01', channel: 'FAX', category: 'x', local_status: 'Kept aside', institution_name: '', permanent_id: '1-22O1' }, 2, ctx)
    expect(bad.outcome).toBe('reject')
    expect(bad.problems.map((p) => p.field)).toEqual(expect.arrayContaining(['Institution name', 'Received on', 'How it came in', 'Category', 'Permanent ID', 'Status in your unit']))
    expect(bad.problems.every((p) => p.fix.length > 0)).toBe(true)
    const upd = checkRow({ source_reference: 'PGRC/1', received_on: '2026-10-01', channel: 'CSS', category: 'other', local_status: 'Registered', institution_name: 'X' }, 3, ctx)
    expect(upd.outcome).toBe('update')
  })
})

describe('sample data proves itself', () => {
  it('every planted difficult case is handled', async () => {
    const r = await api.plantedTests()
    expect(r.rows.filter((x) => !x.ok).map((x) => x.planted)).toEqual([])
  })
  it('every dashboard number agrees with an independent recount', async () => {
    const h = await api.dataHealth()
    expect(h.numbers.filter((n) => !n.ok)).toEqual([])
  })
  it('the audit chain built from the sample data is intact', async () => {
    const a = await api.auditLog({})
    expect(a.check.ok).toBe(true)
  })
})
