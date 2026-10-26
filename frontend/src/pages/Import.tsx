// Import a file from a unit, in four steps. Nothing is saved until the last step, and every row that
// cannot be saved says why and how to fix it.
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Check, Download, FileUp, RotateCcw, Upload, X } from 'lucide-react'
import clsx from 'clsx'
import { api } from '../lib/api'
import { useUser } from '../hooks/useUser'
import { IMPORT_COLUMNS, parseCsv, templateCsv } from '../lib/imports'
import { saveText } from '../lib/download'
import { STAGE_LABEL } from '../lib/labels'
import { UnitPill } from '../components/Unit'
import { Button, ErrorBox, PageHead, Panel, Step, btn, fmtDate } from '../components/ui'
import type { ImportRow, Lifecycle } from '../lib/types'

const STAGES: Lifecycle[] = ['received', 'under_examination', 'awaiting_party', 'inspection_hearing', 'escalated', 'transferred', 'disposed']

export default function Import() {
  const { user } = useUser()
  const nav = useNavigate()
  const qc = useQueryClient()
  const meta = useQuery({ queryKey: ['meta'], queryFn: api.meta })
  const past = useQuery({ queryKey: ['imports'], queryFn: api.imports })
  const steward = user.role === 'data_steward' || user.role === 'coordinator'
  const [unit, setUnit] = useState(user.unit ?? '')
  const [file, setFile] = useState<{ name: string; rows: ImportRow[] } | null>(null)
  const [readErr, setReadErr] = useState<string | null>(null)
  const [meaning, setMeaning] = useState<Record<string, Lifecycle>>({})
  const check = useQuery({ queryKey: ['import-check', unit, file?.name, file?.rows.length], queryFn: () => api.importCheck(unit, file!.rows), enabled: !!file && !!unit })
  const saveMeanings = useMutation({
    mutationFn: async () => { for (const [w, s] of Object.entries(meaning)) await api.saveStatusMeaning(unit, w, s, user) },
    onSuccess: () => { setMeaning({}); check.refetch() },
  })
  const commit = useMutation({ mutationFn: () => api.importCommit(unit, file!.name, file!.rows, user), onSuccess: (b) => { qc.invalidateQueries(); nav(`/import/${b.id}`) } })
  const canImport = steward || ((user.role === 'dealing_officer' || user.role === 'nodal_officer') && !!user.unit)

  const read = async (f: File | undefined) => {
    setReadErr(null)
    if (!f) return
    if (!/\.csv$/i.test(f.name)) { setReadErr('Please choose a .csv file. In Excel: File, Save As, “CSV UTF-8”. (Excel files are read directly once the backend is connected.)'); return }
    if (f.size > 2_000_000) { setReadErr('This file is larger than 2 MB. Split it into smaller files.'); return }
    const rows = parseCsv(await f.text())
    const missing = IMPORT_COLUMNS.filter((c) => c.required && rows.length && !(c.key in rows[0])).map((c) => c.key)
    if (!rows.length) { setReadErr('No rows found. Check that the first line has the column names.'); return }
    if (missing.length) { setReadErr(`These columns are missing: ${missing.join(', ')}. Download the template to see the expected columns.`); return }
    setFile({ name: f.name, rows })
  }

  const c = check.data
  const counts = c ? { new: c.rows.filter((r) => r.outcome === 'new').length, update: c.rows.filter((r) => r.outcome === 'update').length, reject: c.rows.filter((r) => r.outcome === 'reject').length } : null
  const step = !file || !unit ? 1 : c?.unknownStatuses.length ? 3 : 4

  return (
    <>
      <PageHead kind="import" icon={<FileUp size={22} />} title="Import cases from a file" lead="Send in your unit’s cases as a file. Ekatra checks every row first and saves nothing until you confirm." />
      {!canImport && <p className="mb-5 rounded-xl bg-ink-50 px-4 py-2.5 text-13 text-ink-900">Only unit officers and data stewards can import.</p>}

      <ol className="mb-6 grid gap-2 sm:grid-cols-4" aria-label="Steps">
        {['Choose the file', 'Check every row', 'Explain new status words', 'Save'].map((t, i) => (
          <li key={t} className={clsx('flex items-center gap-2 rounded-xl border px-3 py-2 text-13', step === i + 1 ? 'border-ink-700 bg-ink-50 font-semibold text-ink-900' : step > i + 1 ? 'border-line bg-surface text-good' : 'border-line bg-surface text-muted')}>
            <span className={clsx('flex h-6 w-6 items-center justify-center rounded-full font-mono text-12', step > i + 1 ? 'bg-good text-white' : step === i + 1 ? 'bg-ink-700 text-white' : 'bg-paper')}>{step > i + 1 ? <Check size={13} /> : i + 1}</span>{t}
          </li>
        ))}
      </ol>

      <div className="space-y-6">
        <Panel>
          <Step n={1} title="Choose the unit and the file" hint="A .csv file with one case per row. The template shows the columns." />
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <label className="text-13 font-medium text-text">Unit
              <select disabled={!steward} className="mt-1 block rounded-xl border border-line bg-surface px-3.5 py-2.5 text-14 disabled:opacity-70" value={unit} onChange={(e) => { setUnit(e.target.value); setFile(null) }}>
                <option value="">Choose a unit</option>{meta.data?.units.map((u) => <option key={u.code} value={u.code}>{u.code} — {u.name}</option>)}
              </select>
            </label>
            <label className={btn('secondary', 'cursor-pointer')}><Upload size={15} aria-hidden />{file ? 'Choose another file' : 'Choose a file'}
              <input type="file" accept=".csv,text/csv" className="sr-only" disabled={!canImport} onChange={(e) => { read(e.target.files?.[0]); e.target.value = '' }} /></label>
            <button type="button" className={btn('quiet')} onClick={() => saveText('ekatra-import-template.csv', templateCsv())}><Download size={15} aria-hidden />Download the template</button>
          </div>
          {file && <p className="mt-3 text-14 text-text"><strong>{file.name}</strong>: {file.rows.length} rows read.</p>}
          {readErr && <div className="mt-3"><ErrorBox error={new Error(readErr)} /></div>}
          <details className="mt-4 text-13">
            <summary className="cursor-pointer font-medium text-ink-700">What columns are needed?</summary>
            <table className="mt-2 w-full text-left"><tbody className="divide-y divide-line">{IMPORT_COLUMNS.map((col) => (
              <tr key={col.key}><td className="py-1 pr-3 font-mono text-12">{col.key}</td><td className="py-1 pr-3">{col.label}{col.required && <span className="text-tape"> *</span>}</td><td className="py-1 text-muted">{col.hint}</td></tr>
            ))}</tbody></table>
          </details>
        </Panel>

        {file && unit && (
          <Panel title="Check every row" note="Nothing is saved yet.">
            {check.isError ? <ErrorBox error={check.error} /> : !c ? <p className="text-14 text-muted">Checking…</p> : (
              <>
                <div className="mb-4 flex flex-wrap gap-3 text-14">
                  <span className="rounded-full bg-good-soft px-3 py-1 font-semibold text-good">{counts!.new} new</span>
                  <span className="rounded-full bg-ink-50 px-3 py-1 font-semibold text-ink-900">{counts!.update} will update a case already here</span>
                  <span className={clsx('rounded-full px-3 py-1 font-semibold', counts!.reject ? 'bg-tape-soft text-tape' : 'bg-paper text-muted')}>{counts!.reject} cannot be saved yet</span>
                </div>
                <div className="max-h-96 overflow-auto rounded-xl border border-line">
                  <table className="w-full min-w-[720px] text-left text-13">
                    <thead className="sticky top-0 bg-paper text-12 text-muted"><tr><th className="px-3 py-2 font-medium">Row</th><th className="px-3 py-2 font-medium">Reference</th><th className="px-3 py-2 font-medium">Institution</th><th className="px-3 py-2 font-medium">Result</th><th className="px-3 py-2 font-medium">What we found</th></tr></thead>
                    <tbody className="divide-y divide-line">
                      {c.rows.map((r) => (
                        <tr key={r.row} className={r.outcome === 'reject' ? 'bg-tape-soft/40' : ''}>
                          <td className="px-3 py-2 font-mono">{r.row}</td>
                          <td className="px-3 py-2 font-mono">{r.data.source_reference || '—'}</td>
                          <td className="px-3 py-2">{r.data.institution_name || '—'}</td>
                          <td className="px-3 py-2">{r.outcome === 'new' ? <span className="inline-flex items-center gap-1 text-good"><Check size={13} aria-hidden />New</span> : r.outcome === 'update' ? <span className="inline-flex items-center gap-1 text-ink-700"><RotateCcw size={13} aria-hidden />Update</span> : <span className="inline-flex items-center gap-1 text-tape"><X size={13} aria-hidden />Not yet</span>}</td>
                          <td className="px-3 py-2">{r.problems.map((p, i) => <div key={i}><strong>{p.field}:</strong> {p.problem} <span className="text-muted">{p.fix}</span></div>)}{(r.notes ?? []).map((n, i) => <div key={`n${i}`} className={n.includes('same complaint number') ? 'font-medium text-turmeric' : 'text-muted'}>{n}</div>)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Panel>
        )}

        {c && c.unknownStatuses.length > 0 && (
          <Panel title="Explain new status words" note={`${unit} uses some words we have not seen before. Say once what each means; it will be remembered.`}>
            <ul className="space-y-4">
              {c.unknownStatuses.map((w) => (
                <li key={w}>
                  <p className="text-14 text-text">“<strong>{w}</strong>” means:</p>
                  <div className="mt-2 flex flex-wrap gap-2">{STAGES.map((s) => (
                    <label key={s} className={clsx('cursor-pointer rounded-full border px-3 py-1 text-13 focus-within:ring-2 focus-within:ring-ink-500', meaning[w] === s ? 'border-ink-700 bg-ink-700 text-white' : 'border-line hover:border-ink-500')}>
                      <input type="radio" className="sr-only" name={`m-${w}`} checked={meaning[w] === s} onChange={() => setMeaning({ ...meaning, [w]: s })} />{STAGE_LABEL[s]}</label>))}</div>
                </li>
              ))}
            </ul>
            {saveMeanings.isError && <div className="mt-3"><ErrorBox error={saveMeanings.error} /></div>}
            <Button className="mt-4" disabled={Object.keys(meaning).length < c.unknownStatuses.length || saveMeanings.isPending} onClick={() => saveMeanings.mutate()}>Save meanings and check again</Button>
          </Panel>
        )}

        {c && (
          <Panel>
            <Step n={4} title="Save" hint="Rows that cannot be saved are kept on the receipt with their fixes, so you can send them again." />
            {commit.isError && <div className="mt-3"><ErrorBox error={commit.error} /></div>}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button disabled={!canImport || commit.isPending || c.unknownStatuses.length > 0 || counts!.new + counts!.update === 0} onClick={() => commit.mutate()}>{commit.isPending ? 'Saving…' : `Save ${counts!.new + counts!.update} rows`}</Button>
              {c.unknownStatuses.length > 0 && <span className="text-13 text-turmeric">Explain the new status words first.</span>}
            </div>
          </Panel>
        )}

        <Panel title="Files sent in before">
          {!past.data ? <p className="text-14 text-muted">Loading…</p> : (
            <ul className="divide-y divide-line">
              {past.data.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-14">
                  <UnitPill code={b.unit} />
                  <Link to={`/import/${b.id}`} className="flex-1 font-mono text-13 text-ink-950 hover:underline">{b.fileName}</Link>
                  <span className="text-13 text-muted">{b.rows} rows · {b.created} new · {b.updated} updated · <span className={b.rejected ? 'font-semibold text-tape' : ''}>{b.rejected} not saved</span></span>
                  <span className="font-mono text-12 text-muted">{fmtDate(b.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  )
}
