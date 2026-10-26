// Deterministic SYNTHETIC fixtures. Fictional institutions only. Never imported by components — only by lib/api.ts.
import type { Case, CaseEvent, Channel, Institution, Lifecycle, Unit } from '../types'
import { addDays } from '../logic'

// Fixed demo date, so every count, deadline and overlap in the demo is the same on every run.
export const TODAY = '2026-10-23'
const ago = (n: number) => addDays(TODAY, -n)

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = rng(42)
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rand() * a.length)]

export const REGIONS = ['Central', 'Eastern', 'North-West', 'Northern', 'South-Central', 'South-West', 'Southern', 'Western'] as const
const RB_CODE: Record<string, string> = {
  Central: 'RB-CR', Eastern: 'RB-ER', 'North-West': 'RB-NWR', Northern: 'RB-NR',
  'South-Central': 'RB-SCR', 'South-West': 'RB-SWR', Southern: 'RB-SR', Western: 'RB-WR',
}

export const UNITS: Unit[] = [
  { code: 'PGRC', name: 'Public Grievance Redressal Cell', kind: 'grievance_cell' },
  ...REGIONS.map((r): Unit => ({ code: RB_CODE[r], name: `Regulation Bureau — ${r}`, kind: 'regulation_bureau', region: r })),
  { code: 'RO-WR', name: 'Regional Office — Western (Mumbai)', kind: 'regional_office', region: 'Western' },
  { code: 'LEGAL', name: 'Legal Cell', kind: 'other_cell' },
]

export const CATEGORIES = [
  'norm_violation', 'evc_deficiency', 'court_matter', 'compliance_verification',
  'ragging', 'fee_refund', 'faculty_salary', 'admission', 'other',
] as const

// Each unit's OWN status wording (local_status). The common stage names live in lib/labels.ts.
// Units word the same stages differently, which is the problem the status mapping solves. "Kept in abeyance" is deliberately absent
// from every list, so an import that uses it shows the "new status word" path.
type Words = Record<Lifecycle, string>
const W_PGRC: Words = { received: 'Registered on CPGRAMS', under_examination: 'Comments sought', awaiting_party: 'Report awaited from institution', inspection_hearing: 'Referred for regulatory action', transferred: 'Forwarded', escalated: 'Placed before higher authority', disposed: 'Disposed of' }
const W_RB_A: Words = { received: 'File put up', under_examination: 'Under scrutiny', awaiting_party: 'SCN issued', inspection_hearing: 'EVC / SHC stage', transferred: 'Forwarded', escalated: 'Placed before Approval Bureau', disposed: 'Disposed of' }
const W_RB_B: Words = { received: 'Received in bureau', under_examination: 'Under examination', awaiting_party: 'Show-cause notice issued', inspection_hearing: 'Hearing fixed', transferred: 'Sent to competent unit', escalated: 'Referred to higher authority', disposed: 'Closed – NFA' }
const W_RO: Words = { received: 'Diary entry made', under_examination: 'Field verification', awaiting_party: 'Compliance sought', inspection_hearing: 'Visit or hearing fixed', transferred: 'Forwarded', escalated: 'Referred to head office', disposed: 'Filed' }
const W_LEGAL: Words = { received: 'Case opened', under_examination: 'Comments being prepared', awaiting_party: 'Parawise comments awaited', inspection_hearing: 'Listed before court', transferred: 'Handed to counsel', escalated: 'Placed before the Member Secretary', disposed: 'Matter concluded' }
export const UNIT_STATUS: Record<string, Words> = {
  PGRC: W_PGRC, 'RO-WR': W_RO, LEGAL: W_LEGAL,
  'RB-WR': W_RB_A, 'RB-NR': W_RB_A, 'RB-SR': W_RB_A, 'RB-SCR': W_RB_A,
  'RB-CR': W_RB_B, 'RB-ER': W_RB_B, 'RB-NWR': W_RB_B, 'RB-SWR': W_RB_B,
}
export const localStatusFor = (unit: string, lc: Lifecycle): string => (UNIT_STATUS[unit] ?? W_RB_A)[lc]

