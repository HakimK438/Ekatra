import { useState } from 'react'
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlarmClock, BarChart3, Mailbox, Bell, Building2, CalendarDays, CircleHelp, FilePlus2, FileUp, Files, GitMerge, HeartPulse, Home, Inbox, LineChart, Link2, LogOut, Menu, PlayCircle, Route, ScrollText, ShieldCheck, SlidersHorizontal, Users, X, type LucideIcon } from 'lucide-react'
import type { Role } from '../lib/types'
import clsx from 'clsx'
import { api, EXTRA } from '../lib/api'
import { ROLE_LABEL } from '../lib/labels'
import { useSession, type TextSize } from '../hooks/useUser'
import AskBar from './AskBar'
import ErrorBoundary from './ErrorBoundary'
import Avatar from './Avatar'
import { btn, fmtDate } from './ui'

// Grouped by job, with short permanent names. Each person sees only the pages their role can use.
const OFFICER: Role[] = ['dealing_officer', 'nodal_officer']
const ACTS: Role[] = [...OFFICER, 'coordinator']
const READ: Role[] = [...ACTS, 'senior_management']
type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean; count?: 'overlaps' | 'matching'; roles?: Role[] }
const GROUPS: { heading?: string; items: NavItem[] }[] = [
  // The five places an officer works in. Related screens (calendar, check, register, import) are tabs inside them.
  { items: [
    { to: '/', label: 'Dashboard', icon: Home, end: true },
    { to: '/overlaps', label: 'Clashes', icon: GitMerge, count: 'overlaps' as const, roles: READ },
    { to: '/calendar', label: 'Calendar', icon: CalendarDays, roles: READ },
    { to: '/institutions', label: 'Institutions', icon: Building2, roles: [...READ, 'data_steward'] },
    ...(!EXTRA ? [{ to: '/requests', label: 'Letters', icon: Mailbox, roles: [...READ, 'data_steward'] as Role[] }] : []),
    { to: '/cases', label: 'Cases', icon: Files, end: true, roles: [...READ, 'data_steward'] },
    { to: '/deadlines', label: 'Deadlines', icon: AlarmClock, roles: READ },
    { to: '/reports', label: 'Reports', icon: BarChart3, roles: ['coordinator', 'senior_management'] },
  ] },
  { heading: 'More', items: [
    ...(EXTRA ? [{ to: '/inbox', label: 'Inbox', icon: Inbox, roles: ACTS }] : []),
    { to: '/matching', label: 'Is this the same college?', icon: Link2, count: 'matching' as const, roles: ['coordinator', 'data_steward'] },
    { to: '/cases/new', label: 'Register a case', icon: FilePlus2, roles: OFFICER },
    { to: '/import', label: 'Import records', icon: FileUp, roles: [...OFFICER, 'data_steward', 'coordinator'] },
    ...(EXTRA ? [{ to: '/data-health', label: 'Data health', icon: HeartPulse, roles: ['data_steward', 'coordinator', 'admin'] as Role[] }] : []),
    { to: '/management', label: 'Management view', icon: LineChart, roles: ['coordinator'] },
    { to: '/audit', label: 'Audit log', icon: ScrollText, roles: ['admin', 'senior_management', 'coordinator'] },
    { to: '/settings', label: 'Settings and rules', icon: SlidersHorizontal, roles: ['admin', 'coordinator', 'senior_management'] },
    { to: '/settings/users', label: 'Users', icon: Users, roles: ['admin'] },
  ] },
  { heading: 'Help', items: [
    { to: '/flow', label: 'How Ekatra works', icon: Route },
    { to: '/demo', label: 'Live demo', icon: PlayCircle },
    ...(EXTRA ? [{ to: '/how-it-works', label: 'Proof it works', icon: CircleHelp }] : []),
  ] },
]
// Tabs shown at the top of a place, so one idea is one place in the menu.
const TABS: { match: string[]; items: { to: string; label: string; roles?: Role[] }[] }[] = [
  ...(!EXTRA ? [
    { match: ['/', '/my-day', '/team'], items: [{ to: '/', label: 'Dashboard' }, { to: '/my-day', label: 'My day' }, { to: '/team', label: 'Who is working on what', roles: [...READ, 'data_steward'] as Role[] }] },
    { match: ['/requests', '/letters'], items: [{ to: '/requests', label: 'All letters' }, { to: '/letters', label: 'Read a new letter', roles: [...ACTS, 'data_steward'] as Role[] }] },
    { match: ['/settings', '/policy'], items: [{ to: '/settings', label: 'Settings' }, { to: '/policy', label: 'Rule changes', roles: ['admin', 'coordinator', 'senior_management'] as Role[] }] },
  ] : []),
  { match: ['/overlaps', '/check'], items: [
    { to: '/overlaps', label: 'Clashes' },
    { to: '/check', label: 'Before you act', roles: ACTS },
  ] },
  { match: ['/cases', '/import', '/radar', '/allocation'], items: [
    { to: '/cases', label: 'All cases' },
    { to: '/cases/new', label: 'Register a case', roles: OFFICER },
    { to: '/import', label: 'Import records', roles: [...OFFICER, 'data_steward', 'coordinator'] },
    ...(!EXTRA ? [{ to: '/allocation', label: 'Assign work', roles: ['nodal_officer', 'coordinator', 'senior_management'] as Role[] }] : []),
    ...(!EXTRA ? [{ to: '/radar', label: 'Came back or repeating', roles: READ }] : []),
  ] },
  { match: ['/reports', '/management', '/audit'], items: [
    { to: '/reports', label: 'Reports', roles: ['coordinator', 'senior_management'] },
    { to: '/management', label: 'Management view', roles: ['coordinator'] },
    { to: '/audit', label: 'Audit log', roles: ['admin', 'senior_management', 'coordinator'] },
  ] },
]
const HOME_LABEL: Record<Role, string> = { dealing_officer: 'Dashboard', nodal_officer: 'Dashboard', coordinator: 'Dashboard', data_steward: 'Dashboard', senior_management: 'Overview', admin: 'System' }
const CRUMB: Record<string, string> = { '': 'Dashboard', management: 'Management view', calendar: 'Calendar', demo: 'Live demo', inbox: 'Inbox', cases: 'Cases', institutions: 'Institutions', overlaps: 'Clashes', matching: 'Same college?', deadlines: 'Deadlines', import: 'Import', 'data-health': 'Data health', reports: 'Reports', settings: 'Settings', audit: 'Audit log', 'how-it-works': 'Proof it works', check: 'Before you act', flow: 'How Ekatra works', letters: 'Read a new letter', requests: 'Letters', policy: 'Rule changes', radar: 'Came back or repeating', allocation: 'Assign work', team: 'Who is working on what', 'my-day': 'My day' }

