// Helpers for recording a coordination decision: where the pair sits on the relationship ladder,
// and exactly what the chosen decision will and will not do.
import clsx from 'clsx'
import { Check, X } from 'lucide-react'
import { DECISION_EFFECT } from '../lib/labels'
import type { DecisionType } from '../lib/types'

const RUNGS = ['Same institution', 'Possibly related', 'Confirmed related', 'Confirmed duplicate']

/** Rule 4: same institution is not the same as duplicate. Shows how far the evidence and decisions have gone. */
export function RelationshipLadder({ level }: { level: 0 | 1 | 2 | 3 }) {
  return (
    <ol className="flex flex-wrap items-center gap-1.5 text-12" aria-label={`Relationship: ${RUNGS[level]}`}>
      {RUNGS.map((r, i) => (
        <li key={r} className="flex items-center gap-1.5">
          {i > 0 && <span aria-hidden className={clsx('h-px w-4', i <= level ? 'bg-ink-700' : 'bg-line')} />}
          <span aria-current={i === level ? 'step' : undefined}
            className={clsx('rounded-full border px-2.5 py-0.5', i === level ? 'border-ink-700 bg-ink-700 font-semibold text-white' : i < level ? 'border-ink-100 bg-ink-50 text-ink-900' : 'border-line text-muted')}>
            {r}
          </span>
        </li>
      ))}
    </ol>
  )
}

/** Ladder level from the recorded decision (none yet = an open alert, i.e. "possibly related"). */
export const ladderLevel = (d?: DecisionType | null): 0 | 1 | 2 | 3 =>
  d === 'duplicate' ? 3 : d === 'related' || d === 'designate_lead_unit' ? 2 : d === 'not_related' ? 0 : 1

export function ConsequencePreview({ decision, lead }: { decision: DecisionType; lead?: string }) {
  const e = DECISION_EFFECT[decision]
  return (
    <div className="rounded-xl border border-line bg-paper/70 p-4 text-13" aria-live="polite">
      <h4 className="mb-2 font-display text-14 font-semibold text-ink-950">What will happen</h4>
      <ul className="space-y-1">
        {e.will.map((w) => <li key={w} className="flex gap-2"><Check size={14} className="mt-0.5 shrink-0 text-good" aria-hidden />{w}{decision === 'designate_lead_unit' && w.startsWith('The lead unit') && lead ? ` (${lead})` : ''}</li>)}
        {e.wont.map((w) => <li key={w} className="flex gap-2 text-muted"><X size={14} className="mt-0.5 shrink-0" aria-hidden />{w}</li>)}
      </ul>
    </div>
  )
}