// Offices work Monday to Saturday; Sundays and these dates are skipped when a hearing, visit or reply date is fixed. Prototype setting.
export const HOLIDAYS = ['2026-11-08', '2026-11-24', '2026-12-25']
const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay()
export const isWorkingDay = (d: string) => dow(d) !== 0 && !HOLIDAYS.includes(d)
/** The first working day on or after `d`. */
export const workday = (d: string): string => { let x = d; while (!isWorkingDay(x)) x = addDays(x, 1); return x }

// ---------- Institutions ----------
const CITIES: Record<string, [string, string, string, string][]> = {
  Central: [['Madhya Pradesh', 'Bhopal', '462001', 'Vindhya'], ['Chhattisgarh', 'Raipur', '492001', 'Mahanadi']],
  Eastern: [['West Bengal', 'Kolkata', '700001', 'Hooghly'], ['Odisha', 'Bhubaneswar', '751001', 'Utkal']],
  'North-West': [['Rajasthan', 'Jaipur', '302001', 'Aravali'], ['Rajasthan', 'Jodhpur', '342001', 'Marwar']],
  Northern: [['Uttar Pradesh', 'Lucknow', '226001', 'Gomti'], ['Delhi', 'New Delhi', '110001', 'Yamuna']],
  'South-Central': [['Telangana', 'Hyderabad', '500001', 'Deccan'], ['Andhra Pradesh', 'Vijayawada', '520001', 'Krishna']],
  'South-West': [['Karnataka', 'Bengaluru', '560001', 'Malnad'], ['Karnataka', 'Mysuru', '570001', 'Chamundi']],
  Southern: [['Tamil Nadu', 'Chennai', '600001', 'Nilgiri'], ['Kerala', 'Kochi', '682001', 'Malabar']],
  Western: [['Maharashtra', 'Pune', '411001', 'Sahyadri'], ['Gujarat', 'Ahmedabad', '380001', 'Sabarmati']],
}
const SUFFIX = ['Institute of Technology', 'College of Engineering', 'Polytechnic', 'Institute of Management']

export const INSTITUTIONS: Institution[] = []
let pidSeq = 2200100
const addInst = (name: string, region: string, c: [string, string, string, string], type: string, extra: Institution['identifiers'] = []) => {
  pidSeq += 137 + Math.floor(rand() * 90)
  const id = `inst-${INSTITUTIONS.length + 1}`
  INSTITUTIONS.push({ id, permanentId: `1-${pidSeq}`, name, type, region, state: c[0], district: c[1], pin: c[2], identifiers: extra })
  return id
}
for (const region of REGIONS) {
  CITIES[region].forEach((c, ci) => {
    SUFFIX.forEach((s, si) => {
      const name = `${c[3]} ${s}`
      const ids: Institution['identifiers'] = []
      if ((ci + si) % 2 === 0) ids.push({ type: 'current_id', value: `1-${2300000 + INSTITUTIONS.length * 41}`, verified: true })
      if ((ci + si) % 3 === 0) ids.push({ type: 'aishe_code', value: `C-${40000 + INSTITUTIONS.length * 7}`, verified: true })
      addInst(name, region, c, s.includes('Polytechnic') ? 'Polytechnic' : s.includes('Management') ? 'Management' : 'Engineering', ids)
    })
  })
}
// Decoys: near-identical names in the same district (must yield a ranked list, never an auto-link)
addInst('Malnad Polytechnic College', 'South-West', ['Karnataka', 'Bengaluru', '560001', 'Malnad'], 'Polytechnic')
addInst('Malnad Polytechnic Institute', 'South-West', ['Karnataka', 'Bengaluru', '560034', 'Malnad'], 'Polytechnic')

