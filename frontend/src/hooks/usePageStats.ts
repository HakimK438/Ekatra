// The headline figures and the one-sentence takeaway shown at the top of each working page. All of them come from the one
// /summary call, so a page can never disagree with the dashboard. Each takeaway says what the numbers mean and what to do.
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { plural } from '../lib/text'
import { useUser } from './useUser'
import type { Stat } from '../components/ui'

export type PageKind = 'none' | 'cases' | 'institutions' | 'overlaps' | 'deadlines' | 'calendar' | 'matching' | 'reports' | 'audit' | 'import' | 'check'
export interface PageStats { stats?: Stat[]; insight?: string; insightTone?: 'good' | 'amber' | 'red' }

export function usePageStats(kind: PageKind): PageStats {
  const { user } = useUser()
  const q = useQuery({ queryKey: ['summary', user.id], queryFn: () => api.summary(user) })
  const s = q.data
  if (!s || kind === 'none') return {}
  const c = s.cases, o = s.overlaps, m = s.mine
  switch (kind) {
    case 'cases':
      return {
        stats: [
          { label: 'Open cases', value: c.open, to: '/cases?lifecycle=active' },
          { label: 'Pending', value: c.pending, to: '/cases?lifecycle=pending' },
          { label: 'Beyond limit', value: c.overdue, tone: c.overdue ? 'red' : undefined, to: '/cases?deadline=overdue' },
          { label: 'Disposed', value: c.disposed, tone: 'green', to: '/cases?lifecycle=disposed' },
        ],
        insight: c.overdue ? `${c.overdue} of ${c.open} open cases are past their time limit. Select “Late” below to see them, oldest first.` : 'No open case is past its time limit.',
        insightTone: c.overdue ? 'red' : 'good',
      }
    case 'institutions':
      return {
        stats: [
          { label: 'Clashes found', value: o.all, to: '/overlaps' },
          { label: 'Waiting for a decision', value: o.awaiting, tone: o.awaiting ? 'amber' : undefined, to: '/overlaps' },
          { label: 'Names to confirm', value: s.matching.toConfirm, to: '/matching' },
          { label: 'Open cases', value: c.open, to: '/cases?lifecycle=active' },
        ],
        insight: o.awaiting ? `${plural(o.awaiting, 'institution')} ${o.awaiting === 1 ? 'has' : 'have'} more than one unit working on ${o.awaiting === 1 ? 'it' : 'them'}, and nobody has yet chosen who leads. Select “More than one unit working” to see them.` : 'No institution has two units working on it without a decision.',
        insightTone: o.awaiting ? 'amber' : 'good',
      }
    case 'overlaps':
      return {
        stats: [
          { label: 'Waiting for a decision', value: o.awaiting, tone: o.awaiting ? 'amber' : undefined },
          { label: 'For you to decide', value: o.needMyDecision, tone: o.needMyDecision ? 'amber' : undefined },
          { label: 'Past the decision date', value: o.pastDue, tone: o.pastDue ? 'red' : undefined },
          { label: 'Decided so far', value: o.decided, tone: 'green' },
        ],
        insight: o.pastDue ? `${plural(o.pastDue, 'clash', 'clashes')} ${o.pastDue === 1 ? 'is' : 'are'} past the date a decision was due. Open the oldest first.` : o.awaiting ? 'Every waiting clash is still inside its decision date.' : 'No clash is waiting for a decision.',
        insightTone: o.pastDue ? 'red' : 'good',
      }
    case 'deadlines':
      return {
        stats: [
          { label: 'Beyond limit (all units)', value: c.overdue, tone: c.overdue ? 'red' : undefined, to: '/cases?deadline=overdue' },
          { label: 'Close to the limit', value: m.approaching, tone: m.approaching ? 'amber' : undefined },
          { label: 'Interim reply due', value: m.interimDue, tone: m.interimDue ? 'amber' : undefined },
          { label: 'Waiting on others', value: m.waitingOnOthers },
        ],
        insight: m.overdue + m.approaching ? `${plural(m.overdue + m.approaching, 'case')} ${s.unit ? `in ${s.unit} ` : ''}need action before the time limit: ${m.overdue} already over, ${m.approaching} close.` : 'Nothing is over or close to its time limit.',
        insightTone: m.overdue ? 'red' : m.approaching ? 'amber' : 'good',
      }
    case 'calendar':
      return {
        stats: [
          { label: 'Clashes waiting', value: o.awaiting, tone: o.awaiting ? 'amber' : undefined, to: '/overlaps' },
          { label: 'Interim replies due', value: m.interimDue, tone: m.interimDue ? 'amber' : undefined },
          { label: 'Went ahead on a warning', value: o.wentAhead ?? 0, tone: o.wentAhead ? 'red' : undefined, to: '/audit' },
        ],
        insight: 'Conflicting letters happen when two units act on one institution in the same week. A highlighted week is one where this can happen.',
        insightTone: 'amber',
      }
    case 'matching':
      return {
        stats: [
          { label: 'Names to confirm', value: s.matching.toConfirm, tone: s.matching.toConfirm ? 'amber' : undefined },
          { label: 'Clashes waiting', value: o.awaiting, to: '/overlaps' },
          { label: 'Open cases', value: c.open },
        ],
        insight: s.matching.toConfirm ? `${plural(s.matching.toConfirm, 'case')} cannot be checked for clashes until the institution is confirmed. Each confirmation is remembered for next time.` : 'Every case is linked to an institution.',
        insightTone: s.matching.toConfirm ? 'amber' : 'good',
      }
    case 'reports': {
      const cp = s.outcomes.cpgrams
      const pct = cp.closed ? Math.round((cp.onTime / cp.closed) * 100) : null
      return {
        stats: [
          { label: 'Cases on record', value: c.total },
          { label: 'Disposed', value: c.disposed, tone: 'green' },
          { label: 'Transferred (counted apart)', value: c.transferred },
          { label: 'Beyond limit', value: c.overdue, tone: c.overdue ? 'red' : undefined },
        ],
        insight: pct === null ? 'No CPGRAMS case has been closed yet.' : `${pct}% of closed CPGRAMS cases were closed within the ${cp.limitDays}-day limit (${cp.onTime} of ${cp.closed}). This is the one verified time limit.`,
        insightTone: pct !== null && pct >= 80 ? 'good' : 'amber',
      }
    }
    case 'audit':
      return {
        stats: [
          { label: 'Clashes decided', value: o.decided, tone: 'green' },
          { label: 'Went ahead on a warning', value: o.wentAhead ?? 0, tone: o.wentAhead ? 'red' : undefined },
          { label: 'Sources reporting', value: s.sources.total - s.sources.stale.length },
        ],
        insight: 'Each entry carries the fingerprint of the one before it, and the database refuses edits and deletions, so any change would show.',
        insightTone: 'good',
      }
    case 'import':
      return {
        stats: [
          { label: 'Sources', value: s.sources.total },
          { label: 'Silent for over a day', value: s.sources.stale.length, tone: s.sources.stale.length ? 'amber' : 'green' },
          { label: 'Cases on record', value: c.total },
        ],
        insight: s.sources.stale.length ? `${s.sources.stale.map((x) => x.unit).join(', ')} ${s.sources.stale.length === 1 ? 'has' : 'have'} not sent data for over a day. Numbers from ${s.sources.stale.length === 1 ? 'that unit' : 'those units'} may be behind.` : `All ${s.sources.total} sources sent data within the last day. Every file is checked row by row before anything is saved.`,
        insightTone: s.sources.stale.length ? 'amber' : 'good',
      }
    case 'check':
      return {
        stats: [
          { label: 'Clashes found', value: o.all, to: '/overlaps' },
          { label: 'Waiting for a decision', value: o.awaiting, tone: o.awaiting ? 'amber' : undefined },
          { label: 'Went ahead on a warning', value: o.wentAhead ?? 0, tone: o.wentAhead ? 'red' : undefined, to: '/audit' },
        ],
        insight: 'The light advises and never blocks you. If you go ahead against a warning, it is recorded on the audit entry.',
        insightTone: 'amber',
      }
  }
}
