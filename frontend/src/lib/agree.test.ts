// No two screens may disagree: every headline number comes from summary(), and the lists must match it.
import { describe, expect, it } from 'vitest'
import { api } from './mock/mockApi'
import { DEMO_USERS } from './mock/mockApi'

const user = (id: string) => DEMO_USERS.find((u) => u.id === id)!

describe('one count everywhere', () => {
  it('the summary, the overlaps list, the dashboard and the institutions list agree on the overlap count', async () => {
    const co = user('u3') // coordinator
    const [s, board, dash, inst] = await Promise.all([api.summary(co), api.overlaps(), api.dashboard(), api.institutions({})])
    const n = s.overlaps.awaiting
    expect(n).toBe(board.open.length)
    expect(n).toBe(dash.overlapsAwaiting)
    expect(n).toBe(inst.rows.filter((r) => r.overlap).length)
    expect(s.overlaps.all).toBe(n + s.overlaps.decided)
    expect(s.overlaps.needMyDecision).toBe(n) // a coordinator may decide any overlap
  })
  it('a nodal officer sees a smaller, labelled share of the same total', async () => {
    const s = await api.summary(user('u1'))
    expect(s.unit).toBe('PGRC')
    expect(s.overlaps.needMyDecision).toBeLessThanOrEqual(s.overlaps.mine)
    expect(s.overlaps.mine).toBeLessThanOrEqual(s.overlaps.awaiting)
    expect((await api.worklist(user('u1'))).decideCount).toBe(s.overlaps.needMyDecision)
  })
  it('the "going late" count on the desk equals the late plus approaching cases of the unit', async () => {
    const u = user('u1')
    const s = await api.summary(u)
    const [over, soon] = await Promise.all([api.cases({ unit: u.unit, deadline: 'overdue', size: 200 }), api.cases({ unit: u.unit, deadline: 'approaching', size: 200 })])
    expect(over.total).toBe(s.mine.overdue)
    expect(soon.total).toBe(s.mine.approaching)
  })
  it('about 8% of open cases are late, so the register does not look like chaos', async () => {
    const s = await api.summary(user('u3'))
    const share = s.cases.overdue / s.cases.open
    expect(share).toBeGreaterThan(0.04)
    expect(share).toBeLessThan(0.12)
  })
})
