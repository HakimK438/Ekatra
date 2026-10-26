import { describe, expect, it } from 'vitest'
import { ask, type AskIndex } from './ask'

const idx: AskIndex = {
  today: '2026-10-22',
  units: ['PGRC', 'RB-WR', 'RB-NWR', 'LEGAL'],
  regions: ['Western', 'North-West', 'Southern'],
  institutions: [{ id: 'i1', name: 'Sahyadri Institute of Technology', permanentId: '1-2200237' }],
  cases: [{ id: 'c2', uid: 'CC-2026-000002' }],
}

describe('plain-language search', () => {
  it('reads a full sentence into filters', () => {
    const r = ask('show overdue CPGRAMS cases in western region this month', idx)
    expect(r.filters).toMatchObject({ deadline: 'overdue', channel: 'CPGRAMS', region: 'Western', from: '2026-10-01' })
    expect(r.filters.q).toBeUndefined()
  })
  it('does not confuse north-west with west', () => {
    expect(ask('north-west escalated', idx).filters).toMatchObject({ region: 'North-West', lifecycle: 'escalated' })
  })
  it('recognises unit codes written loosely', () => {
    expect(ask('rb wr ragging', idx).filters).toMatchObject({ unit: 'RB-WR', category: 'ragging' })
  })
  it('jumps straight to a case or institution', () => {
    expect(ask('cc-2026-2', idx).jumps[0].to).toBe('/cases/c2')
    expect(ask('1-2200237', idx).jumps[0].to).toBe('/institutions/i1')
  })
  it('keeps unknown words as a text search and suggests institutions', () => {
    const r = ask('sahyadri', idx)
    expect(r.filters.q).toBe('sahyadri')
    expect(r.jumps[0].label).toBe('Sahyadri Institute of Technology')
  })
})
