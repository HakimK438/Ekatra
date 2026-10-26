// The same expectations as backend/tests/test_engines.py: the demo and the real API must tell the same story.
import { describe, expect, it } from 'vitest'
import { api } from './mock/mockApi'

const STORIES: Record<string, string> = {
  'Sahyadri Institute of Technology': 'Faculty and staff: PGRC received a CPGRAMS grievance on 18 Oct; RB-WR has the SHC hearing fixed for 2 Nov.',
  'Aravali Institute of Management': 'Admission process: RB-NWR was forwarded grievance DARPG/E/2026/0377 on 18 Oct and has the EVC visit fixed for 29 Oct; PGRC is examining its case.',
  'Sabarmati Polytechnic': 'Approval and compliance: RO-WR received an Approval process complaint on 20 Oct and has the Compliance review hearing fixed for 2 Nov; PGRC is waiting for the institution’s reply (due 27 Oct).',
  'Gomti College of Engineering': 'Fees and refunds: PGRC received a CPGRAMS grievance on 15 Oct; RB-NR closed a fee refund case on 24 Aug.',
}
describe('overlap stories', () => {
  it('match the backend word for word and say what really happened', async () => {
    const { open } = await api.overlaps()
    const got = Object.fromEntries(open.map((a) => [a.institution.name, a.story]))
    for (const [name, story] of Object.entries(STORIES)) expect(got[name]).toBe(story)
  })
})
