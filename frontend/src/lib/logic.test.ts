import { describe, expect, it } from 'vitest'
import { resolveInstitution, normaliseId, addDays, deadlineFor, detectOverlaps, summarise, suggestionsFor, nameScore, compareValues, canDecide, canConfirmMatch, filterCases } from './logic'
import type { Case, Institution, Unit } from './types'

const TODAY = '2026-10-22'
const units: Unit[] = [
  { code: 'PGRC', name: 'PGRC', kind: 'grievance_cell' },
  { code: 'RB-WR', name: 'RB WR', kind: 'regulation_bureau', region: 'Western' },
  { code: 'LEGAL', name: 'Legal', kind: 'other_cell' },
]
const insts: Institution[] = [
  { id: 'i1', permanentId: '1-100001', name: 'Malnad Polytechnic College', type: 'Polytechnic', region: 'South-West', state: 'Karnataka', district: 'Bengaluru', pin: '560001', identifiers: [] },
  { id: 'i2', permanentId: '1-100002', name: 'Malnad Polytechnic Institute', type: 'Polytechnic', region: 'South-West', state: 'Karnataka', district: 'Bengaluru', pin: '560034', identifiers: [] },
]

const mk = (o: Partial<Case>): Case => ({
  id: 'c', uid: 'CC', sourceUnit: 'PGRC', ownerUnit: 'PGRC', sourceRef: 'r', channel: 'CSS', receivedOn: '2026-09-01', category: 'other',
  summary: '', localStatus: '', lifecycle: 'under_examination', lastAction: '', lastActionOn: '2026-10-01', nextAction: '', institutionId: 'i1',
  recorded: { name: 'x' }, matchState: 'resolved_auto', matchEvidence: [], sensitive: { complainant: '', narrative: '' }, events: [], ...o,
})

describe('deadlines', () => {
  it('uses the verified 21-day CPGRAMS policy with interim reminder', () => {
    const d = deadlineFor(mk({ channel: 'CPGRAMS', receivedOn: '2026-10-03' }), TODAY) // age 19
    expect(d.days).toBe(21)
    expect(d.verified).toBe(true)
    expect(d.interimDue).toBe(true)
    expect(d.state).toBe('approaching')
  })
  it('labels non-CPGRAMS timelines as prototype and flags overdue', () => {
    const d = deadlineFor(mk({ receivedOn: '2026-08-01' }), TODAY)
    expect(d.verified).toBe(false)
    expect(d.state).toBe('overdue')
  })
  it('closed cases have no deadline state', () => {
    expect(deadlineFor(mk({ lifecycle: 'disposed' }), TODAY).state).toBe('closed')
  })
})

describe('overlaps', () => {
  it('O1 + O5 fire when PGRC and RB hold the same CPGRAMS ref', () => {
    const a = detectOverlaps([
      mk({ id: 'a', sourceComplaintRef: 'X1', receivedOn: '2026-06-01', category: 'admission' }),
      mk({ id: 'b', ownerUnit: 'RB-WR', sourceComplaintRef: 'X1', receivedOn: '2026-06-02', category: 'ragging' }),
    ], units, TODAY)
    expect(a).toHaveLength(1)
    expect(a[0].rules.map((r) => r.code).sort()).toEqual(['O1', 'O5'])
    expect(a[0].severity).toBe('High')
  })
  it('O2 fires for other unit combinations, not same-institution single unit', () => {
    const two = detectOverlaps([mk({ id: 'a', ownerUnit: 'LEGAL' }), mk({ id: 'b', ownerUnit: 'RB-WR' })], units, TODAY)
    expect(two[0].rules[0].code).toBe('O2')
    expect(detectOverlaps([mk({ id: 'a' }), mk({ id: 'b' })], units, TODAY)).toHaveLength(0)
  })
  it('O4 fires for a new case while another unit has a pending hearing', () => {
    const a = detectOverlaps([
      mk({ id: 'a', receivedOn: '2026-10-10' }),
      mk({ id: 'b', ownerUnit: 'RB-WR', lifecycle: 'inspection_hearing', receivedOn: '2026-07-01' }),
    ], units, TODAY)
    expect(a[0].rules.map((r) => r.code)).toContain('O4')
  })
  it('does not alert on unmatched cases', () => {
    expect(detectOverlaps([mk({ id: 'a', institutionId: null }), mk({ id: 'b', ownerUnit: 'RB-WR', institutionId: null })], units, TODAY)).toHaveLength(0)
  })
})

