// Matching must never make a weak name look certain (risk: wrong institution mapping).
import { describe, expect, it } from 'vitest'
import { INSTITUTIONS } from './mock/data'
import { compareFields } from './proof'
import { nameScore, nameVerdict, suggestionsFor } from './logic'

const by = (n: string) => INSTITUTIONS.find((i) => i.name === n)!

describe('name matching', () => {
  it('the overall score is at most the name score plus 4 points', () => {
    for (const rec of [{ name: 'Sabarmati College of Engineering & Technology Trust', district: 'Ahmedabad', pin: '380001' }, { name: 'Malnad Polytechnic', district: 'Bengaluru', pin: '560001' }, { name: 'Gomti Coll of Engg', district: 'Lucknow' }]) {
      for (const s of suggestionsFor({ recorded: rec }, INSTITUTIONS)) {
        const inst = INSTITUTIONS.find((i) => i.id === s.institutionId)!
        expect(s.score).toBeLessThanOrEqual(Math.round((nameScore(rec.name, inst.name) + 0.04) * 100) / 100 + 1e-9)
      }
    }
  })
  it('the Sabarmati Trust case scores 90 or less overall', () => {
    const top = suggestionsFor({ recorded: { name: 'Sabarmati College of Engineering & Technology Trust', district: 'Ahmedabad', pin: '380001' } }, INSTITUTIONS)[0]
    expect(top.score).toBeLessThanOrEqual(0.9)
  })
  it('the two Malnad decoys stay within 5 points of each other', () => {
    const s = suggestionsFor({ recorded: { name: 'Malnad Polytechnic', district: 'Bengaluru', pin: '560001' } }, INSTITUTIONS)
    const decoys = s.filter((x) => by('Malnad Polytechnic College').id === x.institutionId || by('Malnad Polytechnic Institute').id === x.institutionId)
    expect(decoys).toHaveLength(2)
    expect(Math.abs(decoys[0].score - decoys[1].score)).toBeLessThanOrEqual(0.05)
  })
  it('uses Same, Similar and Different at 95 and 75', () => {
    expect([nameVerdict(0.95), nameVerdict(0.94), nameVerdict(0.75), nameVerdict(0.74)]).toEqual(['same', 'similar', 'similar', 'different'])
    const c = compareFields({ name: 'Malnad Polytechnic', district: 'Bengaluru' }, by('Malnad Polytechnic College'))
    expect(c.rows[0].verdict).toBe('similar')
    expect(c.given).toBe(2) // only the fields both sides have are counted
  })
})
