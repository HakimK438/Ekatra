// Reading and checking an import file, row by row, before anything is saved.
// Every problem says what is wrong and how to fix it, in plain words.
import { CHANNEL_LABEL, CATEGORY_LABEL } from './labels'
import type { Channel, CheckedRow, ImportReject, ImportRow, Lifecycle } from './types'

export const IMPORT_COLUMNS: { key: string; label: string; required: boolean; hint: string }[] = [
  { key: 'source_reference', label: 'Your reference', required: true, hint: 'The case number in your unit, e.g. PGRC/2026/1234' },
  { key: 'received_on', label: 'Received on', required: true, hint: 'Date as YYYY-MM-DD, e.g. 2026-10-01' },
  { key: 'channel', label: 'How it came in', required: true, hint: 'CPGRAMS, CSS, EMAIL_POST, APH_COMPLAINT, VIP_MINISTRY, COURT, RTI or OTHER' },
  { key: 'category', label: 'Category', required: true, hint: 'e.g. norm_violation, fee_refund, faculty_salary' },
  { key: 'local_status', label: 'Status in your unit', required: true, hint: 'Your own wording, e.g. Under scrutiny' },
  { key: 'institution_name', label: 'Institution name', required: true, hint: 'As written in your file' },
  { key: 'permanent_id', label: 'Permanent ID', required: false, hint: 'Best way to find the institution, e.g. 1-2201234' },
  { key: 'current_id', label: 'Current ID', required: false, hint: 'Used if there is no Permanent ID' },
  { key: 'complaint_ref', label: 'Complaint number', required: false, hint: 'e.g. the CPGRAMS registration number' },
  { key: 'summary', label: 'Short summary', required: false, hint: 'One line, no personal details' },
  { key: 'next_step_on', label: 'Next step on', required: false, hint: 'Date of the next hearing, visit or reply deadline as YYYY-MM-DD. It then appears on the calendar. Fill in with Next step' },
  { key: 'next_step', label: 'Next step', required: false, hint: 'What happens on that date, e.g. SHC hearing. Fill in with Next step on' },
]

/** Reads CSV text (quotes, commas inside quotes, CRLF). Column names are matched in lower case. */
export function parseCsv(text: string): ImportRow[] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') q = false
      else cell += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some((c) => c.trim())) rows.push(row)
      row = []
    } else cell += ch
  }
  row.push(cell)
  if (row.some((c) => c.trim())) rows.push(row)
  if (!rows.length) return []
  const head = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'))
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])))
}

export const toCsv = (rows: (string | number)[][]) =>
  rows.map((r) => r.map((v) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }).join(',')).join('\r\n')

export const templateCsv = () => toCsv([
  IMPORT_COLUMNS.map((c) => c.key),
  ['PGRC/2026/5001', '2026-10-20', 'CPGRAMS', 'faculty_salary', 'Under scrutiny', 'Sahyadri Institute of Technology', '', '1-2201455', 'DARPG/E/2026/0612', 'Faculty salaries unpaid for three months', '2026-11-12', 'Reply due from institution'],
  ['PGRC/2026/5002', '2026-10-21', 'EMAIL_POST', 'fee_refund', 'Registered', 'Gomti College of Engineering', '', '', '', 'Refund not paid after withdrawal', '', ''],
])

const PID = /^1-\d{5,12}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

export interface CheckContext {
  today: string
  /** Known (unit reference) values for this unit: a match means the row updates that case */
  existingRefs: Set<string>
  /** What a local status means, if this unit has told us before */
  mapStatus: (local: string) => Lifecycle | undefined
}

/** Check one row. Problems are listed per field, with a fix. A row with any problem is not saved. */
export function checkRow(data: ImportRow, row: number, ctx: CheckContext): CheckedRow {
  const problems: ImportReject[] = []
  const p = (field: string, problem: string, fix: string) => problems.push({ row, field, problem, fix })
  for (const c of IMPORT_COLUMNS) if (c.required && !data[c.key]) p(c.label, 'This is empty.', `Fill it in. ${c.hint}.`)
  const d = data.received_on
  if (d && (!DATE.test(d) || isNaN(new Date(d + 'T00:00:00').getTime()))) p('Received on', `“${d}” is not a date we can read.`, 'Write it as YYYY-MM-DD, e.g. 2026-10-01.')
  else if (d && d > ctx.today) p('Received on', 'This date is in the future.', 'Check the date. A case cannot arrive after today.')
  if (data.channel && !(data.channel.toUpperCase() in CHANNEL_LABEL)) p('How it came in', `“${data.channel}” is not a known source.`, 'Use one of: CPGRAMS, CSS, EMAIL_POST, APH_COMPLAINT, VIP_MINISTRY, COURT, RTI, OTHER.')
  if (data.category && !(data.category in CATEGORY_LABEL)) p('Category', `“${data.category}” is not a known category.`, 'Use a category code from the template, e.g. fee_refund.')
  if (data.permanent_id && !PID.test(data.permanent_id.replace(/\s+/g, '-').trim())) p('Permanent ID', `“${data.permanent_id}” does not look like a Permanent ID.`, 'It starts with 1- and then 5 to 12 digits, e.g. 1-2201234. Leave it empty if unknown.')
  if (data.local_status && !ctx.mapStatus(data.local_status)) p('Status in your unit', `We do not know what “${data.local_status}” means yet.`, 'Tell us once in the next step and we will remember it.')
  const nsOn = (data.next_step_on ?? '').trim(), nsWhat = (data.next_step ?? '').trim()
  if (nsOn || nsWhat) {
    if (!(nsOn && nsWhat)) p(nsOn ? 'Next step' : 'Next step on', 'Give both the date and what happens on it, or leave both empty.', 'Fill in Next step on and Next step together.')
    else {
      if (!DATE.test(nsOn) || isNaN(new Date(nsOn + 'T00:00:00').getTime())) p('Next step on', `“${nsOn}” is not a date we can read.`, 'Write it as YYYY-MM-DD, e.g. 2026-11-02.')
      else if (nsOn < ctx.today) p('Next step on', 'This date has already passed.', 'Give today or a later date. Past events are not put on the calendar.')
      if (nsWhat.length > 80) p('Next step', 'This is too long.', 'Keep it under 80 characters, e.g. SHC hearing.')
    }
  }
  return { row, data, outcome: problems.length ? 'reject' : ctx.existingRefs.has(data.source_reference) ? 'update' : 'new', problems, notes: [] }
}

export const isChannel = (s: string): s is Channel => s in CHANNEL_LABEL
