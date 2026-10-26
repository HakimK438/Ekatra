// One dated list of what happened in every unit, oldest first, with the moment both units became active marked.
// Replaces the lanes chart in the overlap views: a list of dated lines is faster to read than bars.
import clsx from 'clsx'
import { UnitPill } from './Unit'
import { fmtDate } from './ui'

export interface TimelineEvent { at: string; unit: string; text: string; actor: string }

export default function JointTimeline({ events, since, className }: { events: TimelineEvent[]; since: string; className?: string }) {
  const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at))
  const markAt = sorted.findIndex((e) => e.at.slice(0, 10) >= since)
  return (
    <ol className={clsx('relative max-h-96 space-y-3 overflow-y-auto border-l-2 border-line pl-5', className)}>
      {sorted.map((e, i) => (
        <li key={i} className="relative">
          {i === markAt && (
            <p className="mb-3 -ml-5 flex items-center gap-2 rounded-r-full border-y border-r border-turmeric/40 bg-turmeric-soft px-3 py-1 text-12 font-semibold text-turmeric">
              Both units have an open case from here ({fmtDate(since)})
            </p>
          )}
          <span className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full border-2 border-surface bg-ink-500" aria-hidden />
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <time className="font-mono text-12 text-muted">{fmtDate(e.at)}</time>
            <UnitPill code={e.unit} className="!px-2 !py-0.5 !text-12" />
          </div>
          <p className="mt-0.5 text-13 text-text">{e.text}<span className="text-muted"> · {e.actor === 'system' ? 'automatic check' : e.actor}</span></p>
        </li>
      ))}
    </ol>
  )
}
