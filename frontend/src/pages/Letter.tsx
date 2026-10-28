// Read a letter: drop a PDF, a scan or a photo. Ekatra reads it in the browser (the file is never uploaded or stored),
// fills the form with what it found (each field shows the words it came from), finds the institution, and shows what
// other units have already asked that institution for. The officer checks the facts and records the request.
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, CheckCircle2, FileSearch, FileText, GitCompare, Link2, PenLine, ScanLine, ShieldCheck, Upload } from 'lucide-react'
import { LetterTimeline, LogicStrip } from '../components/Logic'
import clsx from 'clsx'
import { api } from '../lib/api'
import { useUser } from '../hooks/useUser'
import { readLetterFile, type ReadResult } from '../lib/ocr'
import { work, SERVER_ONLY, type LetterRead, type InstLite } from '../lib/workApi'
import { fieldCls } from '../components/Dialog'
import { UnitPill } from '../components/Unit'
import { FindingCard, From, ServerOnly } from '../components/WorkBits'
import { Button, ErrorBox, PageHead, Panel, Step, fmtDate } from '../components/ui'
import { STAGE_LABEL, categoryLabel } from '../lib/labels'
import type { Lifecycle } from '../lib/types'

const SAMPLES = [
  { file: '01-rb-wr-show-cause.txt', label: 'RB-WR show-cause notice' },
  { file: '02-pgrc-information-request.txt', label: 'PGRC asks for documents' },
  { file: '03-rb-swr-reminder.txt', label: 'Reminder, name only' },
  { file: '06-pgrc-request-digital.pdf', label: 'Digital PDF' },
  { file: '04-scanned-show-cause.png', label: 'Scanned photo (OCR)' },
]
const METHOD: Record<ReadResult['method'], string> = { text_file: 'Text file, read as it is', pdf_text: 'Digital PDF: exact text, no OCR needed', ocr: 'Scan or photo: read by OCR (English and Hindi)' }
const WRITERS = ['dealing_officer', 'nodal_officer', 'coordinator', 'data_steward']

interface Form {
  kind: string; unit: string; letterRef: string; letterDate: string; dueOn: string; hearingOn: string; hearingWhat: string
  items: string[]; otherItems: string[]; institution: InstLite | null; caseId: string | null
}

function formFrom(r: LetterRead, unit: string | undefined): Form {
  return {
    kind: r.facts.kind.kind, unit: r.draft.unit ?? unit ?? '', letterRef: r.draft.letterRef ?? '', letterDate: r.draft.letterDate, dueOn: r.draft.dueOn ?? '',
    hearingOn: r.draft.hearingOn ?? '', hearingWhat: r.draft.hearingWhat ?? '', items: r.draft.items, otherItems: [], institution: r.match.institution,
    caseId: r.case && r.case.unit === (r.draft.unit ?? unit) ? r.case.id : null,
  }
}

