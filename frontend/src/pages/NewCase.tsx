// Add a case by hand (for units without a file export). While you type, "Already known?" checks the register,
// other units' open cases and the complaint number, so a duplicate is caught before it is created.
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AlertTriangle, Check, FilePlus2, Hand, Lock, SearchCheck } from 'lucide-react'
import clsx from 'clsx'
import { api } from '../lib/api'
import { useUser } from '../hooks/useUser'
import { CATEGORY_LABEL, CHANNEL_LABEL, STAGE_LABEL } from '../lib/labels'
import { fieldCls } from '../components/Dialog'
import { UnitDot } from '../components/Unit'
import { Button, ErrorBox, PageHead, Panel, Step, btn } from '../components/ui'
import type { Channel } from '../lib/types'

const CHANNELS: Channel[] = ['CPGRAMS', 'CSS', 'EMAIL_POST', 'APH_COMPLAINT', 'VIP_MINISTRY', 'COURT', 'RTI', 'OTHER']
const useDebounced = <T,>(v: T, ms = 300) => { const [d, setD] = useState(v); useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t) }, [v, ms]); return d }

export default function NewCase() {
  const { user } = useUser()
  const qc = useQueryClient()
  const [f, setF] = useState({ permanentId: '', currentId: '', name: '', district: '', channel: 'CPGRAMS' as Channel, complaintRef: '', sourceRef: '', category: 'norm_violation', summary: '', receivedOn: api.today, complainant: '', narrative: '' })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  const probe = useDebounced({ permanentId: f.permanentId, currentId: f.currentId, name: f.name, district: f.district, complaintRef: f.complaintRef })
  const typed = !!(probe.permanentId || probe.currentId || probe.name.length > 3 || probe.complaintRef)
  const known = useQuery({ queryKey: ['check-new', probe], queryFn: () => api.checkNewCase(probe), enabled: typed, placeholderData: (p) => p })
  const create = useMutation({
    mutationFn: () => api.createCase({ unit: user.unit!, channel: f.channel, sourceRef: f.sourceRef, complaintRef: f.complaintRef, category: f.category, summary: f.summary, receivedOn: f.receivedOn,
      recorded: { name: f.name, district: f.district || undefined, permanentId: f.permanentId || undefined, currentId: f.currentId || undefined }, complainant: f.complainant, narrative: f.narrative }, user),
    onSuccess: () => qc.invalidateQueries(),
  })
  const canAdd = !!user.unit && (user.role === 'dealing_officer' || user.role === 'nodal_officer')

  if (create.data) {
    const r = create.data
    return (
      <>
        <PageHead icon={<FilePlus2 size={22} />} title={`Case ${r.uid} added`} lead="Here is everything Ekatra did the moment it arrived." />
        <Panel title="What happened on arrival">
          <ol className="space-y-3">
            {r.steps.map((st) => (
              <li key={st.key} className="flex items-start gap-3">
                <span className={clsx('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full', st.outcome === 'auto' ? 'bg-ink-700 text-white' : 'bg-turmeric text-white')} aria-hidden>{st.outcome === 'auto' ? <Check size={15} strokeWidth={3} /> : <Hand size={14} />}</span>
                <div className="flex-1"><div className="text-15 font-semibold text-ink-950">{st.title}</div><div className="text-14 text-muted">{st.detail}</div></div>
                <span className="text-12 text-muted">{st.outcome === 'auto' ? 'Automatic' : 'Needs a person'}</span>
              </li>
            ))}
          </ol>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to={`/cases/${r.caseId}`} className={btn('primary')}>Open the case</Link>
            {r.overlapId && <Link to={`/overlaps/${encodeURIComponent(r.overlapId)}`} className={btn('secondary')}>Look at the overlap</Link>}
            {!r.matched && <Link to="/matching" className={btn('secondary')}>Go to name check</Link>}
            <button className={btn('quiet')} onClick={() => { create.reset(); setF({ ...f, permanentId: '', currentId: '', name: '', district: '', complaintRef: '', sourceRef: '', summary: '', complainant: '', narrative: '' }) }}>Add another</button>
          </div>
        </Panel>
      </>
    )
  }

  const k = known.data
  return (
    <>
      <PageHead icon={<FilePlus2 size={22} />} title="Add a case" lead="Use this when a case is not in a file from your unit. Ekatra checks whether it is already known while you type." />
      {!canAdd && <p className="mb-5 rounded-xl bg-ink-50 px-4 py-2.5 text-13 text-ink-900">Only officers of a unit can add cases. You can still try the “Already known?” check. To add one, sign in as Anjali Rao or Pradeep Nair.</p>}
      <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); create.mutate() }}>
          <Panel>
            <Step n={1} title="Which institution?" hint="The Permanent ID is best. If you do not have it, the name and district are enough." />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-13 font-medium text-text">Permanent ID<input className={clsx(fieldCls, 'font-mono')} value={f.permanentId} onChange={set('permanentId')} placeholder="1-2201234" /></label>
              <label className="text-13 font-medium text-text">Current ID (if no Permanent ID)<input className={clsx(fieldCls, 'font-mono')} value={f.currentId} onChange={set('currentId')} placeholder="1-2201455" /></label>
              <label className="text-13 font-medium text-text sm:col-span-2">Institution name, as written<input className={fieldCls} value={f.name} onChange={set('name')} placeholder="For example: Sahyadri Inst. of Tech, Pune" /></label>
              <label className="text-13 font-medium text-text">District<input className={fieldCls} value={f.district} onChange={set('district')} placeholder="Pune" /></label>
            </div>
          </Panel>
          <Panel>
            <Step n={2} title="About the case" hint="No personal details here; this part is visible to other units." />
            <fieldset className="mt-4"><legend className="text-13 font-medium text-text">How did it come in?</legend>
              <div className="mt-2 flex flex-wrap gap-2">{CHANNELS.map((c) => (
                <label key={c} className={clsx('cursor-pointer rounded-full border px-3.5 py-1.5 text-13 focus-within:ring-2 focus-within:ring-ink-500', f.channel === c ? 'border-ink-700 bg-ink-700 text-white' : 'border-line hover:border-ink-500')}>
                  <input type="radio" className="sr-only" name="channel" checked={f.channel === c} onChange={() => setF({ ...f, channel: c })} />{CHANNEL_LABEL[c]}</label>))}</div>
            </fieldset>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-13 font-medium text-text">Complaint number {f.channel === 'CPGRAMS' && <span className="text-muted">(CPGRAMS registration no.)</span>}<input className={clsx(fieldCls, 'font-mono')} value={f.complaintRef} onChange={set('complaintRef')} placeholder="DARPG/E/2026/0481" /></label>
              <label className="text-13 font-medium text-text">Your unit’s reference (optional)<input className={clsx(fieldCls, 'font-mono')} value={f.sourceRef} onChange={set('sourceRef')} placeholder={`${user.unit ?? 'PGRC'}/2026/…`} /></label>
              <label className="text-13 font-medium text-text">Category<select className={fieldCls} value={f.category} onChange={set('category')}>{Object.entries(CATEGORY_LABEL).map(([k2, v]) => <option key={k2} value={k2}>{v}</option>)}</select></label>
              <label className="text-13 font-medium text-text">Received on<input type="date" max={api.today} className={fieldCls} value={f.receivedOn} onChange={set('receivedOn')} /></label>
              <label className="text-13 font-medium text-text sm:col-span-2">Short summary<input className={fieldCls} value={f.summary} onChange={set('summary')} placeholder="For example: Faculty salaries not paid for three months" /></label>
            </div>
          </Panel>
          <Panel>
            <Step n={3} title="Who complained (restricted)" hint="Visible only to your unit. Never shown in reports or exports." />
            <div className="mt-4 grid gap-4">
              <label className="text-13 font-medium text-text"><span className="inline-flex items-center gap-1.5"><Lock size={13} aria-hidden />Complainant’s name</span><input className={fieldCls} value={f.complainant} onChange={set('complainant')} /></label>
              <label className="text-13 font-medium text-text"><span className="inline-flex items-center gap-1.5"><Lock size={13} aria-hidden />Complaint text</span><textarea rows={3} className={fieldCls} value={f.narrative} onChange={set('narrative')} /></label>
            </div>
          </Panel>
          {create.isError && <ErrorBox error={create.error} />}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={!canAdd || create.isPending || (!f.name.trim() && !f.permanentId.trim())}>{create.isPending ? 'Adding…' : 'Add the case'}</Button>
            <span className="text-13 text-muted">It will be checked straight away: institution, overlaps and time limit.</span>
          </div>
        </form>

        <aside className="xl:sticky xl:top-24 xl:self-start" aria-live="polite">
          <Panel title={<span className="inline-flex items-center gap-2"><SearchCheck size={18} aria-hidden />Already known?</span>} note="Checks the register and every unit’s open cases as you type.">
            {!typed ? <p className="text-14 text-muted">Start with the Permanent ID, the name, or the complaint number.</p> : !k ? <p className="text-14 text-muted">Checking…</p> : (
              <div className="space-y-4 text-14">
                {k.sameRef.length > 0 && (
                  <div className="rounded-xl border border-tape/30 bg-tape-soft p-3 text-tape">
                    <p className="flex items-start gap-2 font-semibold"><AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />This complaint number is already on file</p>
                    <ul className="mt-1 space-y-0.5 text-13">{k.sameRef.map((c) => <li key={c.id}><Link to={`/cases/${c.id}`} className="font-mono underline">{c.uid}</Link> in {c.unit} ({STAGE_LABEL[c.stage].toLowerCase()})</li>)}</ul>
                    <p className="mt-1 text-13">Open it instead. If you continue, both will be flagged for the units to decide.</p>
                  </div>
                )}
                {k.institution ? (
                  <div>
                    <p className="flex items-center gap-1.5 font-semibold text-good"><Check size={16} aria-hidden />Found: {k.institution.name}</p>
                    <p className="text-13 text-muted">By {k.method === 'T1_exact' ? 'Permanent ID' : 'another verified ID'} · {k.institution.district}</p>
                  </div>
                ) : k.suggestions.length ? (
                  <div>
                    <p className="font-semibold text-turmeric">Not sure which institution. Likely ones:</p>
                    <ul className="mt-1 space-y-1 text-13">{k.suggestions.map((s) => <li key={s.institutionId}>{s.institution.name} <span className="text-muted">({Math.round(s.score * 100)}%, {s.institution.district})</span></li>)}</ul>
                    <p className="mt-1 text-12 text-muted">A coordinator will confirm after you add the case. Adding the Permanent ID avoids this.</p>
                  </div>
                ) : <p className="text-muted">No institution matches yet.</p>}
                {k.openElsewhere.length > 0 && (
                  <div className="rounded-xl border border-turmeric/30 bg-turmeric-soft p-3">
                    <p className="font-semibold text-turmeric">Already open with {[...new Set(k.openElsewhere.map((c) => c.unit))].join(', ')}</p>
                    <ul className="mt-1 space-y-0.5 text-13 text-text">{k.openElsewhere.map((c) => <li key={c.id} className="flex items-center gap-1.5"><UnitDot code={c.unit} /><Link to={`/cases/${c.id}`} className="font-mono hover:underline">{c.uid}</Link> · {CATEGORY_LABEL[c.category] ?? c.category} · {STAGE_LABEL[c.stage].toLowerCase()}</li>)}</ul>
                    <p className="mt-1 text-12 text-muted">You can still add it. The units will be asked to agree who leads.</p>
                  </div>
                )}
                {k.institution && !k.openElsewhere.length && !k.sameRef.length && <p className="text-13 text-muted">No other unit has an open case for this institution.</p>}
              </div>
            )}
          </Panel>
        </aside>
      </div>
    </>
  )
}