const instByName = (n: string) => INSTITUTIONS.find((i) => i.name === n)!
const hero = instByName('Sahyadri Institute of Technology')
hero.identifiers.push({ type: 'current_id', value: '1-2201455', verified: true })

// ---------- Cases ----------
// Dealing officers per unit (fictional). The sign-in names (Anjali Rao, Suresh Iyer, Meher Khan, ...) only ever appear in roles they hold.
// Nodal officers (Anjali Rao, Suresh Iyer, ...) supervise and never own cases, so they are not on this list.
const ROSTER: Record<string, string[]> = {
  PGRC: ['Pradeep Nair', 'Kiran Bose', 'Meena Chawla'], 'RB-WR': ['Neha Kulkarni', 'Sanjay Patil', 'Tushar Gaikwad'], 'RB-CR': ['Alok Verma', 'Sunita Bhatt'],
  'RB-ER': ['Debashis Sen', 'Moumita Ghosh'], 'RB-NWR': ['Rajendra Meena', 'Kavita Joshi'], 'RB-NR': ['Harish Tiwari', 'Farah Siddiqui'],
  'RB-SCR': ['Venkat Reddy', 'Lakshmi Prasad'], 'RB-SWR': ['Girish Hegde', 'Anitha Shetty'], 'RB-SR': ['Murali Krishnan', 'Deepa Raman'],
  'RO-WR': ['Prakash Desai', 'Rina Shah'], LEGAL: ['Mahesh Pillai', 'Sneha Kapoor'],
}
const officerOf = (unit: string) => pick(ROSTER[unit] ?? ROSTER.PGRC)
/** Hearings and Expert Visit Committee visits belong to the Bureau / Regional Office route. PGRC only examines, seeks comments, replies and forwards. */
const hasHearings = (unit: string) => unit !== 'PGRC'
let seq = 0
const inst = (id: string) => INSTITUTIONS.find((i) => i.id === id)!
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dm = (d: string) => `${Number(d.slice(8, 10))} ${MON[Number(d.slice(5, 7)) - 1]}`
const limitOf = (ch: Channel) => (ch === 'CPGRAMS' ? 21 : 30)

// Non-personal summaries, three variants per category so the register reads like a real one.
const SUMMARY: Record<string, string[]> = {
  norm_violation: ['Alleged faculty shortfall in the Civil department; the complaint cites a student-teacher ratio of 1:30.', 'Alleged intake beyond the approved seats in the first-year batch.', 'Alleged running of an unapproved course alongside the approved programmes.'],
  evc_deficiency: ['Expert Visit Committee noted laboratory and library deficiencies; compliance sought.', 'EVC report records built-up area below the approved norm; reply sought.', 'EVC found the workshop equipment short of the prescribed list.'],
  court_matter: ['Writ petition against a closure order; reply to be filed.', 'Court notice on a service matter of a faculty member; parawise comments called for.', 'Petition on the refusal of an extension of approval.'],
  compliance_verification: ['Annual compliance verification of faculty and infrastructure pending.', 'Verification of the affidavit filed with the extension of approval.', 'Verification of the mandatory disclosure on the institution website.'],
  ragging: ['Complaint of ragging in a hostel; anti-ragging committee report awaited.', 'Complaint that the anti-ragging affidavit was not collected from new students.', 'Report of ragging in a first-year batch; the institution has been asked for its action-taken report.'],
  fee_refund: ['Refund of fees not processed although the student withdrew before the cut-off date.', 'Fee collected above the approved fee structure; refund of the excess sought.', 'Original certificates withheld until a fee demand is paid.'],
  faculty_salary: ['Faculty report salaries unpaid for three months.', 'Pay below the prescribed scale for assistant professors alleged.', 'Provident fund deductions not deposited, as alleged by staff.'],
  admission: ['Admission above the approved intake alleged; merit list questioned.', 'Admission without a valid entrance-test score alleged.', 'Seats shown as vacant while admission was denied to an eligible candidate.'],
  other: ['General grievance about services at the institution.', 'Request for the status of an application for approval.', 'Query on the validity of a programme advertised by the institution.'],
}
const LAST_ACTION = ['Comments called for from the institution', 'File noted and put up to the officer', 'Reminder sent to the institution', 'Documents received and checked']