export default function Letter() {
  const { user } = useUser()
  const qc = useQueryClient()
  const meta = useQuery({ queryKey: ['meta'], queryFn: api.meta })
  const vocab = useQuery({ queryKey: ['requests', 'vocab'], queryFn: () => work.requests({ state: 'none' }), enabled: !SERVER_ONLY })
  const fileRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [read, setRead] = useState<ReadResult | null>(null)
  const [progress, setProgress] = useState<{ stage: string; pct: number } | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [drag, setDrag] = useState(false)

  const facts = useMutation({
    mutationFn: (t: string) => work.readLetter(t),
    onSuccess: (r) => setForm(formFrom(r, user.unit)),
  })
  const save = useMutation({
    mutationFn: () => work.createRequest({
      institutionId: form!.institution!.id, unit: form!.unit, caseId: form!.caseId, kind: form!.kind, letterRef: form!.letterRef || null, letterDate: form!.letterDate,
      items: form!.items, otherItems: form!.otherItems, dueOn: form!.dueOn || null, hearingOn: form!.hearingOn || null, hearingWhat: form!.hearingWhat || null, text,
    }),
    onSuccess: () => qc.invalidateQueries(),
  })

  if (SERVER_ONLY) return <><PageHead icon={<FileSearch size={22} />} title="Read a letter" /><ServerOnly /></>

  const start = async (t: string, r: ReadResult | null) => {
    setText(t); setRead(r); setForm(null); save.reset()
    if (t.trim().length >= 40) facts.mutate(t)
  }
  const onFile = async (f: File | undefined) => {
    if (!f) return
    setFileError(null); setProgress({ stage: 'Starting', pct: 1 })
    try {
      const r = await readLetterFile(f, (stage, pct) => setProgress({ stage, pct }))
      await start(r.text, r)
    } catch (e) {
      setFileError(e instanceof Error ? e.message : 'The file could not be read.')
    } finally { setProgress(null) }
  }
  const sample = async (file: string) => {
    const blob = await fetch(`/samples/${file}`).then((r) => r.blob())
    await onFile(new File([blob], file, { type: file.endsWith('.pdf') ? 'application/pdf' : file.endsWith('.png') ? 'image/png' : 'text/plain' }))
  }
  const r = facts.data
  const set = (p: Partial<Form>) => setForm((f) => (f ? { ...f, ...p } : f))
  const canWrite = WRITERS.includes(user.role)
  const officer = user.role === 'dealing_officer' || user.role === 'nodal_officer'
  const unsure = read?.method === 'ocr' && (read.confidence ?? 100) < 80

  return (
    <>
      <PageHead icon={<FileSearch size={22} />} title="Read a letter"
        lead="Drop a letter. The form fills itself. The letter is not uploaded or saved." />

      <LogicStrip steps={[
        { icon: Upload, title: 'Drop', text: 'PDF, scan or photo. Stays on this computer.', tone: 'person' },
        { icon: ScanLine, title: 'Read', text: 'PDF text exactly; scans by OCR.' },
        { icon: FileText, title: 'Extract', text: 'Dates, IDs, documents asked.' },
        { icon: Link2, title: 'Match', text: 'IDs link. A name is only a suggestion.' },
        { icon: GitCompare, title: 'Compare', text: 'With other units’ letters.' },
        { icon: PenLine, title: 'Record', text: 'You check, then save.', tone: 'person' },
      ]} foot="Synthetic data. Time windows are prototype settings." />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-6">
          <Panel>
            <Step n={1} title="Drop the letter" hint="PDF from e-Office, a scan, a phone photo, or a text file." />
            <button type="button" onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files[0]) }}
              className={clsx('mt-4 flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition',
                drag ? 'border-ink-700 bg-ink-50' : 'border-line hover:border-ink-500 hover:bg-ink-50/50')}>
              <Upload size={26} className="text-ink-700" aria-hidden />
              <span className="font-display text-16 font-semibold text-ink-950">Drop a file here, or click to choose</span>
              <span className="text-13 text-muted">PDF, JPG, PNG or TXT</span>
            </button>
            <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,application/pdf,image/*,text/plain" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} aria-label="Choose a letter file" />
            {progress && (
              <div className="mt-4" role="status">
                <p className="text-13 text-ink-950">{progress.stage}…</p>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full bg-ink-700 transition-all" style={{ width: `${Math.round(progress.pct)}%` }} /></div>
                <p className="mt-1 text-12 text-muted">The first OCR on this computer downloads the English and Hindi reading data once (about 15 MB).</p>
              </div>
            )}
            {fileError && <p className="mt-3 rounded-lg bg-tape/10 px-3 py-2 text-13 text-tape">{fileError}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-13 text-muted">Try a sample:</span>
              {SAMPLES.map((s) => <button key={s.file} type="button" onClick={() => sample(s.file)} className="rounded-full border border-line px-3 py-1 text-13 hover:border-ink-500">{s.label}</button>)}
            </div>
          </Panel>

          <Panel>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <Step n={2} title="The text Ekatra read" hint="Correct anything the scan got wrong, then read it again." />
              {read && <span className="flex items-center gap-1.5 rounded-full bg-ink-50 px-3 py-1 text-12 text-ink-900">{read.method === 'ocr' ? <ScanLine size={13} aria-hidden /> : <FileText size={13} aria-hidden />}{METHOD[read.method]}</span>}
            </div>
            {read?.method === 'ocr' && (
              <p className={clsx('mt-3 rounded-lg px-3 py-2 text-13', unsure ? 'bg-turmeric/10 text-ink-950' : 'bg-good/10 text-ink-950')}>
                OCR confidence {read.confidence}%{read.how ? ` (best reading: ${read.how})` : ''}. {unsure ? 'Check the dates and numbers below against the letter. For a better reading, photograph the page flat, in daylight, filling the frame.' : 'Still check dates and numbers before saving.'}
                {!!read.unsure?.length && <span className="mt-1 block text-12 text-muted">Words read with low confidence: {read.unsure.slice(0, 12).join(', ')}</span>}
              </p>
            )}
            <textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} className={clsx(fieldCls, 'font-mono text-12')} placeholder="Or paste the letter's text here." aria-label="Letter text" />
            <div className="mt-3 flex justify-end"><Button onClick={() => start(text, read)} disabled={text.trim().length < 40 || facts.isPending}>{facts.isPending ? 'Reading…' : r ? 'Read again' : 'Read the letter'}</Button></div>
            {facts.isError && <div className="mt-3"><ErrorBox error={facts.error} /></div>}
          </Panel>
        </div>

        <div className="space-y-6">
          {!r && !facts.isPending && (
            <Panel><div className="py-10 text-center text-14 text-muted">The facts from the letter appear here, each with the words it was read from.</div></Panel>
          )}
          {r && form && (
            <>
              {r.alreadyRecorded && <p className="rounded-xl border border-turmeric/40 bg-turmeric/10 px-4 py-3 text-14 text-ink-950">This letter was already recorded by {r.alreadyRecorded.by} on {fmtDate(r.alreadyRecorded.at.slice(0, 10))}.</p>}
              <Panel>
                <Step n={3} title="Check what was read" hint="Change anything that is wrong. Nothing is saved until you press Record." />
                <div className="mt-4 space-y-5">
                  <Institution r={r} chosen={form.institution} onPick={(i) => set({ institution: i })} />
                  <div>
                    <p className="text-13 font-medium text-text">Kind of letter</p>
                    <div className="mt-2 flex flex-wrap gap-2">{(vocab.data?.kinds ?? []).map((k) => (
                      <button key={k.key} type="button" aria-pressed={form.kind === k.key} onClick={() => set({ kind: k.key })}
                        className={clsx('rounded-full border px-3 py-1 text-13', form.kind === k.key ? 'border-ink-700 bg-ink-700 text-white' : 'border-line hover:border-ink-500')}>{k.label}</button>))}</div>
                    <From text={r.facts.kind.from} />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-13 font-medium text-text">Sent by
                      <select className={fieldCls} value={form.unit} onChange={(e) => set({ unit: e.target.value, caseId: null })} disabled={officer}>
                        <option value="">Choose a unit</option>{(meta.data as { units?: { code: string; name: string }[] } | undefined)?.units?.map((u) => <option key={u.code} value={u.code}>{u.code}: {u.name}</option>)}
                      </select><From text={r.facts.unit?.from} />
                      {officer && r.facts.unit && r.facts.unit.unit !== user.unit && <span className="mt-1 block text-12 text-tape">The letter is from {r.facts.unit.unit}. You can record only {user.unit}’s letters.</span>}
                    </label>
                    <label className="block text-13 font-medium text-text">Letter number<input className={fieldCls} value={form.letterRef} onChange={(e) => set({ letterRef: e.target.value })} />
                      <From text={r.facts.refs.map((x) => x.value).join(' · ')} /></label>
                    <label className="block text-13 font-medium text-text">Letter date<input type="date" className={fieldCls} value={form.letterDate} onChange={(e) => set({ letterDate: e.target.value })} />
                      <From text={r.facts.letterDate?.from} /></label>
                    <label className="block text-13 font-medium text-text">Reply due by<input type="date" className={fieldCls} value={form.dueOn} onChange={(e) => set({ dueOn: e.target.value })} />
                      <From text={r.facts.dueOn ? `${r.facts.dueOn.from}${r.facts.dueOn.how !== 'date' ? ` (${r.facts.dueOn.how})` : ''}` : 'No reply date found in the letter.'} /></label>
                    <label className="block text-13 font-medium text-text">Hearing or visit on<input type="date" className={fieldCls} value={form.hearingOn} onChange={(e) => set({ hearingOn: e.target.value })} />
                      <From text={r.facts.hearing?.from} /></label>
                    <label className="block text-13 font-medium text-text">What happens that day<input className={fieldCls} value={form.hearingWhat} onChange={(e) => set({ hearingWhat: e.target.value })} placeholder="For example: SHC hearing" /></label>
                  </div>
                  <div>
                    <p className="text-13 font-medium text-text">What the institution is asked to send</p>
                    <div className="mt-2 flex flex-wrap gap-2">{(vocab.data?.items ?? []).map((it) => { const on = form.items.includes(it.key); return (
                      <button key={it.key} type="button" aria-pressed={on} onClick={() => set({ items: on ? form.items.filter((k) => k !== it.key) : [...form.items, it.key] })}
                        className={clsx('rounded-full border px-3 py-1 text-13', on ? 'border-ink-700 bg-ink-700 text-white' : 'border-line text-muted hover:border-ink-500')}>{it.label}</button>) })}</div>
                    <ul className="mt-2 space-y-1">{r.facts.items.map((i) => <li key={i.key}><From text={`${i.label}: ${i.from}`} /></li>)}</ul>
                    {r.facts.listed.length > 0 && (
                      <div className="mt-3 rounded-lg bg-paper px-3 py-2">
                        <p className="text-12 font-medium text-muted">Listed in the letter (tick to keep in its own words)</p>
                        {r.facts.listed.map((t) => (
                          <label key={t} className="mt-1 flex items-start gap-2 text-13 text-ink-950"><input type="checkbox" className="mt-1" checked={form.otherItems.includes(t)} onChange={(e) => set({ otherItems: e.target.checked ? [...form.otherItems, t] : form.otherItems.filter((x) => x !== t) })} />{t}</label>
                        ))}
                      </div>
                    )}
                  </div>
                  {r.case && (
                    <label className="flex items-start gap-2 rounded-lg bg-paper px-3 py-2 text-13 text-ink-950">
                      <input type="checkbox" className="mt-1" checked={form.caseId === r.case.id} disabled={r.case.unit !== form.unit} onChange={(e) => set({ caseId: e.target.checked ? r.case!.id : null })} />
                      <span>Add to case <Link className="font-mono underline" to={`/cases/${r.case.id}`}>{r.case.uid}</Link> ({r.case.unit}, {STAGE_LABEL[r.case.stage as Lifecycle]?.toLowerCase()}). The letter number {r.case.from} is on that case.</span>
                    </label>
                  )}
                </div>
              </Panel>

              <Panel>
                <Step n={4} title="What other units have already asked" hint="Facts from the requests and cases on record. You decide what to do." />
                {!form.institution && <p className="mt-3 text-14 text-muted">Choose the institution above to see this.</p>}
                {form.institution && (
                  <div className="mt-4 space-y-4">
                    <LetterTimeline today={api.today} rows={[
                      ...r.requests.filter((q) => q.state !== 'withdrawn').map((q) => ({ ...q, key: q.id })),
                      { key: 'draft', draft: true, unit: form.unit || '?', letterDate: form.letterDate, dueOn: form.dueOn || null, hearingOn: form.hearingOn || null, hearingWhat: form.hearingWhat || null, state: 'open' as const,
                        itemLabels: (vocab.data?.items ?? []).filter((i) => form.items.includes(i.key)).map((i) => i.label) },
                    ]} />
                    {r.findings.length ? <ul className="space-y-2">{r.findings.map((f) => <FindingCard key={f.code + f.text} f={f} />)}</ul>
                      : <p className="flex items-center gap-2 text-14 text-ink-950"><CheckCircle2 size={16} className="text-good" aria-hidden />No other unit has asked this institution for the same documents, and no reply date falls near another unit’s hearing.</p>}
                    {r.openCases.length > 0 && (
                      <div><p className="text-13 font-medium text-text">Open cases at this institution</p>
                        <ul className="mt-2 flex flex-wrap gap-2">{r.openCases.map((c) => (
                          <li key={c.id}><Link to={`/cases/${c.id}`} className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-13 hover:border-ink-500"><UnitPill code={c.unit} /><span className="font-mono">{c.uid}</span><span className="text-muted">{categoryLabel(c.category as never)}</span></Link></li>))}</ul></div>
                    )}
                    {r.requests.length > 0 && (
                      <div><p className="text-13 font-medium text-text">Requests already sent to this institution</p>
                        <ul className="mt-2 divide-y divide-line rounded-xl border border-line">{r.requests.map((q) => (
                          <li key={q.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-13"><UnitPill code={q.unit} /><span>{q.kindLabel} of {fmtDate(q.letterDate)}</span>
                            <span className="text-muted">{q.itemLabels.join(', ') || q.otherItems.join('; ')}</span>
                            <span className={clsx('ml-auto rounded-full px-2 py-0.5 text-12', q.state === 'answered' ? 'bg-good/10 text-good' : q.daysLate ? 'bg-tape/10 text-tape' : 'bg-ink-50 text-ink-900')}>
                              {q.state === 'answered' ? `Answered ${fmtDate(q.answeredOn!)}` : q.daysLate ? `Reply ${q.daysLate} days late` : q.dueOn ? `Reply due ${fmtDate(q.dueOn)}` : 'Open'}</span></li>))}</ul></div>
                    )}
                  </div>
                )}
              </Panel>

              <Panel>
                {save.isSuccess ? (
                  <div className="space-y-3">
                    <p className="flex items-center gap-2 font-display text-18 font-semibold text-ink-950"><CheckCircle2 size={20} className="text-good" aria-hidden />Request recorded</p>
                    <p className="text-14 text-muted">Every unit working on {form.institution?.name} now sees it. Ekatra will flag it if the reply is late. The letter text was not saved.</p>
                    <div className="flex flex-wrap gap-2"><Link className="rounded-full bg-ink-700 px-4 py-2 text-14 text-white" to={`/institutions/${form.institution?.id}`}>Open the institution</Link><Link className="rounded-full border border-line px-4 py-2 text-14" to="/requests">All requests</Link></div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="flex items-center gap-2 text-13 text-muted"><ShieldCheck size={15} aria-hidden />Only the facts above are saved, with your name, and written to the audit log.</p>
                    <Button onClick={() => save.mutate()} disabled={!canWrite || !form.institution || !form.unit || save.isPending || (!form.items.length && !form.otherItems.length && !['hearing_notice', 'inspection', 'closure'].includes(form.kind))}>
                      {save.isPending ? 'Saving…' : 'Record the request'}</Button>
                  </div>
                )}
                {!canWrite && <p className="mt-2 text-12 text-muted">Your role can read letters but not record them.</p>}
                {save.isError && <div className="mt-3"><ErrorBox error={save.error} /></div>}
              </Panel>
            </>
          )}
        </div>
      </div>
    </>
  )
}

function Institution({ r, chosen, onPick }: { r: LetterRead; chosen: InstLite | null; onPick: (i: InstLite | null) => void }) {
  const words = useMemo(() => [r.facts.institutionName?.from, r.facts.ids.permanentId?.from, r.facts.ids.currentId?.from, r.facts.ids.aisheCode?.from].filter(Boolean).join(' · '), [r])
  if (chosen) return (
    <div className="rounded-xl border border-good/30 bg-good/5 px-4 py-3">
      <p className="flex items-center gap-2 text-14 font-semibold text-ink-950"><Building2 size={16} aria-hidden />{chosen.name}<span className="font-mono text-12 font-normal text-muted">{chosen.permanentId}</span></p>
      <p className="mt-1 text-13 text-muted">{r.match.institution?.id === chosen.id ? r.match.evidence.join(' ') : 'Chosen by you from the suggestions.'}</p>
      <From text={words} />
      {r.match.institution?.id !== chosen.id && <button type="button" className="mt-1 text-12 underline" onClick={() => onPick(null)}>Choose again</button>}
    </div>
  )
  return (
    <div className="rounded-xl border border-turmeric/40 bg-turmeric/5 px-4 py-3">
      <p className="text-14 font-semibold text-ink-950">Which institution? A name alone never links on its own.</p>
      <From text={words || 'The letter names no institution and has no ID.'} />
      {r.match.suggestions.length > 0 && (
        <ul className="mt-2 space-y-1.5">{r.match.suggestions.map((s) => (
          <li key={s.institutionId}><button type="button" onClick={() => onPick(s.institution)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2 text-left text-13 hover:border-ink-500">
            <span><span className="font-medium text-ink-950">{s.institution.name}</span> <span className="text-muted">{s.institution.district}</span></span><span className="font-mono text-12 text-muted">{Math.round(s.score * 100)}% similar</span></button></li>))}</ul>
      )}
    </div>
  )
}
