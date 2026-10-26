// The sample files in documents/sample-data must behave as their README says in the offline demo too (same rules as the backend test).
import { describe, expect, it } from 'vitest'
import { api } from './mock/mockApi'
import { parseCsv } from './imports'

const files = import.meta.glob('../../../documents/sample-data/*.csv', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const load = (name: string) => parseCsv(files[`../../../documents/sample-data/${name}`])
const outcomes = async (unit: string, name: string) => (await api.importCheck(unit, load(name))).rows.map((r) => r.outcome)

describe('sample CSV files', () => {
  it('01 is clean', async () => expect(await outcomes('PGRC', '01_pgrc_clean.csv')).toEqual(Array(6).fill('new')))
  it('02 has one good row and eight bad ones, each with a fix', async () => {
    const { rows } = await api.importCheck('PGRC', load('02_pgrc_with_errors.csv'))
    expect(rows.map((r) => r.outcome)).toEqual(['new', ...Array(8).fill('reject')])
    expect(rows.slice(1).every((r) => r.problems.length > 0 && r.problems.every((p) => p.fix))).toBe(true)
  })
  it('03 asks about the two new status words', async () => {
    const r = await api.importCheck('RB-WR', load('03_rb_wr_duplicate_and_new_words.csv'))
    expect(r.rows.map((x) => x.outcome)).toEqual(['new', 'reject', 'reject'])
    expect(r.unknownStatuses.sort()).toEqual(['Hearing fixed', 'Show cause issued'])
  })
  it('04 updates an existing case', async () => expect(await outcomes('PGRC', '04_pgrc_update_existing.csv')).toEqual(['update']))
  it('05 is accepted', async () => expect(await outcomes('RO-WR', '05_ro_wr_small.csv')).toEqual(['new', 'new']))
})
