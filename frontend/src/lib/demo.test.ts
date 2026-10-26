// The demo story, start to finish, through the same api the screens use.
import { describe, expect, it } from 'vitest'
import { api, DEMO_USERS } from './api'

const u = (id: string) => DEMO_USERS.find((x) => x.id === id)!

describe('demo story', () => {
  it('a PGRC case with only a Current ID finds its institution, flags the overlap, and a decision clears it', async () => {
    const before = await api.dashboard()
    const r = await api.ingest('current_id')
    expect(r.matched).toBe(true)
    expect(r.steps.find((s) => s.key === 'match')!.detail).toMatch(/another verified ID/)
    expect(r.overlapId).toBeTruthy()

    const ov = await api.overlap(r.overlapId!, u('u1'))
    expect(ov.rules.map((x) => x.code)).toEqual(expect.arrayContaining(['O1', 'O4']))
    expect(ov.earlierDecision).toBeNull()

    const mid = await api.dashboard()
    // Sahyadri's one overlap is replaced by one that also includes the new case, so the waiting count stays the same.
    expect(mid.overlapsAwaiting).toBe(before.overlapsAwaiting)

    await expect(api.decide({ alertId: r.overlapId!, decision: 'designate_lead_unit', reason: '', leadUnit: 'RB-WR', user: u('u1') })).rejects.toThrow(/reason/)
    await expect(api.decide({ alertId: r.overlapId!, decision: 'designate_lead_unit', reason: 'x', leadUnit: 'RB-WR', user: u('u4') })).rejects.toThrow(/Only a coordinator/)
    const d = await api.decide({ alertId: r.overlapId!, decision: 'designate_lead_unit', reason: 'The inspection already covers the faculty complaint.', leadUnit: 'RB-WR', user: u('u1') })
    expect(d.auditRef).toMatch(/^#\d+$/)

    const after = await api.dashboard()
    expect(after.overlapsAwaiting).toBe(mid.overlapsAwaiting - 1)

    // The case's Proof Trail now shows the decision, stamped with the officer's initials.
    const c = await api.case(r.caseId, u('u1'))
    expect(c.proof.find((s) => s.key === 'coordinated')).toMatchObject({ state: 'confirmed', initials: 'AR' })
    // Decisions never change owner or stage.
    expect(c.ownerUnit).toBe('PGRC')
    expect(c.lifecycle).toBe('received')
  })

  it('"needs more review" keeps the overlap open', async () => {
    const ov = await api.overlaps()
    const a = ov.open.find((x) => x.units.includes('LEGAL'))!
    await api.decide({ alertId: a.id, decision: 'request_further_review', reason: 'Need the court order first.', user: u('u3') })
    const again = await api.overlaps()
    // Still open (not decided). It shows as late here because the Hooghly overlap is past its decision date.
    expect(again.open.some((x) => x.id === a.id && x.state !== 'decided')).toBe(true)
    expect(again.decided.some((x) => x.id === a.id)).toBe(false)
  })

  it('an institution replies through its one-time link; the case gets the documents but its stage does not change', async () => {
    const list = await api.cases({ lifecycle: 'awaiting_party', unit: 'PGRC' })
    const target = list.items.find((x) => x.institutionId) ?? (await api.cases({ unit: 'PGRC', lifecycle: 'active' })).items.find((x) => x.institutionId)!
    const req = await api.requestReply(target.id, { askedFor: 'Your reply to the notice.', dueOn: '2026-11-06' }, u('u1'))
    const info = await api.replyInfo(req.token)
    expect(info.state).toBe('waiting')
    expect(Object.keys(info)).not.toContain('complainant')
    const sha = 'a'.repeat(64)
    const rec = await api.submitReply(req.token, { note: 'Attached.', files: [{ name: 'reply.pdf', size: 1000, type: 'application/pdf', sha256: sha }] })
    expect(rec.receipt).toMatch(/^RPL-/)
    await expect(api.submitReply(req.token, { note: 'again', files: [] })).rejects.toThrow(/already/)
    const c = await api.case(target.id, u('u1'))
    expect(c.documents?.some((d) => d.sha256 === sha)).toBe(true)
    expect(c.lifecycle).toBe(target.lifecycle)
  })

  it('only the owning unit sees the complainant, and each view is audited', async () => {
    const c = (await api.cases({ unit: 'PGRC' })).items[0]
    await expect(api.sensitive(c.id, u('u2'))).rejects.toThrow(/Only officers of PGRC/)
    await expect(api.sensitive(c.id, u('u7'))).rejects.toThrow()
    const s = await api.sensitive(c.id, u('u1'))
    const log = await api.auditLog({ action: 'Complainant details viewed' })
    expect(log.rows[0].entity).toBe(c.uid)
    expect(s.auditRef).toBe(`#${log.rows[0].seq}`)
  })

  it('an import adds new cases, updates known ones, holds back bad rows, and the counts add up', async () => {
    const rows = [
      { source_reference: 'PGRC/2026/9001', received_on: '2026-10-20', channel: 'CPGRAMS', category: 'fee_refund', local_status: 'Registered on CPGRAMS', institution_name: 'Gomti College of Engineering', permanent_id: '', current_id: '', complaint_ref: '', summary: 'Refund' },
      { source_reference: 'PGRC/2026/9002', received_on: '2027-01-01', channel: 'CPGRAMS', category: 'fee_refund', local_status: 'Registered on CPGRAMS', institution_name: 'X', permanent_id: '', current_id: '', complaint_ref: '', summary: '' },
    ]
    const b = await api.importCommit('PGRC', 'test.csv', rows, u('u6'))
    expect(b.created + b.updated + b.rejected).toBe(b.rows)
    expect(b.rejected).toBe(1)
    expect(b.rejects[0].fix).toBeTruthy()
  })

  it('after everything, every number still agrees with its recount and the audit chain is intact', async () => {
    expect((await api.dataHealth()).numbers.every((n) => n.ok)).toBe(true)
    expect((await api.auditLog({})).check.ok).toBe(true)
  })
})
