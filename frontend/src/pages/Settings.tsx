// Settings and rules: every time limit and threshold, with whether it is verified or only a prototype setting;
// how often each overlap rule turned out to matter; the status words each unit uses; and who can do what.
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { NavLink, useLocation } from 'react-router-dom'
import { BadgeCheck, FlaskConical, Pencil, RotateCcw, SlidersHorizontal } from 'lucide-react'
import clsx from 'clsx'
import { api } from '../lib/api'
import { ROLE_LABEL, STAGE_LABEL } from '../lib/labels'
import { validateRules } from '../lib/rules'
import { useUser } from '../hooks/useUser'
import { fieldCls } from '../components/Dialog'
import Avatar from '../components/Avatar'
import { UnitPill } from '../components/Unit'
import { Button, ErrorBox, PageHead, Panel, Skeleton } from '../components/ui'
import type { Role } from '../lib/types'

const CAN: Record<Role, string> = {
  dealing_officer: 'Works on own unit’s cases: records actions, changes stage, asks institutions for replies, closes cases. Sees own unit’s complainant details.',
  nodal_officer: 'Everything a dealing officer can do, and decides overlaps that involve the unit.',
  coordinator: 'Sees every unit’s case summaries, decides any overlap, and confirms institution names.',
  data_steward: 'Looks after imports, status words and institution records; confirms institution names. Does not decide overlaps.',
  senior_management: 'Reads everything except complainant details. Cannot change anything.',
  admin: 'Looks after settings and users. Never sees case content or complainant details.',
}

function Tag({ verified }: { verified: boolean }) {
  return verified
    ? <span className="inline-flex items-center gap-1 rounded-full bg-good-soft px-2 py-0.5 text-12 font-semibold text-good"><BadgeCheck size={13} aria-hidden />Verified</span>
    : <span className="inline-flex items-center gap-1 rounded-full bg-turmeric-soft px-2 py-0.5 text-12 font-semibold text-turmeric"><FlaskConical size={13} aria-hidden />Prototype setting</span>
}

type Item = { group: string; label: string; value: string; verified: boolean; basis: string; key: string | null; unit: string; editable: boolean; current?: number; default?: number; min?: number; max?: number; changed: boolean }

