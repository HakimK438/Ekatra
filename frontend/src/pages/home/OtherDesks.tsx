// Home screens for the data steward and the administrator: their own work, not the officers'.
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { FileClock, Settings, ShieldCheck, Users } from 'lucide-react'
import { api } from '../../lib/api'
import { useUser } from '../../hooks/useUser'
import { ROLE_LABEL } from '../../lib/labels'
import { ErrorBox, Skeleton, btn } from '../../components/ui'
import { Empty1, PsStrip, Section, SourceLine } from './shared'

export function DataDesk() {
  const { user } = useUser()
  const sum = useQuery({ queryKey: ['summary', user.id], queryFn: () => api.summary(user) })
  const work = useQuery({ queryKey: ['worklist', user.id], queryFn: () => api.worklist(user, 200) })
  if (sum.isError || work.isError) return <ErrorBox error={sum.error ?? work.error} />
  if (!sum.data || !work.data) return <Skeleton className="h-72" />
  const items = work.data.items.filter((i) => i.kind === 'match' || i.kind === 'import' || i.kind === 'stale_source')
  return (
    <div className="space-y-6">
      <header>
        <p className="text-13 text-muted">{user.name} · {ROLE_LABEL[user.role]}</p>
        <h1 className="font-display text-28 font-semibold tracking-[-0.02em] text-ink-950">Data desk</h1>
        <p className="mt-1 text-15 text-muted">{sum.data.matching.toConfirm} names to confirm · {items.filter((i) => i.kind === 'import').length} imports with rows to fix.</p>
      </header>
      <Section n={1} title="To do" count={items.length} tone="amber" hint="Names to confirm, imports with rows that could not be saved, and units that have gone quiet.">
        {items.length === 0 ? <Empty1>Nothing needs you.</Empty1> : (
          <ul className="divide-y divide-line">
            {items.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div><p className="font-medium text-ink-950">{i.title}</p><p className="text-13 text-muted">{i.sub}</p></div>
                <Link to={i.to} className={btn('secondary', '!px-3 !py-1 !text-13')}>{i.action}</Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <PsStrip s={sum.data} />
      <SourceLine s={sum.data} />
    </div>
  )
}

/** Administrators look after the system, not cases, so their home points at their own work. */
export function AdminDesk() {
  const { user } = useUser()
  const links = [
    { to: '/settings', icon: Settings, title: 'Settings and rules', text: 'Time limits and thresholds. Changes need a reason and are written to the audit log.' },
    { to: '/settings/users', icon: Users, title: 'Users', text: 'Who can see and do what. Admins never see complainant details.' },
    { to: '/audit', icon: ShieldCheck, title: 'Audit log', text: 'Every action, in order, with a check that nothing was changed later.' },
    { to: '/data-health', icon: FileClock, title: 'Data health', text: 'Missing IDs, rows that could not be saved, and units whose data is old.' },
  ]
  return (
    <div className="space-y-6">
      <header>
        <p className="text-13 text-muted">{user.name} · {ROLE_LABEL[user.role]}</p>
        <h1 className="font-display text-28 font-semibold tracking-[-0.02em] text-ink-950">System</h1>
        <p className="mt-1 text-15 text-muted">Rules, users and the audit trail. Administrators do not see case content.</p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        {links.map((l) => (
          <Link key={l.to} to={l.to} className="group flex gap-4 rounded-panel border border-line bg-surface p-5 shadow-card hover:border-ink-500">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink-50 text-ink-700"><l.icon size={20} aria-hidden /></span>
            <span><span className="block font-display text-17 font-semibold text-ink-950 group-hover:underline">{l.title}</span><span className="text-14 text-muted">{l.text}</span></span>
          </Link>
        ))}
      </div>
    </div>
  )
}