describe('matching', () => {
  it('returns a ranked list for decoy near-identical names', () => {
    const s = suggestionsFor(mk({ recorded: { name: 'Malnad Polytechnic', district: 'Bengaluru', pin: '560001' } }), insts)
    expect(s.length).toBe(2)
    expect(s[0].institutionId).toBe('i1')
    expect(s[0].evidence.join(' ')).toContain('Same PIN')
  })
  it('normalises abbreviations', () => {
    expect(nameScore('Sahyadri Inst. of Tech', 'Sahyadri Institute of Technology')).toBeGreaterThan(0.9)
  })
})

describe('summary', () => {
  it('counts transfers separately from disposals', () => {
    const cases = [mk({ id: 'a', lifecycle: 'disposed' }), mk({ id: 'b', lifecycle: 'transferred' }), mk({ id: 'c' }), mk({ id: 'd' })]
    const s = summarise(cases, [], [], insts, units, TODAY)
    expect(s.disposed).toBe(1)
    expect(s.transferred).toBe(1)
    // disposed / (disposed + open): a transferred case is in neither the numerator nor the denominator
    expect(s.disposalRate).toBeCloseTo(1 / 3)
  })
})

describe('calendar dates', () => {
  it('addDays moves exactly n calendar days regardless of time zone', () => {
    expect(addDays('2026-10-22', -12)).toBe('2026-10-10')
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('automatic institution resolution', () => {
  const withIds: Institution[] = [
    { ...insts[0], identifiers: [{ type: 'current_id', value: '1-2201455', verified: true }, { type: 'aishe_code', value: 'C-40007', verified: false }] },
    insts[1],
  ]
  it('T1 matches an exact Permanent ID despite formatting noise', () => {
    expect(normaliseId('  1 100001 ')).toBe('1-100001')
    const r = resolveInstitution({ name: 'x', permanentId: ' 1 100001 ' }, withIds)
    expect(r).toMatchObject({ state: 'resolved_auto', method: 'T1_exact', institutionId: 'i1' })
  })
  it('T2 uses a verified alternate ID but never an unverified one', () => {
    expect(resolveInstitution({ name: 'x', currentId: '1 2201455' }, withIds)).toMatchObject({ method: 'T2_crosswalk', institutionId: 'i1' })
    expect(resolveInstitution({ name: 'zzz', currentId: 'C-40007' }, withIds).state).not.toBe('resolved_auto')
  })
  it('T3 only suggests; a name never links by itself', () => {
    const r = resolveInstitution({ name: 'Malnad Polytechnic', district: 'Bengaluru' }, withIds)
    expect(r.state).toBe('pending_review')
    expect(r.institutionId).toBeUndefined()
    expect(r.suggestions.length).toBeGreaterThan(1)
  })
})

describe('foundation helpers', () => {
  it('compareValues never treats a missing value as the same', () => {
    expect(compareValues(['DARPG/1', 'darpg/1 '])).toBe('same')
    expect(compareValues(['DARPG/1', 'DARPG/2'])).toBe('different')
    expect(compareValues(['DARPG/1', undefined])).toBe('not_given')
    expect(compareValues([undefined, undefined])).toBe('not_given')
  })
  it('canDecide: coordinator, or a nodal officer of an involved unit only', () => {
    expect(canDecide({ role: 'coordinator' }, ['PGRC', 'RB-WR'])).toBe(true)
    expect(canDecide({ role: 'nodal_officer', unit: 'PGRC' }, ['PGRC', 'RB-WR'])).toBe(true)
    expect(canDecide({ role: 'nodal_officer', unit: 'LEGAL' }, ['PGRC', 'RB-WR'])).toBe(false)
    expect(canDecide({ role: 'dealing_officer', unit: 'PGRC' }, ['PGRC'])).toBe(false)
    expect(canDecide({ role: 'senior_management' }, ['PGRC'])).toBe(false)
  })
  it('canConfirmMatch: coordinator and data steward only', () => {
    expect(canConfirmMatch({ role: 'data_steward' })).toBe(true)
    expect(canConfirmMatch({ role: 'coordinator' })).toBe(true)
    expect(canConfirmMatch({ role: 'nodal_officer' })).toBe(false)
  })
  it('the "active" filter excludes transferred and disposed cases (matches the Open now count)', () => {
    const mk = (id: string, lifecycle: Case['lifecycle']) => ({ id, lifecycle, ownerUnit: 'PGRC', category: 'other', channel: 'CSS', receivedOn: TODAY, matchState: 'resolved_auto', institutionId: 'i1', uid: id, sourceRef: id, recorded: { name: 'x' } }) as unknown as Case
    const list = [mk('a', 'received'), mk('b', 'transferred'), mk('c', 'disposed'), mk('d', 'escalated')]
    expect(filterCases(list, { lifecycle: 'active' }, insts, units, TODAY).map((c) => c.id)).toEqual(['a', 'd'])
    expect(filterCases(list, { lifecycle: 'open' }, insts, units, TODAY).map((c) => c.id)).toEqual(['a', 'd'])
  })
})