interface Opt extends Partial<Case> { inst?: string | null; unit: string; age: number; lc: Lifecycle; actionAgo?: number }
/** What happens next, by stage and channel. Short, specific, and in the unit's own voice. */
function nextActionFor(o: { lc: Lifecycle; channel: Channel; hasOfficer: boolean; scheduled?: { on: string; what: string } }): string {
  switch (o.lc) {
    case 'received': return o.hasOfficer ? 'Acknowledge the case and call for comments' : 'Assign a dealing officer'
    case 'under_examination': return o.channel === 'CPGRAMS' ? 'Send interim reply (CPGRAMS day 18)' : 'Seek comments from the institution'
    case 'awaiting_party': return o.scheduled ? `Await the institution’s reply due ${dm(o.scheduled.on)}` : 'Await the institution’s reply'
    case 'inspection_hearing': return o.scheduled ? `${o.scheduled.what} on ${dm(o.scheduled.on)}` : 'Await the EVC report'
    case 'escalated': return 'Await the decision of the higher authority'
    default: return '—'
  }
}
function mk(o: Opt): Case {
  seq += 1
  const received = ago(o.age)
  const lastOn = o.lc === 'received' ? received : ago(Math.min(o.age, o.actionAgo ?? Math.floor(rand() * Math.min(o.age, 14))))
  const i = o.inst ? inst(o.inst) : undefined
  const recName = o.recorded?.name ?? i?.name ?? 'Unknown'
  const channel = o.channel ?? 'EMAIL_POST'
  const category = o.category ?? pick(CATEGORIES)
  const officer = o.lc === 'received' && o.age <= 3 ? undefined : o.officer ?? officerOf(o.unit)
  const open = o.lc !== 'disposed' && o.lc !== 'transferred'
  // The next dated step: a reply the institution owes, or a hearing or visit, in the next few weeks.
  const sched0 = o.scheduled ?? (o.lc === 'awaiting_party' ? { on: addDays(TODAY, 2 + Math.floor(rand() * 10)), what: 'Institution reply due' }
    : o.lc === 'inspection_hearing' ? { on: addDays(TODAY, 3 + Math.floor(rand() * 21)), what: pick(['SHC hearing', 'EVC visit']) } : undefined)
  // Dated steps fall on working days only.
  const scheduled = sched0 && { ...sched0, on: workday(sched0.on) }
  const events: CaseEvent[] = [{ type: 'created', at: received, actor: o.unit, text: `Case registered in ${o.unit}` }]
  if (o.lc !== 'received') events.push({ type: 'status_changed', at: addDays(received, 2), actor: officer ?? o.unit, text: `Status → ${localStatusFor(o.unit, o.lc)}` })
  if (o.lc === 'transferred') events.push({ type: 'transferred', at: lastOn, actor: o.unit, text: 'Forwarded to the competent unit (history retained)' })
  if (o.lc === 'escalated') events.push({ type: 'escalated', at: lastOn, actor: o.unit, text: 'Placed before higher authority' })
  if (o.lc === 'disposed') events.push({ type: 'disposed', at: lastOn, actor: officer ?? officerOf(o.unit), text: 'Final action recorded' })
  const lastAction = o.lastAction ?? (o.lc === 'received' ? 'Registered' : pick(LAST_ACTION))
  const newest = events.reduce((m, e) => (e.at > m ? e.at : m), received)
  if (lastOn > newest && o.lc !== 'disposed' && o.lc !== 'transferred' && o.lc !== 'escalated') events.push({ type: 'action_recorded', at: lastOn, actor: officer ?? o.unit, text: lastAction })
  const resolved = !!i && o.matchState !== 'pending_review' && o.matchState !== 'unresolved'
  if (resolved) events.push({ type: 'match_resolved', at: received, actor: 'system', text: o.matchMethod === 'T2_crosswalk' ? 'Institution matched automatically using a verified alternate ID' : 'Institution matched automatically by Permanent ID' })
  return {
    id: `c${seq}`,
    uid: `CC-2026-${String(seq).padStart(6, '0')}`,
    sourceUnit: o.unit,
    ownerUnit: o.unit,
    sourceRef: o.sourceRef ?? `${o.unit}/${2026 - (o.age > 300 ? 1 : 0)}/${1000 + seq}`,
    // CPGRAMS cases carry a registration number in the CPGRAMS style (synthetic, like everything here).
    sourceComplaintRef: o.sourceComplaintRef ?? (channel === 'CPGRAMS' ? `DARPG/E/2026/${String(100 + seq * 3).padStart(4, '0')}` : undefined),
    channel,
    receivedOn: received,
    category,
    summary: o.summary ?? pick(SUMMARY[category] ?? SUMMARY.other),
    localStatus: localStatusFor(o.unit, o.lc),
    lifecycle: o.lc,
    officer,
    lastAction,
    lastActionOn: lastOn,
    nextAction: open ? o.nextAction ?? nextActionFor({ lc: o.lc, channel, hasOfficer: !!officer, scheduled }) : '—',
    institutionId: resolved ? o.inst! : null,
    recorded: o.recorded ?? { name: recName },
    matchState: o.matchState ?? 'resolved_auto',
    matchMethod: resolved ? (o.matchMethod ?? 'T1_exact') : undefined,
    matchEvidence: o.matchEvidence ?? (resolved ? ['Recorded Permanent ID matches the institution exactly'] : []),
    sensitive: { complainant: `Synthetic Complainant ${seq}`, narrative: 'Synthetic narrative — restricted to the owning unit.' },
    events: events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)),
    ...(open && scheduled ? { scheduled } : {}),
  }
}

