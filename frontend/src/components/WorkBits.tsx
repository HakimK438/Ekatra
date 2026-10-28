// Small pieces shared by the letter, requests, policy and radar screens.
import { useDeferredValue } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Info, Quote } from 'lucide-react'
import clsx from 'clsx'
import { work, SERVER_ONLY, type Finding } from '../lib/workApi'
import { Empty } from './ui'

/** These screens read server records. The offline demo shows this instead. */
export const ServerOnly = () => (
  <Empty title="This screen needs the connected version">Start the API and open the site with VITE_API_MODE=http. The offline demo has no letters or requests.</Empty>
)

/** The words a fact was read from, so the officer can see why. */
export const From = ({ text }: { text?: string | null }) => !text ? null : (
  <p className="mt-1 flex items-start gap-1.5 text-12 leading-snug text-muted"><Quote size={12} className="mt-0.5 shrink-0" aria-hidden /><span className="italic">{text}</span></p>
)

export const FINDING_TITLE: Record<Finding['code'], string> = {
  D1: 'Asked before by another unit', D2: 'Two different reply dates', D3: 'Reply due near another unit’s hearing', D4: 'Many open requests at once',
}

export function FindingCard({ f }: { f: Finding }) {
  return (
    <li className="rounded-xl border border-turmeric/40 bg-turmeric/5 px-4 py-3">
      <p className="flex items-center gap-2 text-13 font-semibold text-ink-950"><AlertTriangle size={15} className="text-turmeric" aria-hidden />{FINDING_TITLE[f.code]}</p>
      <p className="mt-1 text-14 text-ink-950">{f.text}</p>
    </li>
  )
}

const LEVEL = {
  ok: { icon: CheckCircle2, cls: 'text-good' },
  info: { icon: Info, cls: 'text-ink-700' },
  check: { icon: AlertTriangle, cls: 'text-turmeric' },
}

/** Facts before closing a case: shown inside the Close dialog, updated as the reason is typed. Advises, never blocks. */
export function ClosureFacts({ caseId, reason, disposalType }: { caseId: string; reason: string; disposalType: string }) {
  const r = useDeferredValue(reason)
  const q = useQuery({ queryKey: ['closure-check', caseId, disposalType, r], queryFn: () => work.closureCheck(caseId, r, disposalType), enabled: !SERVER_ONLY })
  if (SERVER_ONLY || !q.data) return null
  return (
    <section aria-live="polite" className={clsx('rounded-xl border px-4 py-3', q.data.checks ? 'border-turmeric/40 bg-turmeric/5' : 'border-good/30 bg-good/5')}>
      <p className="text-13 font-semibold text-ink-950">Closure check: {q.data.headline}</p>
      <ul className="mt-2 space-y-1.5">
        {q.data.facts.map((f) => { const L = LEVEL[f.level]; return (
          <li key={f.text} className="flex items-start gap-2 text-13 text-ink-950"><L.icon size={15} className={clsx('mt-0.5 shrink-0', L.cls)} aria-hidden />{f.text}</li>
        ) })}
      </ul>
      <p className="mt-2 text-12 text-muted">You can still close the case. The facts are for you to weigh.</p>
    </section>
  )
}
