// Plain-language search. Turns "overdue cpgrams cases in western region this month" into case filters,
// and "1-2201455" or "CC-2026-000002" into a direct jump. Rule-based and local: no external AI.
import { addDays } from './logic'
import type { CaseFilters } from './types'

export interface AskIndex {
  today: string
  units: string[]
  regions: string[]
  institutions: { id: string; name: string; permanentId: string }[]
  cases: { id: string; uid: string }[]
}
export interface Chip { key: keyof CaseFilters | 'channel'; label: string }
export interface AskResult {
  filters: CaseFilters & { channel?: string }
  chips: Chip[]
  jumps: { to: string; label: string; hint: string }[]
}

const REGION_ALIASES: [RegExp, string][] = [
  [/\bnorth[\s-]?west(ern)?\b|\bnwr\b/, 'North-West'],
  [/\bsouth[\s-]?central\b|\bscr\b/, 'South-Central'],
  [/\bsouth[\s-]?west(ern)?\b|\bswr\b/, 'South-West'],
  [/\bnorth(ern)?\b/, 'Northern'],
  [/\bsouth(ern)?\b/, 'Southern'],
  [/\beast(ern)?\b/, 'Eastern'],
  [/\bwest(ern)?\b/, 'Western'],
  [/\bcentral\b/, 'Central'],
]
const CATEGORY_ALIASES: [RegExp, string, string][] = [
  [/\bragging\b/, 'ragging', 'Ragging'],
  [/\bfees?\b|\brefunds?\b/, 'fee_refund', 'Fee or refund'],
  [/\bcourt\b|\bwrit\b|\blegal matter\b/, 'court_matter', 'Court matter'],
  [/\badmissions?\b/, 'admission', 'Admission'],
  [/\bfaculty\b|\bsalar(y|ies)\b/, 'faculty_salary', 'Faculty or salary'],
  [/\bnorms?\b|\bviolations?\b/, 'norm_violation', 'Norm violation'],
  [/\bevc\b|\binspection deficienc/, 'evc_deficiency', 'EVC deficiency'],
  [/\bcompliance\b/, 'compliance_verification', 'Compliance verification'],
]
const STATUS_ALIASES: [RegExp, Partial<CaseFilters>, string][] = [
  [/\boverdue\b|\blate\b|\bdelayed\b|\bpast (the )?deadline\b|\bbeyond timeline\b/, { deadline: 'overdue' }, 'Overdue'],
  [/\bdue soon\b|\bapproaching\b|\bnearing\b/, { deadline: 'approaching' }, 'Due soon'],
  [/\bescalated\b/, { lifecycle: 'escalated' }, 'Escalated'],
  [/\bdisposed\b|\bclosed\b|\bresolved\b/, { lifecycle: 'disposed' }, 'Disposed'],
  [/\btransferred\b|\bforwarded\b/, { lifecycle: 'transferred' }, 'Transferred'],
  [/\bnew\b|\bpending\b|\bunassigned\b|\bfresh\b/, { lifecycle: 'pending' }, 'New'],
  [/\bin progress\b|\bunder process\b|\bongoing\b/, { lifecycle: 'under_process' }, 'Under process'],
  [/\bopen\b|\bactive\b/, { lifecycle: 'active' }, 'Open'],
  [/\bunmatched\b|\bno institution\b|\bnot matched\b/, { match: 'unresolved' }, 'Not matched yet'],
]
const STOP = /\b(show|me|all|any|the|cases?|files?|complaints?|in|of|with|for|from|to|at|on|and|which|are|that|about|region|unit|cell|bureau|please|list|find|give|institutions?|received)\b/g

export function ask(input: string, idx: AskIndex): AskResult {
  let t = ` ${input.toLowerCase().trim()} `
  const filters: AskResult['filters'] = {}
  const chips: Chip[] = []
  const jumps: AskResult['jumps'] = []
  const take = (re: RegExp) => { const m = t.match(re); if (m) t = t.replace(re, ' '); return m }

  // Direct jumps: case numbers and Permanent IDs
  const uid = take(/\bcc-?\s?(\d{4})-?\s?(\d{1,6})\b/)
  if (uid) {
    const want = `CC-${uid[1]}-${uid[2].padStart(6, '0')}`
    const c = idx.cases.find((x) => x.uid === want)
    if (c) jumps.push({ to: `/cases/${c.id}`, label: c.uid, hint: 'Open case' })
  }
  const pid = take(/\b1-\d{5,12}\b/)
  if (pid) {
    const i = idx.institutions.find((x) => x.permanentId === pid[0])
    if (i) jumps.push({ to: `/institutions/${i.id}`, label: i.name, hint: `Permanent ID ${i.permanentId}` })
  }

  for (const u of idx.units) {
    const re = new RegExp(`\\b${u.toLowerCase().replace('-', '[\\s-]?')}\\b`)
    if (take(re)) { filters.unit = u; chips.push({ key: 'unit', label: u }); break }
  }
  if (!filters.unit && take(/\bgrievance\b|\bpgrc\b/)) { filters.unit = 'PGRC'; chips.push({ key: 'unit', label: 'PGRC' }) }
  if (take(/\bcpgrams\b/)) { filters.channel = 'CPGRAMS'; chips.push({ key: 'channel', label: 'From CPGRAMS' }) }

  for (const [re, region] of REGION_ALIASES) {
    if (idx.regions.includes(region) && take(re)) { filters.region = region; chips.push({ key: 'region', label: `${region} region` }); break }
  }
  for (const [re, code, label] of CATEGORY_ALIASES) {
    if (take(re)) { filters.category = code; chips.push({ key: 'category', label }); break }
  }
  for (const [re, f, label] of STATUS_ALIASES) {
    const k = Object.keys(f)[0] as keyof CaseFilters
    if (filters[k] === undefined && take(re)) { Object.assign(filters, f); chips.push({ key: k, label }) }
  }

  const days = take(/\b(?:last|past) (\d{1,3}) days?\b/)
  if (days) { filters.from = addDays(idx.today, -Number(days[1])); chips.push({ key: 'from', label: `Last ${days[1]} days` }) }
  else if (take(/\bthis week\b|\blast 7 days\b/)) { filters.from = addDays(idx.today, -7); chips.push({ key: 'from', label: 'Last 7 days' }) }
  else if (take(/\bthis month\b/)) { filters.from = idx.today.slice(0, 8) + '01'; chips.push({ key: 'from', label: 'This month' }) }
  else if (take(/\btoday\b/)) { filters.from = idx.today; chips.push({ key: 'from', label: 'Today' }) }

  const rest = t.replace(STOP, ' ').replace(/[^\w\s&.-]/g, ' ').replace(/\s+/g, ' ').trim()
  if (rest) {
    const hits = idx.institutions.filter((i) => i.name.toLowerCase().includes(rest))
    hits.slice(0, 4).forEach((i) => jumps.push({ to: `/institutions/${i.id}`, label: i.name, hint: `Permanent ID ${i.permanentId}` }))
    filters.q = rest
    chips.push({ key: 'q', label: `“${rest}”` })
  }
  return { filters, chips, jumps }
}

export const toQueryString = (f: AskResult['filters']) =>
  new URLSearchParams(Object.entries(f).filter(([, v]) => v !== undefined && v !== '') as [string, string][]).toString()
