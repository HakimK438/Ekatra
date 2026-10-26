// The Proof Trail: six stamps that show, for one case, what the machine checked, what a person confirmed,
// and what is still waiting. Selecting a stamp opens its proof card (what was checked, evidence, result, who, audit entry).
import { useId, useState } from 'react'
import clsx from 'clsx'
import { Check, Flag, Minus, X } from 'lucide-react'
import type { ProofStage, StampState } from '../lib/types'
import { EvidenceList } from './Evidence'
import { fmtDate } from './ui'

const STAMP: Record<StampState, { word: string; icon: typeof Check; ring: string; fill: string; text: string; dot: string }> = {
  auto: { word: 'Automatic', icon: Check, ring: 'ring-ink-700', fill: 'bg-ink-50', text: 'text-ink-700', dot: 'bg-ink-700' },
  needs_person: { word: 'Needs a person', icon: Flag, ring: 'ring-turmeric', fill: 'bg-turmeric-soft', text: 'text-turmeric', dot: 'bg-turmeric' },
  confirmed: { word: 'Confirmed', icon: Check, ring: 'ring-good', fill: 'bg-good-soft', text: 'text-good', dot: 'bg-good' },
  problem: { word: 'Problem', icon: X, ring: 'ring-tape', fill: 'bg-tape-soft', text: 'text-tape', dot: 'bg-tape' },
  not_reached: { word: 'Not yet', icon: Minus, ring: 'ring-stamp', fill: 'bg-surface', text: 'text-muted', dot: 'bg-surface' },
  not_needed: { word: 'Not needed', icon: Minus, ring: 'ring-line', fill: 'bg-paper', text: 'text-muted', dot: 'bg-line' },
}

/** One stamp. A person's confirmation shows their initials, like an initialled register entry. */
export function ProofStamp({ state, initials, size = 40, fresh }: { state: StampState; initials?: string; size?: number; fresh?: boolean }) {
  const s = STAMP[state]
  return (
    <span className={clsx('relative inline-flex shrink-0 items-center justify-center rounded-full ring-2', s.ring, s.fill, s.text, (state === 'not_reached' || state === 'not_needed') && '!ring-1', state === 'confirmed' && '-rotate-2 ring-offset-2 ring-offset-surface', fresh && 'stamp-in')}
      style={{ width: size, height: size }} aria-hidden>
      {state === 'confirmed' && initials ? <span className="font-mono text-12 font-semibold">{initials}</span> : <s.icon size={size * 0.42} strokeWidth={2.5} />}
    </span>
  )
}
export const stampWord = (s: StampState) => STAMP[s].word

export function ProofCard({ stage }: { stage: ProofStage }) {
  const rows: [string, React.ReactNode][] = [
    ['What was checked', stage.checked],
    ['Evidence', stage.evidence.length ? <EvidenceList items={stage.evidence} /> : <span className="text-muted">Nothing recorded yet</span>],
    ['Result', stage.result],
    ['Done by', <>{stage.by}{stage.at && <span className="text-muted">, {fmtDate(stage.at)}</span>}</>],
    ['Audit entry', stage.auditRef ? <span className="font-mono">{stage.auditRef}</span> : <span className="text-muted">Written when this stage is reached</span>],
  ]
  return (
    <dl className="grid gap-x-6 gap-y-3 text-14 sm:grid-cols-[150px_1fr]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-12 font-medium text-muted sm:pt-0.5">{k}</dt>
          <dd className="text-text">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/** The six stages in a row. Keyboard: Tab to a stamp, Enter or Space opens its proof. */
export default function ProofRail({ stages, compact }: { stages: ProofStage[]; compact?: boolean }) {
  const first = stages.find((s) => s.state === 'needs_person' || s.state === 'problem') ?? stages[0]
  const [open, setOpen] = useState<string | null>(compact ? null : first?.key ?? null)
  const panelId = useId()
  const sel = stages.find((s) => s.key === open)

  if (compact) {
    // Six dots for tables: the shape of the trail at a glance.
    return (
      <span className="inline-flex items-center gap-1" role="img" aria-label={stages.map((s) => `${s.title}: ${stampWord(s.state)}`).join('; ')}>
        {stages.map((s) => <span key={s.key} title={`${s.title}: ${stampWord(s.state)}`} className={clsx('h-2 w-2 rounded-full ring-1', STAMP[s.state].ring, STAMP[s.state].dot)} />)}
      </span>
    )
  }

  return (
    <div>
      <ol className="grid grid-cols-3 gap-y-5 md:grid-cols-6">
        {stages.map((s, i) => {
          const reached = s.state !== 'not_reached' && s.state !== 'not_needed'
          return (
            <li key={s.key} className="relative flex flex-col items-center px-1 text-center">
              {i > 0 && <span className={clsx('absolute right-1/2 top-6 hidden h-0.5 w-full md:block', reached ? 'bg-ink-500/60' : 'bg-line')} aria-hidden />}
              <button type="button" onClick={() => setOpen(open === s.key ? null : s.key)} aria-expanded={open === s.key} aria-controls={panelId}
                className={clsx('relative z-10 flex flex-col items-center rounded-xl px-2 py-1 transition-colors', open === s.key ? 'bg-ink-50' : 'hover:bg-paper')}>
                <ProofStamp state={s.state} initials={s.initials} />
                <span className="mt-2 text-11 font-semibold text-muted"><span className="font-mono">{i + 1}</span> · {s.title}</span>
                <span className={clsx('text-12 font-semibold', STAMP[s.state].text)}>{stampWord(s.state)}</span>
              </button>
              <span className="mt-0.5 line-clamp-2 max-w-[150px] text-12 leading-snug text-muted">{s.detail}</span>
            </li>
          )
        })}
      </ol>
      <div id={panelId} aria-live="polite">
        {sel && (
          <div className="mt-5 rounded-xl border border-line bg-paper/60 p-5">
            <h3 className="mb-3 font-display text-16 font-semibold text-ink-950">Proof: {sel.title}</h3>
            <ProofCard stage={sel} />
          </div>
        )}
      </div>
    </div>
  )
}
