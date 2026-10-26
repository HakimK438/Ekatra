// The page an institution opens from its one-time link. It shows only this one request: what AICTE asked for
// and by when. The institution uploads its reply and gets a receipt with a fingerprint for each file.
import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { CheckCircle2, FileText, Paperclip, ShieldCheck, Trash2, Upload } from 'lucide-react'
import { api } from '../lib/api'
import { sha256 } from '../lib/download'
import { Button, ErrorBox, Skeleton, fmtDate } from '../components/ui'

const MAX_FILES = 5
const MAX_BYTES = 5 * 1024 * 1024
const OK_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']

type Picked = { name: string; size: number; type: string; sha256: string }

export default function Reply() {
  const { token = '' } = useParams()
  const info = useQuery({ queryKey: ['reply', token], queryFn: () => api.replyInfo(token), retry: false })
  const [note, setNote] = useState('')
  const [files, setFiles] = useState<Picked[]>([])
  const [fileErr, setFileErr] = useState<string | null>(null)
  const send = useMutation({ mutationFn: () => api.submitReply(token, { note, files }) })

  const add = async (list: FileList | null) => {
    setFileErr(null)
    if (!list) return
    const picked: Picked[] = []
    for (const f of [...list]) {
      if (!OK_TYPES.includes(f.type)) { setFileErr(`“${f.name}” is not a PDF, JPG, PNG or Word file.`); continue }
      if (f.size > MAX_BYTES) { setFileErr(`“${f.name}” is larger than 5 MB.`); continue }
      picked.push({ name: f.name, size: f.size, type: f.type, sha256: await sha256(f) })
    }
    setFiles((prev) => [...prev, ...picked].slice(0, MAX_FILES))
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-ink-800 text-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white"><img src="/img/aicte-logo.png" alt="" className="h-7 w-7" /></span>
          <div className="leading-tight"><div className="font-display text-17 font-semibold">Reply to AICTE</div><div className="text-12 text-white/70">Ekatra · secure one-time link</div></div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        {info.isError ? <ErrorBox error={info.error} /> : !info.data ? <Skeleton className="h-80" /> : send.data || info.data.state === 'received' ? (
          <section className="rounded-panel border border-line bg-surface p-6 shadow-card" aria-live="polite">
            <p className="flex items-center gap-2 font-display text-22 font-semibold text-good"><CheckCircle2 size={24} aria-hidden />Your reply has been received</p>
            <p className="mt-2 text-15 text-text">Thank you. {info.data.unit} will read it and contact you if anything more is needed.</p>
            {send.data ? (
              <dl className="mt-5 space-y-3 rounded-xl bg-paper p-4 text-14">
                <div><dt className="text-12 text-muted">Receipt number</dt><dd className="font-mono font-semibold">{send.data.receipt}</dd></div>
                <div><dt className="text-12 text-muted">Received at</dt><dd>{send.data.at.replace('T', ' at ')}</dd></div>
                {send.data.files.length > 0 && <div><dt className="text-12 text-muted">Files and their fingerprints</dt><dd><ul className="mt-1 space-y-1">{send.data.files.map((f) => <li key={f.sha256} className="text-13"><span className="font-medium">{f.name}</span><div className="break-all font-mono text-11 text-muted">{f.sha256}</div></li>)}</ul></dd></div>}
              </dl>
            ) : <p className="mt-3 text-14 text-muted">Received on {fmtDate(info.data.receivedAt!)} with {info.data.files.length} file{info.data.files.length === 1 ? '' : 's'}. This link has been used.</p>}
            <p className="mt-4 text-12 text-muted">Keep the receipt number. The fingerprint changes if a file is altered, so it shows exactly what you sent.</p>
          </section>
        ) : (
          <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); send.mutate() }}>
            <section className="rounded-panel border border-line bg-surface p-6 shadow-card">
              <p className="text-13 text-muted">To</p>
              <h1 className="font-display text-24 font-semibold text-ink-950">{info.data.institution}</h1>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                <div><dt className="text-12 text-muted">From</dt><dd className="text-15">{info.data.unit}</dd></div>
                <div><dt className="text-12 text-muted">AICTE reference</dt><dd className="font-mono text-15">{info.data.caseRef}</dd></div>
                <div className="sm:col-span-2"><dt className="text-12 text-muted">What we need from you</dt><dd className="mt-1 rounded-xl bg-paper p-3 text-16 text-ink-950">{info.data.askedFor}</dd></div>
                <div><dt className="text-12 text-muted">Please reply by</dt><dd className="font-display text-20 font-semibold text-ink-950">{fmtDate(info.data.dueOn)}</dd></div>
              </dl>
            </section>

            <section className="rounded-panel border border-line bg-surface p-6 shadow-card">
              <h2 className="font-display text-18 font-semibold text-ink-950">Your reply</h2>
              <label className="mt-3 block text-13 font-medium text-text">Message (optional)
                <textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 block w-full rounded-xl border border-line bg-surface px-4 py-3 text-14 focus:border-ink-500 focus:outline-none focus:ring-4 focus:ring-ink-100" placeholder="A short note about what you are sending." />
              </label>
              <div className="mt-4">
                <p className="text-13 font-medium text-text">Documents <span className="font-normal text-muted">(PDF, JPG, PNG or Word; up to {MAX_FILES} files, 5 MB each)</span></p>
                <label className="mt-2 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line px-4 py-6 text-14 text-muted hover:border-ink-500 focus-within:border-ink-500">
                  <Upload size={20} aria-hidden /><span><span className="font-semibold text-ink-700">Choose files</span> to attach</span>
                  <input type="file" multiple className="sr-only" accept=".pdf,.jpg,.jpeg,.png,.docx" onChange={(e) => { add(e.target.files); e.target.value = '' }} disabled={files.length >= MAX_FILES} />
                </label>
                {fileErr && <p className="mt-2 text-13 text-tape" role="alert">{fileErr}</p>}
                {files.length > 0 && (
                  <ul className="mt-3 space-y-2">{files.map((f, i) => (
                    <li key={f.sha256 + i} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2 text-13">
                      <FileText size={16} className="shrink-0 text-muted" aria-hidden />
                      <span className="min-w-0 flex-1"><span className="block truncate font-medium">{f.name}</span><span className="font-mono text-11 text-muted">fingerprint {f.sha256.slice(0, 16)}… · {Math.round(f.size / 1024)} KB</span></span>
                      <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="rounded-full p-1 text-muted hover:bg-paper hover:text-tape" aria-label={`Remove ${f.name}`}><Trash2 size={15} /></button>
                    </li>
                  ))}</ul>
                )}
              </div>
              {send.isError && <div className="mt-4"><ErrorBox error={send.error} /></div>}
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={send.isPending || (!files.length && !note.trim())}><Paperclip size={15} aria-hidden />{send.isPending ? 'Sending…' : 'Send reply'}</Button>
                <span className="inline-flex items-center gap-1.5 text-12 text-muted"><ShieldCheck size={14} aria-hidden />This link works once and shows only this request.</span>
              </div>
            </section>
          </form>
        )}
      </main>
      <footer className="pb-8 text-center text-12 text-muted">Prototype — synthetic data — not an official AICTE system</footer>
    </div>
  )
}
