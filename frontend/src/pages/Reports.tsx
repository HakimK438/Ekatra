// Reports: ready-made reports by unit, age, period, overlaps and region. Each has a one-line takeaway, a chart,
// the full table, and exports (CSV, or print / save as PDF) marked as synthetic and written to the audit log.
import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BarChart3, Download, Printer } from 'lucide-react'
import clsx from 'clsx'
import { api, REPORTS, type ReportType } from '../lib/api'
import { useUser } from '../hooks/useUser'
import { saveText } from '../lib/download'
import { AGE_COLORS, C, tooltipStyle as tip } from '../lib/chartColors'
import { Button, Chip, ErrorBox, PageHead, Panel, Skeleton } from '../components/ui'

// Which columns each report draws, and in which colour. Transfers always sit apart from disposals.
const SERIES: Record<ReportType, { col: string; color: string; stack?: boolean }[]> = {
  workload: [{ col: 'Received', color: C.blue }, { col: 'Disposed', color: C.good }, { col: 'Transferred', color: C.stamp }],
  ageing: ['0–7 days', '8–21 days', '22–45 days', '46–90 days', '>90 days'].map((col, i) => ({ col, color: AGE_COLORS[i], stack: true })),
  disposal: [{ col: 'Received', color: C.blue }, { col: 'Disposed', color: C.good }, { col: 'Transferred (apart)', color: C.stamp }],
  overlaps: [{ col: 'Found', color: C.saffronFill }, { col: 'Decided', color: C.good }],
  regions: [{ col: 'Open', color: C.blue }, { col: 'Overdue', color: C.tape }],
}

export default function Reports() {
  const { user } = useUser()
  const meta = useQuery({ queryKey: ['meta'], queryFn: api.meta })
  const [type, setType] = useState<ReportType>('workload')
  const [period, setPeriod] = useState<'monthly' | 'quarterly'>('monthly')
  const [unit, setUnit] = useState('')
  const [region, setRegion] = useState('')
  const input = { type, period, unit: unit || undefined, region: region || undefined }
  const q = useQuery({ queryKey: ['report', input], queryFn: () => api.report(input), placeholderData: (p) => p })
  const exp = useMutation({ mutationFn: () => api.exportReport(input, user), onSuccess: (r) => saveText(r.fileName, r.text) })
  const r = q.data
  const data = r?.rows.map((row) => Object.fromEntries(r.columns.map((c, i) => [c, row[i]]))) ?? []
  const series = SERIES[type].filter((s) => r?.columns.includes(s.col))

  return (
    <>
      <PageHead kind="reports" icon={<BarChart3 size={22} />} title="Reports" lead="Ready-made reports for meetings and returns. Every figure comes from the same records as the dashboard." />
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <nav aria-label="Reports" className="space-y-2 print:hidden">
          {REPORTS.map((x) => (
            <button key={x.type} onClick={() => setType(x.type)} aria-current={type === x.type ? 'page' : undefined}
              className={clsx('block w-full rounded-xl border px-4 py-3 text-left transition', type === x.type ? 'border-ink-700 bg-ink-50' : 'border-line bg-surface hover:border-ink-500')}>
              <span className="block text-14 font-semibold text-ink-950">{x.title}</span><span className="text-12 text-muted">{x.about}</span>
            </button>
          ))}
        </nav>

        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-2 print:hidden" role="group" aria-label="Report options">
            {(['monthly', 'quarterly'] as const).map((p) => <Chip key={p} active={period === p} onClick={() => setPeriod(p)}>{p === 'monthly' ? 'Monthly' : 'Quarterly'}</Chip>)}
            <select aria-label="Unit" className="rounded-full border border-line bg-surface px-4 py-1.5 text-13" value={unit} onChange={(e) => setUnit(e.target.value)}><option value="">All units</option>{meta.data?.units.map((u) => <option key={u.code}>{u.code}</option>)}</select>
            <select aria-label="Region" className="rounded-full border border-line bg-surface px-4 py-1.5 text-13" value={region} onChange={(e) => setRegion(e.target.value)}><option value="">All regions</option>{meta.data?.regions.map((x) => <option key={x}>{x}</option>)}</select>
            <span className="ml-auto flex gap-2">
              <Button variant="secondary" className="!py-1.5 !text-13" onClick={() => exp.mutate()} disabled={exp.isPending || user.role === 'admin'}><Download size={14} aria-hidden />CSV</Button>
              <Button variant="secondary" className="!py-1.5 !text-13" onClick={() => window.print()}><Printer size={14} aria-hidden />Print or save as PDF</Button>
            </span>
          </div>
          {exp.data && <p className="text-13 text-good print:hidden" role="status">Exported. Written to the audit log as entry <span className="font-mono">{exp.data.auditRef}</span>.</p>}

          {q.isError ? <ErrorBox error={q.error} /> : !r ? <Skeleton className="h-96" /> : (
            <article aria-labelledby="rep-h" className="space-y-4">
              <div className="hidden rounded-xl border border-line p-3 text-12 print:block">Synthetic prototype data — not real AICTE figures. Printed by {user.name} on {new Date().toLocaleString('en-IN')}. Complainant details are never included.</div>
              <Panel title={<span id="rep-h">{r.title}: {r.takeaway}</span>} note={`${r.periodNote}${unit ? ` · ${unit}` : ''}${region ? ` · ${region} region` : ''}`}>
                <div className="h-72" aria-hidden>
                  <ResponsiveContainer>
                    <BarChart data={data} margin={{ left: -16, right: 8, top: 8 }} barGap={2}>
                      <CartesianGrid stroke={C.line} strokeDasharray="4 6" vertical={false} />
                      <XAxis dataKey={r.columns[0]} tickLine={false} axisLine={false} fontSize={11} stroke={C.muted} interval={0} tickFormatter={(v: string) => (String(v).length > 14 ? String(v).slice(0, 12) + '…' : v)} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} stroke={C.muted} />
                      <Tooltip {...tip} cursor={{ fill: 'rgba(41,82,204,.06)' }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {series.map((s) => <Bar key={s.col} isAnimationActive={false} dataKey={s.col} stackId={s.stack ? 'a' : undefined} fill={s.color} radius={s.stack ? 0 : [4, 4, 0, 0]} maxBarSize={22} />)}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
              <Panel title="The figures" note="The same numbers as the chart, exactly.">
                <div className="-mx-6 -mb-6 overflow-x-auto">
                  <table className="w-full min-w-[600px] text-left text-13">
                    <caption className="sr-only">{r.title}: {r.takeaway}</caption>
                    <thead className="border-b border-line text-12 text-muted"><tr>{r.columns.map((c) => <th key={c} scope="col" className="px-6 py-2 font-medium first:pl-6">{c}</th>)}</tr></thead>
                    <tbody className="divide-y divide-line">{r.rows.map((row, i) => <tr key={i}>{row.map((v, j) => <td key={j} className={clsx('px-6 py-2', j > 0 && 'font-mono tabular-nums')}>{v}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              </Panel>
            </article>
          )}
        </div>
      </div>
    </>
  )
}
