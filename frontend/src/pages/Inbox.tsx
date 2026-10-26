// Inbox: everything that arrived, in one place. New cases show the checks that already ran on arrival.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Check, Flag, Inbox as InboxIcon, Minus, X } from 'lucide-react'
import clsx from 'clsx'
import { api } from '../lib/api'
import { useUser } from '../hooks/useUser'
import { btn, Empty, ErrorBox, PageHead, Skeleton, fmtDate } from '../components/ui'
import type { InboxItem, StampState } from '../lib/types'

const TABS: { key: InboxItem['tab']; label: string; empty: string }[] = [
  { key: 'needs_you', label: 'Needs you', empty: 'Nothing is waiting for you. New work shows up here first.' },
  { key: 'auto', label: 'Checked automatically', empty: 'No new cases in the last 7 days.' },
  { key: 'replies', label: 'Replies', empty: 'No replies asked for or received.' },
  { key: 'imports', label: 'Imports and data', empty: 'No files sent in yet.' },
  { key: 'watching', label: 'Watching', empty: 'You are not watching any institution. Open an institution and choose “Watch” to follow it here.' },
]

const MINI: Record<StampState, { icon: typeof Check; cls: string }> = {
  auto: { icon: Check, cls: 'bg-ink-50 text-ink-700 ring-ink-700' },
  needs_person: { icon: Flag, cls: 'bg-turmeric-soft text-turmeric ring-turmeric' },
  confirmed: { icon: Check, cls: 'bg-good-soft text-good ring-good' },
  problem: { icon: X, cls: 'bg-tape-soft text-tape ring-tape' },
  not_reached: { icon: Minus, cls: 'bg-surface text-muted ring-stamp' },
  not_needed: { icon: Minus, cls: 'bg-paper text-muted ring-line' },
}

export default function Inbox() {
  const { user } = useUser()
  const q = useQuery({ queryKey: ['inbox', user.id], queryFn: () => api.inbox(user) })
  const [tab, setTab] = useState<InboxItem['tab']>('needs_you')
  const items = q.data?.items.filter((i) => i.tab === tab) ?? []
  const meta = TABS.find((t) => t.key === tab)!

  return (
    <>
      <PageHead icon={<InboxIcon size={22} />} title="Inbox" lead="Everything that arrived: new cases, replies from institutions, files from units, and institutions you watch." />
      <div role="tablist" aria-label="Inbox sections" className="mb-5 flex flex-wrap gap-1 rounded-full border border-line bg-surface p-1">
        {TABS.map((t) => {
          const n = q.data?.tabs.find((x) => x.tab === t.key)?.count ?? 0
          return (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
              className={clsx('inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-14', tab === t.key ? 'bg-ink-800 font-semibold text-white' : 'text-text hover:bg-paper')}>
              {t.label}
              <span className={clsx('min-w-[22px] rounded-full px-1.5 text-center font-mono text-12', tab === t.key ? 'bg-white/20' : t.key === 'needs_you' && n ? 'bg-turmeric text-white' : 'bg-paper text-muted')}>{n}</span>
            </button>
          )
        })}
      </div>

      <section role="tabpanel" aria-label={meta.label}>
        {q.isError ? <ErrorBox error={q.error} /> : !q.data ? <Skeleton className="h-64" /> : items.length === 0 ? <Empty title={meta.empty} /> : (
          <ol className="divide-y divide-line rounded-panel border border-line bg-surface shadow-card">
            {items.slice(0, 60).map((it) => (
              <li key={it.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="text-14 font-semibold text-ink-950">{it.title}</div>
                  <div className="text-13 text-muted">{it.sub}</div>
                  {it.steps && (
                    <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1" aria-label="Checks that ran on arrival">
                      {it.steps.map((s) => {
                        const m = MINI[s.state]
                        return <li key={s.label} className="inline-flex items-center gap-1.5 text-12 text-muted"><span className={clsx('flex h-4 w-4 items-center justify-center rounded-full ring-1', m.cls)} aria-hidden><m.icon size={10} strokeWidth={3} /></span>{s.label}</li>
                      })}
                    </ul>
                  )}
                </div>
                <span className="font-mono text-12 text-muted">{fmtDate(it.at)}</span>
                <Link to={it.to} className={btn(tab === 'needs_you' ? 'primary' : 'secondary', '!px-4 !py-1.5 !text-13')}>{it.action}</Link>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  )
}
