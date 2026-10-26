// More SYNTHETIC fixtures: institution replies, past import receipts, hourly check history and the
// status words each unit already told us about. Only lib/api.ts imports this.
import { addDays, deadlineFor, isOpen } from '../logic'
import type { ImportBatch, JobRun, Lifecycle, ReplyRequest } from '../types'
import { CASES, TODAY, UNITS, UNIT_STATUS } from './data'

const caseBy = (summary: string) => CASES.find((c) => c.summary === summary)!

// ---------- Replies ----------
const hooghly = caseBy('Annual compliance verification pending; documents sought from the institution.')
// A reply already received, with two documents attached.
hooghly.documents = [
  { name: 'Compliance-report-2026.pdf', size: 482_113, type: 'application/pdf', sha256: '9f2c4e81a7b03d5566e1c09b2f4a8d7e3c1b6a0f5e9d2c8b7a6f4e3d2c1b0a99', from: 'institution', at: addDays(TODAY, -3) },
  { name: 'Faculty-list-signed.pdf', size: 210_448, type: 'application/pdf', sha256: '1a7b03d5566e1c09b2f4a8d7e3c1b6a0f5e9d2c8b7a6f4e3d2c1b0a999f2c4e8', from: 'institution', at: addDays(TODAY, -3) },
]
hooghly.events.push({ type: 'reply_requested', at: addDays(TODAY, -12), actor: 'Debashis Sen, RB-ER', text: 'Asked the institution for its compliance report' })
hooghly.events.push({ type: 'reply_received', at: addDays(TODAY, -3), actor: 'Institution', text: 'Reply received with 2 documents' })

// Two more open "waiting for reply" cases: one still in time, one past its reply date.
const waiting = CASES.filter((c) => c.lifecycle === 'awaiting_party' && c.institutionId && c.id !== hooghly.id).slice(0, 2)

export const REPLIES: ReplyRequest[] = [
  {
    id: 'r1', token: 'demo-hooghly-7Q2', caseId: hooghly.id, institutionId: hooghly.institutionId!, askedFor: 'Your annual compliance report and the signed list of faculty.',
    dueOn: addDays(TODAY, 2), createdBy: 'Debashis Sen, RB-ER', createdAt: addDays(TODAY, -12), state: 'received',
    submission: { at: addDays(TODAY, -3), note: 'Please find the compliance report and the faculty list, signed by the Principal.', files: hooghly.documents, late: false, sameFileElsewhere: [] },
  },
  ...waiting.map((c, i): ReplyRequest => ({
    id: `r${i + 2}`, token: `demo-reply-${i + 2}K9`, caseId: c.id, institutionId: c.institutionId!, askedFor: 'Your written reply to the notice, with supporting documents.',
    dueOn: addDays(TODAY, i === 0 ? 4 : -2), createdBy: `${c.officer ?? 'Officer'}, ${c.ownerUnit}`, createdAt: addDays(TODAY, i === 0 ? -10 : -16), state: 'waiting',
  })),
]
for (const r of REPLIES.slice(1)) CASES.find((c) => c.id === r.caseId)!.events.push({ type: 'reply_requested', at: r.createdAt, actor: r.createdBy, text: 'Asked the institution for a reply' })

// ---------- Status words each unit uses (local status -> common stage) ----------
export const STATUS_MAP: Record<string, Record<string, Lifecycle>> = Object.fromEntries(
  UNITS.map((u) => [u.code, Object.fromEntries(Object.entries(UNIT_STATUS[u.code]).map(([stage, word]) => [word.toLowerCase(), stage as Lifecycle]))]),
)

// ---------- Past imports ----------
export const IMPORTS: ImportBatch[] = [
  { id: 'b212', unit: 'PGRC', fileName: 'pgrc-weekly-2026-10-20.csv', by: 'Pradeep Nair, PGRC', at: `${addDays(TODAY, -3)}T10:12`, rows: 42, created: 31, updated: 9, rejected: 2,
    rejects: [
      { row: 14, field: 'Received on', problem: '“31-09-2026” is not a date we can read.', fix: 'Write it as YYYY-MM-DD, e.g. 2026-10-01.' },
      { row: 27, field: 'Permanent ID', problem: '“1-22O1455” does not look like a Permanent ID.', fix: 'It starts with 1- and then 5 to 12 digits. The letter O may be a zero.' },
    ], autoMatched: 38, namesToCheck: 2, newOverlaps: 1, caseIds: [] },
  { id: 'b211', unit: 'RB-WR', fileName: 'rb-wr-cases-oct.xlsx', by: 'Suresh Iyer, RB-WR', at: `${addDays(TODAY, -5)}T16:40`, rows: 18, created: 6, updated: 12, rejected: 0, rejects: [], autoMatched: 18, namesToCheck: 0, newOverlaps: 0, caseIds: [] },
  { id: 'b210', unit: 'RB-SWR', fileName: 'swr-export.csv', by: 'RB-SWR data entry', at: `${addDays(TODAY, -2)}T09:05`, rows: 25, created: 19, updated: 3, rejected: 3,
    rejects: [
      { row: 3, field: 'Status in your unit', problem: 'We do not know what “Kept in abeyance” means yet.', fix: 'Tell us once what it means and we will remember it.' },
      { row: 9, field: 'Received on', problem: 'This date is in the future.', fix: 'Check the date. A case cannot arrive after today.' },
      { row: 22, field: 'Institution name', problem: 'This is empty.', fix: 'Fill it in. As written in your file.' },
    ], autoMatched: 20, namesToCheck: 2, newOverlaps: 0, caseIds: [] },
  { id: 'b209', unit: 'LEGAL', fileName: 'legal-court-matters.csv', by: 'Legal Cell', at: `${addDays(TODAY, -1)}T12:30`, rows: 7, created: 2, updated: 5, rejected: 0, rejects: [], autoMatched: 7, namesToCheck: 0, newOverlaps: 0, caseIds: [] },
]

// ---------- Hourly checks: the last 24 runs ----------
const open = CASES.filter(isOpen)
const dl = open.map((c) => deadlineFor(c, TODAY))
export const JOB_RUNS: JobRun[] = Array.from({ length: 24 }, (_, i) => ({
  at: `${TODAY}T${String((23 - i + 24) % 24).padStart(2, '0')}:00`,
  checked: open.length,
  overdue: dl.filter((d) => d.state === 'overdue').length,
  dueSoon: dl.filter((d) => d.state === 'approaching').length,
  interim: dl.filter((d) => d.interimDue).length,
  escalated: dl.filter((d) => d.state === 'overdue' && -d.daysToDue >= 7).length,
}))