export default function Settings() {
  const loc = useLocation()
  const { user } = useUser()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [reason, setReason] = useState('')
  const tab = loc.pathname.endsWith('/statuses') ? 'statuses' : loc.pathname.endsWith('/users') ? 'users' : 'rules'
  const s = useQuery({ queryKey: ['settings'], queryFn: api.settings })
  const users = useQuery({ queryKey: ['users'], queryFn: api.users, enabled: tab === 'users' })
  const items = (s.data?.items ?? []) as Item[]
  // Only the values that differ from what is in force are sent.
  const typed: Record<string, number> = Object.fromEntries(items.filter((i) => i.key && draft[i.key] !== undefined && draft[i.key] !== '' && Number(draft[i.key]) !== i.current).map((i) => [i.key!, Number(draft[i.key!])]))
  const check = Object.keys(typed).length ? validateRules(typed) : null
  const done = () => { setEditing(false); setDraft({}); setReason(''); qc.invalidateQueries() }
  const save = useMutation({ mutationFn: () => api.updateRules({ values: typed, reason }, user), onSuccess: done })
  const reset = useMutation({ mutationFn: () => api.resetRules({ reason }, user), onSuccess: done })
  const anyChanged = items.some((i) => i.changed)
  const tabCls = ({ isActive }: { isActive: boolean }) => clsx('rounded-full px-4 py-1.5 text-14', isActive ? 'bg-ink-800 font-semibold text-white' : 'hover:bg-paper')

  return (
    <>
      <PageHead icon={<SlidersHorizontal size={22} />} title="Settings and rules" lead="Only the CPGRAMS time limits are verified. Everything else is a prototype setting, waiting for AICTE to decide." />
      <nav aria-label="Settings sections" className="mb-6 inline-flex flex-wrap gap-1 rounded-full border border-line bg-surface p-1">
        <NavLink to="/settings" end className={tabCls}>Time limits and rules</NavLink>
        <NavLink to="/settings/statuses" className={tabCls}>Status words</NavLink>
        <NavLink to="/settings/users" className={tabCls}>Users</NavLink>
      </nav>
      {s.isError ? <ErrorBox error={s.error} /> : !s.data ? <Skeleton className="h-96" /> : tab === 'rules' ? (
        <div className="space-y-6">
          {user.role === 'admin' && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line bg-surface px-5 py-3 shadow-card">
              <p className="text-14 text-text">{editing ? 'Change a value, say why, and save. Every change is written to the audit log.' : anyChanged ? 'Some settings differ from their defaults.' : 'All settings are at their defaults.'}</p>
              <Button variant={editing ? 'quiet' : 'secondary'} onClick={() => { setEditing(!editing); setDraft({}); setReason('') }}><Pencil size={14} aria-hidden />{editing ? 'Cancel' : 'Edit settings'}</Button>
            </div>
          )}
          {[...new Set(items.map((i) => i.group))].map((g) => (
            <Panel key={g} title={g}>
              <ul className="divide-y divide-line">
                {items.filter((i) => i.group === g).map((i) => {
                  const can = editing && i.editable && i.key
                  return (
                    <li key={i.label} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                      <label htmlFor={`r-${i.key}`} className="min-w-[260px] flex-1 text-14 text-text">{i.label}</label>
                      {can ? (
                        <span className="flex items-center gap-2">
                          <input id={`r-${i.key}`} type="number" inputMode="decimal" min={i.min} max={i.max} className="w-24 rounded-xl border border-line bg-surface px-3 py-1.5 text-right font-mono text-14 focus:border-ink-500 focus:outline-none focus:ring-4 focus:ring-ink-100"
                            value={draft[i.key!] ?? String(i.current)} onChange={(e) => setDraft({ ...draft, [i.key!]: e.target.value })} />
                          <span className="text-12 text-muted">{i.unit} · {i.min}–{i.max}</span>
                          {Number(draft[i.key!] ?? i.current) !== i.default && <button type="button" className="inline-flex items-center gap-1 text-12 font-medium text-ink-700 hover:underline" onClick={() => setDraft({ ...draft, [i.key!]: String(i.default) })}><RotateCcw size={12} aria-hidden />Default {i.default}</button>}
                        </span>
                      ) : <span className="font-mono text-14 font-semibold text-ink-950">{i.value}</span>}
                      {i.changed && !editing && <span className="rounded-full bg-ink-100 px-2 py-0.5 text-12 font-medium text-ink-800">Changed from {i.default}</span>}
                      <Tag verified={i.verified} />
                      {i.basis !== 'Prototype setting' && <span className="basis-full text-12 text-muted sm:basis-auto sm:min-w-[220px]">{i.basis.replace(/^Prototype setting\. /, '')}</span>}
                    </li>
                  )
                })}
              </ul>
            </Panel>
          ))}
          {editing && (
            <Panel title="Save your changes">
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (check?.ok) save.mutate() }}>
                <label className="block text-13 font-medium text-text">Why are you changing this?
                  <textarea rows={2} className={fieldCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: AICTE circular of 12 Oct sets 45 days for all other sources." /></label>
                {check && !check.ok && <p role="alert" className="text-13 font-medium text-tape">{check.message}</p>}
                {(save.isError || reset.isError) && <ErrorBox error={save.error ?? reset.error} />}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button type="button" variant="quiet" disabled={!anyChanged || !reason.trim() || reset.isPending} onClick={() => reset.mutate()}><RotateCcw size={14} aria-hidden />Reset everything to defaults</Button>
                  <Button type="submit" disabled={!check?.ok || !reason.trim() || save.isPending}>{save.isPending ? 'Saving…' : `Save ${Object.keys(typed).length || ''} change${Object.keys(typed).length === 1 ? '' : 's'}`}</Button>
                </div>
              </form>
            </Panel>
          )}
          <Panel title="How often each overlap rule turned out to matter" note="Learned from people’s decisions. Advisory only: nothing changes until an admin edits a setting.">
            <div className="-mx-6 -mb-6 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-14">
                <thead className="border-b border-line text-12 text-muted"><tr><th className="px-6 py-2 font-medium">Rule</th><th className="px-3 py-2 font-medium">Found</th><th className="px-3 py-2 font-medium">Decided</th><th className="px-3 py-2 font-medium">Judged “not related”</th><th className="px-6 py-2 font-medium">What it suggests</th></tr></thead>
                <tbody className="divide-y divide-line">{s.data.rules.map((r) => (
                  <tr key={r.code}>
                    <td className="px-6 py-2.5"><span className="font-mono text-12 text-muted">{r.code}</span> {r.label}</td>
                    <td className="px-3 py-2.5 font-mono">{r.fired}</td><td className="px-3 py-2.5 font-mono">{r.decided}</td>
                    <td className="px-3 py-2.5 font-mono">{r.dismissRate === null ? '—' : `${Math.round(r.dismissRate * 100)}%`}</td>
                    <td className="px-6 py-2.5 text-13 text-muted">{r.decided < 3 ? 'Not enough decisions yet' : (r.dismissRate ?? 0) >= 0.5 ? 'Often not related. Consider narrowing it.' : 'Usually useful. Keep it.'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </Panel>
        </div>
      ) : tab === 'statuses' ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {s.data.statusMap.map((u) => (
            <Panel key={u.unit} title={<UnitPill code={u.unit} className="!text-15" />} note="What this unit’s own status words mean.">
              <ul className="space-y-1 text-13">{u.words.map((w) => <li key={w.word} className="flex justify-between gap-3"><span>“{w.word}”</span><span className="text-muted">{STAGE_LABEL[w.stage]}</span></li>)}</ul>
            </Panel>
          ))}
        </div>
      ) : (
        <Panel title="Users" note="Demo accounts, one per role. In the real system, sign-in will use the government single sign-on.">
          {!users.data ? <Skeleton className="h-60" /> : (
            <ul className="divide-y divide-line">
              {users.data.map((u) => (
                <li key={u.id} className="flex flex-wrap items-start gap-4 py-3">
                  <Avatar name={u.name} size={40} />
                  <div className="min-w-[200px] flex-1"><div className="text-14 font-semibold text-ink-950">{u.name}</div><div className="text-13 text-muted">{ROLE_LABEL[u.role]}{u.unit ? `, ${u.unit}` : ''}</div></div>
                  <p className="max-w-xl flex-[2] text-13 text-text">{CAN[u.role]}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </>
  )
}
