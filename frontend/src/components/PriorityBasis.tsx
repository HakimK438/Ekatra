// Why a clash is High or Medium priority, shown as the facts it rests on. The level comes from fixed rules (O1 to O5),
// never from a judgement by the system; this panel lists which rules applied and the dates behind them.
import clsx from 'clsx'
import { Scale } from 'lucide-react'
import { datedActions, findCollisions, type CalCase } from '../lib/calendar'
import { RULE_LABEL } from '../lib/labels'
import { daysBetween } from '../lib/logic'
import { fmtDay, plural } from '../lib/text'
import type { RuleFire } from '../lib/types'

interface Basis { severity: 'High' | 'Medium'; rules: RuleFire[]; cases: CalCase[]; dueOn: string; since: string }

export function priorityItems(a: Basis, today: string): { tag: string; tone: 'High' | 'Medium' | 'Date'; text: string }[] {
  const items: { tag: string; tone: 'High' | 'Medium' | 'Date'; text: string }[] = a.rules.map((r) => ({ tag: `Rule ${r.code}`, tone: r.severity, text: r.why }))
  const cols = findCollisions(datedActions(a.cases.filter((c) => c.lifecycle !== 'disposed' && c.lifecycle !== 'transferred'), today))
  for (const c of cols) {
    const gap = daysBetween(c.from, c.to)
    items.push({ tag: 'Dates', tone: 'Date', text: `${c.actions.map((x) => `${x.unit} (${fmtDay(x.date)}: ${x.what})`).join(' and ')} fall ${gap === 0 ? 'on the same day' : `${plural(gap, 'day')} apart`}.` })
  }
  const open = daysBetween(a.since, today)
  if (open > 0) items.push({ tag: 'Duration', tone: 'Date', text: `The units have had open cases on this institution together for ${plural(open, 'day')}.` })
  if (a.dueOn < today) items.push({ tag: 'Late', tone: 'Date', text: `A decision was due on ${fmtDay(a.dueOn)}, ${plural(daysBetween(a.dueOn, today), 'day')} ago, and none is recorded.` })
  return items
}

export default function PriorityBasis({ a, today, className }: { a: Basis; today: string; className?: string }) {
  const items = priorityItems(a, today)
  const high = a.severity === 'High'
  return (
    <section aria-label="Why this priority" className={clsx('rounded-panel border border-line bg-surface p-5 shadow-card', className)}>
      <h2 className="flex items-center gap-2 font-display text-17 font-semibold text-ink-950"><Scale size={18} className="text-ink-700" aria-hidden />Why this is {a.severity} priority</h2>
      <ul className="mt-3 space-y-2">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-3 text-14 text-text">
            <span className={clsx('mt-0.5 w-[72px] shrink-0 rounded-md px-2 py-0.5 text-center text-11 font-semibold',
              it.tone === 'High' ? 'bg-tape-soft text-tape' : it.tone === 'Medium' ? 'bg-turmeric-soft text-turmeric' : 'bg-ink-50 text-ink-900')}>{it.tag}</span>
            <span>{it.text}{it.tone !== 'Date' && <span className="text-muted"> ({it.tone === 'High' ? 'a High-priority rule' : 'a Medium-priority rule'}: {RULE_LABEL[it.tag.replace('Rule ', '') as keyof typeof RULE_LABEL]?.short.toLowerCase()})</span>}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 border-t border-line pt-3 text-12 leading-relaxed text-muted">
        <strong className="text-ink-950">How the level is set.</strong> A clash is <strong>High</strong> when any of these is true: a Grievance Cell case and a Regulation Bureau case are both open (O1); a new case arrived while another unit has a notice or hearing pending (O4); the same complaint number is held by two units (O5). Otherwise it is <strong>Medium</strong>. {high ? 'At least one High rule applies here.' : 'No High rule applies here.'} The rules are fixed and listed on the “How Ekatra works” page. Clashes are ordered by their decision date, earliest first.
      </p>
    </section>
  )
}
