// The next-step columns of an import, the basis of a clash's priority, and booking a date. These make the calendar usable with a user's own data.
import { describe, expect, it } from 'vitest'
import { checkRow, IMPORT_COLUMNS, templateCsv, parseCsv } from './imports'
import { priorityItems } from '../components/PriorityBasis'

const ctx = { today: '2026-10-26', existingRefs: new Set<string>(), mapStatus: () => 'under_examination' as const }
const base = { source_reference: 'A/1', received_on: '2026-10-20', channel: 'CPGRAMS', category: 'fee_refund', local_status: 'Comments sought', institution_name: 'X' }

describe('next-step columns', () => {
  it('are optional and offered in the template', () => {
    expect(IMPORT_COLUMNS.filter((c) => c.key.startsWith('next_step')).every((c) => !c.required)).toBe(true)
    const rows = parseCsv(templateCsv())
    expect(rows[0].next_step_on).toBe('2026-11-12')
    expect(checkRow(rows[0], 2, ctx).problems.filter((p) => p.field.startsWith('Next step'))).toHaveLength(0)
  })
  it('need both the date and the description, and a date that has not passed', () => {
    expect(checkRow({ ...base, next_step_on: '2026-11-03' }, 2, ctx).problems[0].problem).toMatch(/both/)
    expect(checkRow({ ...base, next_step_on: '2026-10-01', next_step: 'Hearing' }, 2, ctx).problems[0].problem).toMatch(/passed/)
    expect(checkRow({ ...base, next_step_on: '03/11/2026', next_step: 'Hearing' }, 2, ctx).problems[0].problem).toMatch(/not a date/)
    expect(checkRow({ ...base, next_step_on: '2026-11-03', next_step: 'Hearing' }, 2, ctx).outcome).toBe('new')
  })
})

describe('priority basis', () => {
  const rule = (code: 'O1' | 'O2', severity: 'High' | 'Medium') => ({ code, severity, why: `${code} applies.`, nextStep: '' })
  const c = (unit: string, on: string) => ({ id: unit, uid: unit, unit, channel: 'CPGRAMS', receivedOn: '2026-10-01', lifecycle: 'under_examination', scheduled: { on, what: 'Hearing' }, deadline: { dueOn: '2026-11-30', days: 30 } })
  it('lists the rules that apply, the dates that fall close together, and a late decision, in that order', () => {
    const items = priorityItems({ severity: 'High', rules: [rule('O1', 'High')], cases: [c('PGRC', '2026-10-28'), c('RB-WR', '2026-10-30')], dueOn: '2026-10-24', since: '2026-10-20' }, '2026-10-26')
    expect(items.map((i) => i.tag)).toEqual(['Rule O1', 'Dates', 'Duration', 'Late'])
    expect(items[1].text).toMatch(/2 days apart/)
    expect(items[3].text).toMatch(/2 days ago/)
  })
  it('says nothing about dates when the steps are far apart', () => {
    const items = priorityItems({ severity: 'Medium', rules: [rule('O2', 'Medium')], cases: [c('PGRC', '2026-10-28'), c('RB-WR', '2026-11-20')], dueOn: '2026-11-01', since: '2026-10-25' }, '2026-10-26')
    expect(items.map((i) => i.tag)).toEqual(['Rule O2', 'Duration'])
  })
})