export default function Shell() {
  const { user, signOut, textSize, setTextSize } = useSession()
  const nav = useNavigate()
  const loc = useLocation()
  const [open, setOpen] = useState(false)
  const dash = useQuery({ queryKey: ['summary', user?.id], queryFn: () => api.summary(user!), enabled: !!user })
  if (!user) return <Navigate to="/login" replace />

  const counts = { overlaps: dash.data?.overlaps.needMyDecision, matching: dash.data?.matching.toConfirm }
  const stale = dash.data?.sources.stale ?? []
  const onCaseFile = /^\/cases\/(?!new$)/.test(loc.pathname)
  const section = onCaseFile ? undefined : TABS.find((g) => g.match.some((m) => loc.pathname === m || loc.pathname.startsWith(m + '/')))
  const tabs = section ? section.items.filter((t) => !t.roles || t.roles.includes(user.role)) : []
  const crumb = CRUMB[loc.pathname.split('/')[1] ?? ''] ?? 'Ekatra'

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr] print:block">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2">Skip to content</a>

      <aside className={clsx('print:hidden fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col bg-ink-800 text-white transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0', open ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex items-center gap-3 px-5 pb-5 pt-6">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white"><img src="/img/aicte-logo.png" alt="AICTE" width={32} height={32} className="h-8 w-8" /></span>
          <div className="leading-tight">
            <div className="font-display text-20 font-semibold tracking-tight">Ekatra</div>
            <div className="font-deva text-12 text-white/65" lang="hi">एकत्र · case coordination</div>
          </div>
          <button className="ml-auto lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X size={18} /></button>
        </div>

        <nav aria-label="Main" className="flex-1 space-y-6 overflow-y-auto px-3 py-2">
          {GROUPS.filter((g) => g.items.some((l) => !l.roles || l.roles.includes(user.role))).map((g, gi) => (
            <div key={g.heading ?? gi}>
              {g.heading && <div className="mb-1.5 px-3 text-12 text-white/55">{g.heading}</div>}
              <div className="space-y-0.5">
                {g.items.filter((l) => !l.roles || l.roles.includes(user.role)).map((l) => (
                  <NavLink key={l.to} to={l.to} end={l.end ?? false} onClick={() => setOpen(false)}
                    className={({ isActive }) => clsx('flex items-center gap-3 rounded-lg px-3 py-2 text-14 transition-colors',
                      isActive ? 'bg-white font-semibold text-ink-950' : 'text-white/85 hover:bg-white/10 hover:text-white')}>
                    <l.icon size={18} strokeWidth={1.8} aria-hidden />
                    <span className="flex-1">{l.to === '/' ? HOME_LABEL[user.role] : l.label}</span>
                    {!!l.count && !!counts[l.count] && <span className="min-w-[22px] rounded-full bg-turmeric px-1.5 text-center text-12 font-semibold text-white" aria-label={`${counts[l.count]} waiting`}>{counts[l.count]}</span>}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="m-3 rounded-xl bg-white/[0.07] p-3">
          <div className="flex items-center gap-3">
            <Avatar name={user.name} size={38} />
            <div className="min-w-0 leading-tight">
              <div className="truncate text-14 font-semibold">{user.name}</div>
              <div className="truncate text-12 text-white/65">{ROLE_LABEL[user.role]}{user.unit ? `, ${user.unit}` : ''}</div>
            </div>
          </div>
          <button onClick={() => { signOut(); nav('/login') }} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-white/20 py-1.5 text-13 text-white/85 hover:bg-white/10">
            <LogOut size={14} aria-hidden /> Sign out
          </button>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-ink-950/40 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}

      <div className="flex min-w-0 flex-col">
        <header className="print:hidden sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-line bg-paper/90 px-4 py-2.5 backdrop-blur-md md:px-8">
          <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <span className="hidden text-14 text-muted xl:block">Ekatra <span aria-hidden>/</span> <span className="text-ink-950">{crumb}</span></span>
          <div className="mx-auto w-full max-w-xl xl:mx-6"><AskBar /></div>
          <div className="ml-auto flex items-center gap-2.5">
            {ACTS.includes(user.role) && <NavLink to="/check" className={btn('primary', '!px-4 !py-1.5 !text-13 whitespace-nowrap')}><ShieldCheck size={15} aria-hidden />Before you act</NavLink>}
            <div role="group" aria-label="Text size" className="hidden items-center overflow-hidden rounded-full border border-line bg-surface sm:flex">
              {(['small', 'normal', 'large'] as TextSize[]).map((t, i) => (
                <button key={t} onClick={() => setTextSize(t)} aria-pressed={textSize === t} aria-label={`${t} text`}
                  className={clsx('px-3 py-1.5 font-display font-semibold leading-none', textSize === t ? 'bg-ink-800 text-white' : 'text-text hover:bg-paper', ['text-12', 'text-14', 'text-17'][i])}>A</button>
              ))}
            </div>
            <button className="relative flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface" aria-label={stale.length ? `${stale.length} data source not updated` : 'No notifications'} title={stale.length ? `${stale.map((s) => s.unit).join(', ')} has not sent data in over a day` : 'All data sources are up to date'}>
              <Bell size={17} strokeWidth={1.8} />
              {stale.length > 0 && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-tape ring-2 ring-surface" />}
            </button>
            <span className="hidden items-center gap-1.5 text-12 text-muted lg:flex" title="Numbers refresh after every change and whenever you return to this tab" aria-live="polite">
              <span className={clsx('h-2 w-2 rounded-full', dash.isFetching ? 'animate-pulse bg-turmeric' : 'bg-good')} aria-hidden />
              {dash.isFetching ? 'Updating' : dash.dataUpdatedAt ? `Live · ${new Date(dash.dataUpdatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : 'Live'}
            </span>
            <span className="hidden flex-col items-end leading-tight md:flex" title={EXTRA ? 'All data is synthetic. The screens run on a mock data service.' : 'All data is synthetic.'}>
              <span className="rounded-full bg-turmeric-soft px-2.5 py-0.5 text-12 font-semibold text-turmeric">Demo · synthetic data</span>
              <span className="mt-0.5 text-11 text-muted">{EXTRA ? 'Mock data — backend not connected' : 'Live backend and database'}</span>
            </span>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1320px] flex-1 px-4 pb-10 pt-6 md:px-8">
          {tabs.length > 1 && (
            <nav aria-label="In this section" className="print:hidden -mt-1 mb-6 flex flex-wrap gap-1 border-b border-line">
              {tabs.map((t) => (
                <NavLink key={t.to} to={t.to} end={t.to === '/cases'} className={({ isActive }) => clsx('-mb-px border-b-2 px-3 py-2 text-14 transition-colors', isActive ? 'border-ink-700 font-semibold text-ink-700' : 'border-transparent text-muted hover:text-ink-950')}>{t.label}</NavLink>
              ))}
            </nav>
          )}
          <ErrorBoundary key={loc.pathname}><div className="rise"><Outlet /></div></ErrorBoundary>
        </main>
        <footer className="print:hidden border-t border-line px-4 py-4 text-center text-12 text-muted md:px-8">
          Prototype — synthetic data — not an official AICTE system · Demo date {fmtDate(api.today)}
        </footer>
      </div>
    </div>
  )
}
