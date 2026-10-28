// My day: what needs the signed-in person today, one row per item (where, what, by when), grouped by kind of work.
// The same list is the daily e-mail. "What changed" compares this week with the one before.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CalendarCheck, ChevronRight } from 'lucide-react'
import clsx from 'clsx'
import { work, SERVER_ONLY } from '../lib/workApi'
import { ServerOnly } from '../components/WorkBits'
import { Chip, Empty, ErrorBox, PageHead, Panel, Skeleton } from '../components/ui'

const LABEL: Record<string, string> = {
  received: 'Cases received', disposed: 'Cases closed', transferred: 'Cases transferred', newOverlaps: 'New overlaps', decisions: 'Overlap decisions',
  requestsSent: 'Letters sent to institutions', requestsAnswered: 'Replies received',
}

export default function MyDay() {
  const [days, setDays] = useState(7)
  const d = useQuery({ queryKey: ['digest'], queryFn: work.digest, enabled: !SERVER_ONLY })
  const ch = useQuery({ queryKey: ['changes', days], queryFn: () => work.changes(days), enabled: !SERVER_ONLY })
  if (SERVER_ONLY) return <><PageHead icon={<CalendarCheck size={22} />} title="My day" /><ServerOnly /></>
  return (
    <>
      <PageHead icon={<CalendarCheck size={22} />} title="My day" lead={d.data?.headline ?? 'What needs you today.'} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {d.isLoading && <Skeleton className="h-64" />}
          {d.isError && <ErrorBox error={d.error} />}
          {d.data && !d.data.groups.length && <Panel><Empty title="Nothing needs you today" /></Panel>}
          {d.data?.groups.map((g) => (
            <Panel key={g.key} title={<span className="flex items-baseline gap-2">{g.title}<span className="text-14 font-normal text-muted">{g.items.length}{g.late ? ` · ${g.late} late` : ''}</span></span>}>
              <ul className="-mx-2 divide-y divide-line">{g.items.slice(0, 15).map((x) => (
                <li key={x.text}>
                  <Link to={x.to} className="grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto_auto] items-center gap-4 rounded-lg px-2 py-2.5 hover:bg-ink-50">
                    <span className="truncate text-14 font-medium text-ink-950">{x.title}</span>
                    <span className="truncate text-14 text-text" title={x.what}>{x.what.replace(/^Next action: /, '')}</span>
                    <span className={clsx('whitespace-nowrap text-13', x.late ? 'font-semibold text-tape' : 'text-muted')}>{x.when.charAt(0).toLowerCase() + x.when.slice(1)}</span>
                    <ChevronRight size={15} className="text-muted" aria-hidden />
                  </Link>
                </li>))}</ul>
              {g.items.length > 15 && <p className="mt-2 text-12 text-muted">and {g.items.length - 15} more</p>}
            </Panel>
          ))}
        </div>
        <Panel title="What changed" action={<div className="flex gap-2">{[7, 30].map((n) => <Chip key={n} active={days === n} onClick={() => setDays(n)}>{n} days</Chip>)}</div>}>
          {!ch.data ? <Skeleton className="h-48" /> : (
            <>
              <table className="w-full text-14">
                <thead><tr className="text-left text-12 text-muted"><th className="pb-2 font-normal" /><th className="pb-2 text-right font-normal">Last {ch.data.days} days</th><th className="pb-2 text-right font-normal">Before</th></tr></thead>
                <tbody>{Object.keys(LABEL).map((k) => {
                  const now = ch.data!.now[k], before = ch.data!.before[k]
                  return (
                    <tr key={k} className="border-t border-line">
                      <td className="py-2 text-ink-950">{LABEL[k]}</td>
                      <td className="py-2 text-right font-semibold text-ink-950">{now}</td>
                      <td className="py-2 text-right text-muted">{before}</td>
                    </tr>)
                })}</tbody>
              </table>
              <p className="mt-3 text-12 text-muted">Transfers are counted apart from closures.</p>
            </>
          )}
        </Panel>
      </div>
    </>
  )
}
