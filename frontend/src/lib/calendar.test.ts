import { describe, expect, it } from 'vitest'
import { datedActions, findCollisions, nextStep, weekStart, type CalCase } from './calendar'

const c = (o: Partial<CalCase> & { id: string; unit: string }): CalCase => ({ uid: o.id.toUpperCase(), channel: 'APH_COMPLAINT', receivedOn: '2026-10-01', lifecycle: 'inspection_hearing', deadline: { dueOn: '2026-12-01', days: 30 }, ...o })

describe('collision calendar', () => {
  const cases = [
    c({ id: 'a', unit: 'PGRC', channel: 'CPGRAMS', receivedOn: '2026-10-11', deadline: { dueOn: '2026-11-01', interimDay: 18, days: 21 } }),
    c({ id: 'b', unit: 'RB-WR', scheduled: { on: '2026-11-01', what: 'SHC hearing' } }),
  ]
  it('lists dated steps: scheduled, the CPGRAMS interim reply and the time limit', () => {
    const a = datedActions(cases, '2026-10-23')
    expect(a.map((x) => `${x.date} ${x.unit} ${x.kind}`)).toEqual(['2026-10-29 PGRC interim', '2026-11-01 PGRC deadline', '2026-11-01 RB-WR hearing', '2026-12-01 RB-WR deadline'])
  })
  it('ignores closed cases and dates in the past', () => {
    expect(datedActions([c({ id: 'z', unit: 'RB-WR', lifecycle: 'disposed', scheduled: { on: '2026-11-01', what: 'SHC hearing' } })], '2026-10-23')).toEqual([])
    expect(datedActions(cases, '2026-10-30').map((x) => x.kind)).toEqual(['deadline', 'hearing', 'deadline'])
  })
  it('flags two units acting within a week, and only then', () => {
    const col = findCollisions(datedActions(cases, '2026-10-23'))
    expect(col).toHaveLength(1)
    expect(col[0]).toMatchObject({ from: '2026-10-29', to: '2026-11-01', units: ['PGRC', 'RB-WR'] })
    const far = [cases[0], c({ id: 'b', unit: 'RB-WR', scheduled: { on: '2026-11-20', what: 'SHC hearing' } })]
    expect(findCollisions(datedActions(far, '2026-10-23'))).toEqual([])
  })
  it('does not call one unit with two steps a collision', () => {
    const one = [c({ id: 'a', unit: 'RB-WR', scheduled: { on: '2026-11-01', what: 'SHC hearing' } }), c({ id: 'b', unit: 'RB-WR', scheduled: { on: '2026-11-02', what: 'EVC visit' } })]
    expect(findCollisions(datedActions(one, '2026-10-23'))).toEqual([])
  })
  it('finds the next deliberate step and the Monday of a week', () => {
    expect(nextStep(datedActions(cases, '2026-10-23'), '2026-10-23')).toMatchObject({ unit: 'PGRC', kind: 'interim' })
    expect(weekStart('2026-10-29')).toBe('2026-10-26')
    expect(weekStart('2026-11-01')).toBe('2026-10-26')
    expect(weekStart('2026-10-26')).toBe('2026-10-26')
  })
})
