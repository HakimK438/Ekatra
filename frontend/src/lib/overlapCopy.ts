// Plain-language wording for overlap rules. Codes (O1…O5) stay available as a tooltip but are never the headline.
import type { Case, RuleCode, RuleFire } from './types'
import { mainIssue } from './issues'
import { CHANNEL_LABEL, categoryLabel } from './labels'

const PRIORITY: RuleCode[] = ['O5', 'O4', 'O1', 'O3', 'O2']

const list = (a: string[]) => (a.length <= 2 ? a.join(' and ') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`)

/** One short sentence, built from the most telling rule. */
export function overlapHeadline(rules: RuleFire[], units: string[]): string {
  const top = [...rules].sort((a, b) => PRIORITY.indexOf(a.code) - PRIORITY.indexOf(b.code))[0]?.code
  const u = list(units)
  switch (top) {
    case 'O5': return `${u} hold the same complaint.`
    case 'O4': return `A new case arrived during a pending hearing.`
    case 'O1': return `${u} are both working on this.`
    case 'O3': return `${u} have the same kind of complaint.`
    default: return `${u} all have open cases.`
  }
}

const short = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
const article = (w: string) => (/^[aeiou]/i.test(w) ? 'an' : 'a')

type StoryCase = Pick<Case, 'ownerUnit' | 'receivedOn' | 'lifecycle' | 'channel' | 'summary' | 'category'> & Partial<Pick<Case, 'lastActionOn' | 'sourceComplaintRef' | 'scheduled'>>

/** How a unit came to hold the case. Only PGRC receives CPGRAMS grievances; other units are forwarded them. */
function arrival(c: StoryCase): string {
  if (c.channel === 'CPGRAMS') return `${c.ownerUnit} received a CPGRAMS grievance on ${short(c.receivedOn)}`
  if (c.sourceComplaintRef && c.ownerUnit !== 'PGRC') return `${c.ownerUnit} was forwarded grievance ${c.sourceComplaintRef} on ${short(c.receivedOn)}`
  const ch = CHANNEL_LABEL[c.channel]
  return `${c.ownerUnit} received ${article(ch)} ${ch}${/complaint/i.test(ch) ? '' : ' complaint'} on ${short(c.receivedOn)}`
}

const noun = (category: string) => category.replace(/_/g, ' ')

/** What a case is doing now, in plain words, with its next date when there is one. */
function state(c: StoryCase): string {
  const on = c.scheduled ? short(c.scheduled.on) : ''
  switch (c.lifecycle) {
    case 'disposed': return `closed ${article(noun(c.category))} ${noun(c.category)} case on ${short(c.lastActionOn ?? c.receivedOn)}`
    case 'transferred': return `passed its case to another unit on ${short(c.lastActionOn ?? c.receivedOn)}`
    case 'inspection_hearing': return c.scheduled ? `has the ${c.scheduled.what} fixed for ${on}` : 'has an inspection or hearing under way'
    case 'awaiting_party': return c.scheduled ? `is waiting for the institution’s reply (due ${on})` : 'is waiting for the institution’s reply'
    case 'under_examination': return 'is examining its case'
    case 'received': return 'has registered its case'
    case 'escalated': return 'has placed its case before a higher authority'
  }
}

/** Who is doing what, unit by unit, without the lead-in: "PGRC is examining its case; RB-NR closed a fee refund case on 24 Aug". */
export function overlapNote(cases: StoryCase[]): string {
  return [...new Set(cases.map((c) => c.ownerUnit))].map((u) => `${u} ${cases.filter((c) => c.ownerUnit === u).map(state).join(' and ')}`).join('; ')
}

/**
 * One specific sentence built from the case facts: the issue, then every unit with what it is doing and when.
 * Example: "Approval and compliance: PGRC received a CPGRAMS grievance on 7 Oct; RB-NWR has EVC visit fixed for 29 Oct."
 */
export function overlapStory(cases: StoryCase[]): string {
  const live = cases.filter((c) => c.lifecycle !== 'disposed' && c.lifecycle !== 'transferred')
  const list = live.length >= 2 ? live : cases
  const newest = [...(live.length ? live : cases)].sort((a, b) => b.receivedOn.localeCompare(a.receivedOn))[0]
  const issue = mainIssue(list)
  const lead = issue ? issue.label : categoryLabel(newest.category)
  const parts = [arrival(newest) + (newest.scheduled ? ` and ${state(newest)}` : '')]
  const units = [...new Set(cases.filter((c) => c !== newest).map((c) => c.ownerUnit))]
  for (const u of units) {
    const mine = cases.filter((c) => c.ownerUnit === u && c !== newest)
    parts.push(`${u} ${mine.map(state).join(' and ')}`)
  }
  return `${lead}: ${parts.join('; ')}.`
}
