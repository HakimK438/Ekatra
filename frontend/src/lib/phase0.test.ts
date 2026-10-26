import { describe, expect, it } from 'vitest'
import { mainIssue, sharedIssues, tagIssues } from './issues'
import { overlapStory } from './overlapCopy'
import { unitFull } from './labels'
import type { Case } from './types'

type C = Pick<Case, 'ownerUnit' | 'lifecycle' | 'summary' | 'category' | 'receivedOn' | 'sourceComplaintRef' | 'uid' | 'channel'>
const mk = (o: Partial<C>): C => ({ ownerUnit: 'PGRC', lifecycle: 'under_examination', summary: '', category: 'other', receivedOn: '2026-10-12', uid: 'CC-1', channel: 'CPGRAMS', ...o })

describe('tagIssues', () => {
  it('finds issues at the start of a word and keeps the words that matched', () => {
    const t = tagIssues('Public grievance alleging inadequate faculty and lab facilities.')
    expect(t.map((x) => x.issue).sort()).toEqual(['faculty', 'laboratory'])
    expect(t.find((x) => x.issue === 'laboratory')!.words).toEqual(['lab'])
  })
  it('does not match inside a longer word', () => {
    expect(tagIssues('The syllabus was published late.').some((x) => x.issue === 'laboratory')).toBe(false)
  })
  it('uses the category when the summary is short', () => {
    expect(tagIssues('Pending.', 'fee_refund')[0].issue).toBe('fees')
  })
})

describe('sharedIssues', () => {
  it('reports an issue found in two cases, with the words from both', () => {
    const s = sharedIssues([mk({ summary: 'Inadequate faculty and lab facilities.' }), mk({ summary: 'Faculty strength below norms; EVC visit conducted.' })])
    expect(s[0].issue).toBe('faculty')
  })
  it('ignores approval wording when it is the only link', () => {
    expect(sharedIssues([mk({ summary: 'Notice sent.' }), mk({ summary: 'Hearing scheduled.' })]).map((x) => x.issue)).toEqual(['approval'])
    expect(mainIssue([mk({ summary: 'Fee refund delayed.' }), mk({ summary: 'Hearing scheduled.' })])?.shared).toBe(false)
  })
})

describe('overlapStory', () => {
  it('names the issue, the units and the dates', () => {
    const story = overlapStory([
      mk({ ownerUnit: 'PGRC', summary: 'Inadequate faculty and lab facilities.', receivedOn: '2026-10-12' }),
      mk({ ownerUnit: 'RB-WR', lifecycle: 'inspection_hearing', summary: 'Faculty strength below norms.', receivedOn: '2026-09-02', channel: 'APH_COMPLAINT' }),
    ])
    expect(story).toContain('Faculty and staff:')
    expect(story).toContain('PGRC received a CPGRAMS grievance on 12 Oct')
    expect(story).toContain('RB-WR has an inspection or hearing under way')
  })
})

describe('unitFull', () => {
  it('spells out unit codes', () => {
    expect(unitFull('RB-WR')).toBe('Regulation Bureau, Western Region (RB-WR)')
    expect(unitFull('PGRC')).toBe('Public Grievance Redressal Cell (PGRC)')
  })
})

describe('formal wording (user review, 23 Oct)', () => {
  const files = import.meta.glob('../{pages,components}/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  it('has no greeting, "things" or "Today" page wording in screens', () => {
    const bad = /Good (morning|afternoon|evening)|\bthings? (need|needs)\b|label: 'Today'/
    const hits = Object.entries(files).filter(([, src]) => bad.test(src)).map(([f]) => f)
    expect(hits).toEqual([])
  })
  it('shows no institution photos anywhere (officers identify institutions by name and Permanent ID)', () => {
    const hits = Object.entries(files).filter(([, src]) => /InstitutionPhoto|campusPhoto|img\/campus/.test(src)).map(([f]) => f)
    expect(hits).toEqual([])
  })
})
