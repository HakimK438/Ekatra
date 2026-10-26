import { describe, expect, it } from 'vitest'
import { nextStepFor, preActionCheck, stageBudgets, stageReading, type LaneLite } from './solution'
import { stageSince } from './logic'

const lane = (o: Partial<LaneLite> & { id: string; unit: string }): LaneLite => ({ uid: o.id.toUpperCase(), lifecycle: 'under_examination', category: 'faculty', ...o })
const mine = lane({ id: 'a', unit: 'PGRC' })

describe('pre-action check', () => {
  it('is green when no other unit is active', () => {
    const r = preActionCheck({ action: 'close', caseId: 'a', unit: 'PGRC', category: 'faculty', lanes: [mine] })
    expect(r.light).toBe('green')
  })
  it('ignores closed and transferred cases of other units', () => {
    const lanes = [mine, lane({ id: 'b', unit: 'RB-WR', lifecycle: 'disposed' }), lane({ id: 'c', unit: 'RB-ER', lifecycle: 'transferred' })]
    expect(preActionCheck({ action: 'close', caseId: 'a', unit: 'PGRC', category: 'faculty', lanes }).light).toBe('green')
  })
  it('recording a note is always green', () => {
    const lanes = [mine, lane({ id: 'b', unit: 'RB-WR', lifecycle: 'inspection_hearing' })]
    expect(preActionCheck({ action: 'record', caseId: 'a', unit: 'PGRC', category: 'faculty', lanes }).light).toBe('green')
  })
  it('is amber when another unit is active on a different issue, and names the unit', () => {
    const lanes = [mine, lane({ id: 'b', unit: 'RB-WR', category: 'fees' })]
    const r = preActionCheck({ action: 'close', caseId: 'a', unit: 'PGRC', category: 'faculty', lanes })
    expect(r.light).toBe('amber')
    expect(r.askUnits).toEqual(['RB-WR'])
    expect(r.headline).toContain('RB-WR')
  })
  it('is red when another unit handles the same issue', () => {
    const lanes = [mine, lane({ id: 'b', unit: 'RB-WR' }), lane({ id: 'c', unit: 'RB-SR', category: 'fees' })]
    const r = preActionCheck({ action: 'reply', caseId: 'a', unit: 'PGRC', category: 'faculty', lanes })
    expect(r.light).toBe('red')
    expect(r.askUnits).toEqual(['RB-WR'])
    expect(r.because).toHaveLength(1)
  })
  it('an internal stage change is green, unless it enters a waiting or hearing stage', () => {
    const lanes = [mine, lane({ id: 'b', unit: 'RB-WR', category: 'fees' })]
    expect(preActionCheck({ action: 'stage', caseId: 'a', unit: 'PGRC', category: 'faculty', lanes, targetStage: 'under_examination' }).light).toBe('green')
    expect(preActionCheck({ action: 'stage', caseId: 'a', unit: 'PGRC', category: 'faculty', lanes, targetStage: 'awaiting_party' }).light).toBe('amber')
  })
  it('a stage change into a hearing with the same issue elsewhere is red', () => {
    const lanes = [mine, lane({ id: 'b', unit: 'RB-WR' })]
    expect(preActionCheck({ action: 'stage', caseId: 'a', unit: 'PGRC', category: 'faculty', lanes, targetStage: 'inspection_hearing' }).light).toBe('red')
  })
})

describe('next-step owner', () => {
  const base = { ownerUnit: 'PGRC', receivedOn: '2026-10-01', nextAction: 'Call the institution', deadline: { dueOn: '2026-10-22', interimDue: false, verified: true } }
  it('closed cases have no next step', () => {
    expect(nextStepFor({ ...base, lifecycle: 'disposed', officer: 'A' })).toBeNull()
    expect(nextStepFor({ ...base, lifecycle: 'transferred', officer: 'A' })).toBeNull()
  })
  it('an unassigned case goes to the nodal officer, never to nobody', () => {
    const n = nextStepFor({ ...base, lifecycle: 'received', officer: undefined })!
    expect(n.owner).toBe('Nodal officer, PGRC')
    expect(n.verb).toBe('Assign a dealing officer')
    expect(n.by).toBe('2026-10-04')
  })
  it('waiting on the institution says so', () => {
    const n = nextStepFor({ ...base, lifecycle: 'awaiting_party', officer: 'Priya Nair' })!
    expect(n.owner).toBe('The institution')
    expect(n.waiting).toBe(true)
  })
  it('an interim reply due beats the stored next action', () => {
    const n = nextStepFor({ ...base, lifecycle: 'under_examination', officer: 'Priya Nair', deadline: { ...base.deadline, interimDue: true } })!
    expect(n.verb).toBe('Send the interim reply')
    expect(n.owner).toBe('Priya Nair')
  })
  it('otherwise uses the recorded next action, with a fallback', () => {
    expect(nextStepFor({ ...base, lifecycle: 'under_examination', officer: 'P' })!.verb).toBe('Call the institution')
    expect(nextStepFor({ ...base, lifecycle: 'under_examination', officer: 'P', nextAction: ' ' })!.verb).toBe('Examine the case')
  })
})

describe('stage time budgets', () => {
  it('splits the 21-day CPGRAMS limit into 6 + 6 + 4 + 5, and always sums to the total', () => {
    expect(stageBudgets(21, 'received', 0).map((b) => b.days)).toEqual([6, 6, 4, 5])
    expect(stageBudgets(30, 'received', 0).map((b) => b.days)).toEqual([9, 9, 6, 6])
    for (const t of [14, 21, 30, 45, 60]) expect(stageBudgets(t, 'received', 0).reduce((s, x) => s + x.days, 0)).toBe(t)
  })
  it('gives every stage its own budget, including a Hearing stage', () => {
    const state = (l: Parameters<typeof stageBudgets>[1]) => stageBudgets(21, l, 2).map((b) => b.state)
    expect(state('received')).toEqual(['current', 'next', 'next', 'next'])
    expect(state('under_examination')).toEqual(['current', 'next', 'next', 'next'])
    expect(state('awaiting_party')).toEqual(['done', 'current', 'next', 'next'])
    expect(state('inspection_hearing')).toEqual(['done', 'done', 'current', 'next'])
    expect(state('escalated')).toEqual(['done', 'done', 'done', 'current'])
  })
  it('blames the stage a case is in for the time it spent there, not for the time since it arrived', () => {
    const b = stageBudgets(21, 'inspection_hearing', 3)
    expect(b[2].lateDays).toBe(0)
    expect(stageReading(b)).toBe('Hearing or inspection: day 3 of 4')
    expect(stageReading(stageBudgets(21, 'under_examination', 14))).toBe('Stuck at: Examination (14 days; budget 6)')
    expect(stageReading(stageBudgets(21, 'under_examination', 7))).toBe('Stuck at: Examination (7 days; budget 6)')
  })
  it('is empty for closed cases', () => {
    expect(stageBudgets(21, 'disposed', 5)).toEqual([])
    expect(stageReading([])).toBe('Closed')
  })
  it('works out the day a case entered its stage from its history', () => {
    const events = [{ type: 'created', at: '2026-10-01' }, { type: 'status_changed', at: '2026-10-03' }, { type: 'action_recorded', at: '2026-10-09' }] as never
    expect(stageSince({ events, receivedOn: '2026-10-01' })).toBe('2026-10-03')
    expect(stageSince({ events: [{ type: 'created', at: '2026-10-01' }] as never, receivedOn: '2026-10-01' })).toBe('2026-10-01')
  })
})