export const CASES: Case[] = []
const push = (o: Opt) => { CASES.push(mk(o)) }

// Scripted institutions (get hand-written cases, skipped by the random generator)
const scripted = new Set<string>()
const script = (name: string) => { const i = instByName(name); scripted.add(i.id); return i.id }

// S1 — demo story: RB-WR case in inspection_hearing + new PGRC CPGRAMS case resolved by Current ID (T2) → O1 + O4 (and O3, same category)
{
  const id = script('Sahyadri Institute of Technology')
  push({ inst: id, unit: 'RB-WR', age: 24, lc: 'inspection_hearing', category: 'norm_violation', channel: 'APH_COMPLAINT', officer: 'Neha Kulkarni', actionAgo: 6,
    scheduled: { on: addDays(TODAY, 9), what: 'SHC hearing' },
    summary: 'Complaint on faculty strength below norms; EVC visit conducted.', lastAction: 'EVC report received', nextAction: 'Hearing before SHC' })
  push({ inst: id, unit: 'PGRC', age: 5, lc: 'under_examination', category: 'norm_violation', channel: 'CPGRAMS', officer: 'Pradeep Nair', actionAgo: 2,
    sourceComplaintRef: 'DARPG/E/2026/0481', summary: 'Public grievance alleging inadequate faculty and lab facilities.',
    recorded: { name: 'Sahyadri Inst. of Tech, Pune', district: 'Pune', ids: 'Current ID 1-2201455' },
    matchMethod: 'T2_crosswalk',
    matchEvidence: ['No Permanent ID recorded', 'Recorded Current ID 1-2201455 matches a verified identifier of this institution (T2 crosswalk)', 'Name variant: “Sahyadri Inst. of Tech” → “Sahyadri Institute of Technology”'] })
}
// S2 — O3 only: same category in two units; the other unit closed its case two months ago
{
  const id = script('Gomti College of Engineering')
  push({ inst: id, unit: 'PGRC', age: 8, lc: 'under_examination', category: 'fee_refund', channel: 'CPGRAMS', summary: 'Refund of fees not processed although the student withdrew before the cut-off date.' })
  push({ inst: id, unit: 'RB-NR', age: 140, lc: 'disposed', category: 'fee_refund', channel: 'CSS', actionAgo: 60, summary: 'Earlier refund complaint, closed with a direction to refund.' })
}
// S3 — O1 + O5 + O4: the same CPGRAMS number held by PGRC and the Bureau (forwarded for regulatory examination, so not a CPGRAMS case there)
{
  const id = script('Aravali Institute of Management')
  push({ inst: id, unit: 'PGRC', age: 14, lc: 'under_examination', category: 'admission', channel: 'CPGRAMS', sourceComplaintRef: 'DARPG/E/2026/0377', officer: 'Pradeep Nair', summary: 'Admission above the approved intake alleged; merit list questioned.' })
  push({ inst: id, unit: 'RB-NWR', age: 5, lc: 'inspection_hearing', category: 'admission', channel: 'OTHER', sourceComplaintRef: 'DARPG/E/2026/0377', officer: 'Rajendra Meena',
    scheduled: { on: addDays(TODAY, 6), what: 'EVC visit' }, summary: 'Grievance DARPG/E/2026/0377 forwarded by PGRC for regulatory examination; EVC visit fixed.' })
}
// S4 — O2: same institution, different issues (should be judged not_related)
{
  const id = script('Hooghly Polytechnic')
  push({ inst: id, unit: 'LEGAL', age: 22, lc: 'under_examination', category: 'court_matter', channel: 'COURT', summary: 'Writ petition about a service dispute; parawise comments being prepared.' })
  push({ inst: id, unit: 'RB-ER', age: 20, lc: 'awaiting_party', category: 'compliance_verification', channel: 'APH_COMPLAINT', scheduled: { on: addDays(TODAY, 7), what: 'Institution reply due' }, summary: 'Annual compliance verification pending; documents sought from the institution.' })
}
// S5 — a Regional Office hearing at an institution PGRC is also dealing with
{
  const id = script('Sabarmati Polytechnic')
  push({ inst: id, unit: 'PGRC', age: 11, lc: 'awaiting_party', category: 'compliance_verification', channel: 'CPGRAMS', officer: 'Pradeep Nair', scheduled: { on: addDays(TODAY, 4), what: 'Institution reply due' }, summary: 'Grievance on the compliance status of the diploma programmes.' })
  push({ inst: id, unit: 'RO-WR', age: 3, lc: 'inspection_hearing', category: 'compliance_verification', channel: 'APH_COMPLAINT', officer: 'Prakash Desai', actionAgo: 2,
    scheduled: { on: addDays(TODAY, 10), what: 'Compliance review hearing' }, summary: 'Hearing fixed for a compliance review of the diploma programmes.', lastAction: 'Hearing date fixed' })
}

