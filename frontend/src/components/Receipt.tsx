// The ledger line written after every human action: when, who, which audit entry, and the reason.
import clsx from 'clsx'
import { CheckCircle2 } from 'lucide-react'

export default function Receipt({ at, by, entry, text, className }: { at: string; by: string; entry?: string; text: string; className?: string }) {
  const when = new Date(at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  return (
    <p role="status" className={clsx('flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-xl border border-good/25 bg-good-soft px-3.5 py-2 text-13 text-text', className)}>
      <CheckCircle2 size={14} className="relative top-0.5 shrink-0 text-good" aria-hidden />
      <span className="font-semibold text-good">Recorded</span>
      <span className="font-mono text-12 text-muted">{when}</span>
      <span aria-hidden className="text-muted">·</span>
      <span>{by}</span>
      {entry && <><span aria-hidden className="text-muted">·</span><span className="font-mono text-12 text-muted">entry {entry}</span></>}
      <span className="basis-full text-text">{text}</span>
    </p>
  )
}