// Random background load: one home unit per institution, mostly single-unit (so overlaps are rare, as in reality).
// Open cases are mostly on time: about 78% well inside the limit, 14% close to it and 8% past it.
const STATUS_W: Lifecycle[] = ['received', 'under_examination', 'under_examination', 'awaiting_party', 'inspection_hearing', 'escalated', 'disposed', 'disposed', 'disposed', 'transferred']
const PG_CHANNELS: Channel[] = ['CPGRAMS', 'CPGRAMS', 'CPGRAMS', 'CSS', 'EMAIL_POST', 'VIP_MINISTRY', 'RTI']
const RB_CHANNELS: Channel[] = ['APH_COMPLAINT', 'APH_COMPLAINT', 'EMAIL_POST', 'CSS', 'COURT']
let openIdx = 0
/** Deterministic mix for open cases: about 7% past the limit, 18% close to it, the rest well inside. Escalated cases are always late in the clock. */
function openAge(limit: number, lc: Lifecycle): number {
  openIdx += 1
  if (lc === 'escalated') return Math.ceil(limit * 0.5) + Math.floor(rand() * (limit * 0.4))
  if (openIdx % 7 === 5) return limit + 1 + Math.floor(rand() * 14)
  if (openIdx % 9 === 2) return Math.ceil(limit * 0.75) + Math.floor(rand() * (limit * 0.25))
  return 2 + Math.floor(rand() * (limit * 0.7 - 2))
}
for (const i of INSTITUTIONS) {
  if (scripted.has(i.id) || i.name.startsWith('Malnad Polytechnic')) continue
  const home = rand() < 0.35 ? 'PGRC' : RB_CODE[i.region]
  const n = 1 + Math.floor(rand() * 3)
  for (let k = 0; k < n; k++) {
    let lc = pick(STATUS_W)
    if (!hasHearings(home) && lc === 'inspection_hearing') lc = 'awaiting_party'
    const channel = pick(home === 'PGRC' ? PG_CHANNELS : RB_CHANNELS)
    const open = lc !== 'disposed' && lc !== 'transferred'
    const age = open ? openAge(limitOf(channel), lc) : 20 + Math.floor(rand() * 130)
    const category = channel === 'COURT' ? 'court_matter' : channel === 'RTI' ? 'other' : undefined
    // Closed cases took a realistic time to close: most CPGRAMS ones inside the 21 days.
    const took = channel === 'CPGRAMS' ? (rand() < 0.85 ? 8 + Math.floor(rand() * 12) : 23 + Math.floor(rand() * 20)) : 10 + Math.floor(rand() * 40)
    push({ inst: i.id, unit: home, age, lc, channel, category, actionAgo: open ? undefined : Math.max(0, age - took) })
  }
}

// Unresolved cases for the matching queue (no Permanent ID recorded; names only)
const unresolved: [string, string, string | undefined, string | undefined][] = [
  ['Gomti Coll of Engg', 'PGRC', 'Lucknow', undefined],
  ['Nilgiri Inst. of Tech.', 'PGRC', 'Chennai', '600001'],
  ['Malnad Polytechnic', 'PGRC', 'Bengaluru', '560001'],
  ['Deccan Institute Mgmt, Hyderabad', 'RB-SCR', 'Hyderabad', undefined],
  ['Sabarmati College of Engineering & Technology Trust', 'PGRC', 'Ahmedabad', '380001'],
]
unresolved.forEach(([name, unit, district, pin], k) => {
  push({ inst: null, unit, age: 3 + k * 2, lc: 'received', channel: unit === 'PGRC' ? 'CPGRAMS' : 'APH_COMPLAINT', matchState: 'pending_review', recorded: { name, district, pin }, category: k === 0 ? 'norm_violation' : 'other',
    summary: 'Institution recorded by name only; awaiting confirmation.', nextAction: 'Confirm the institution before the overlap check can run' })
})
// A name that matches nothing, to show the "left unmatched" path
push({ inst: null, unit: 'PGRC', age: 5, lc: 'received', channel: 'CPGRAMS', matchState: 'unresolved', recorded: { name: 'Shree Gyan Sagar Vidyapeeth' }, summary: 'Cannot be matched to any known institution.', nextAction: 'Confirm the institution before the overlap check can run' })

// Hours since each unit last sent data. RB-SWR is deliberately stale (> 24 h) to show the freshness warning.
export const SOURCE_SYNC = [
  { unit: 'PGRC', lastImportHoursAgo: 3 },
  ...REGIONS.map((r, i) => ({ unit: RB_CODE[r], lastImportHoursAgo: i === 5 ? 52 : 4 + i * 2 })),
  { unit: 'RO-WR', lastImportHoursAgo: 6 },
  { unit: 'LEGAL', lastImportHoursAgo: 20 },
]
