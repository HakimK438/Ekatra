// Repeat radar: complaints that came back after their case was closed, and issues that keep arriving at one
// institution. Both point at a problem that individual replies are not fixing.
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Layers3, Radar as RadarIcon, Repeat, SearchCheck } from 'lucide-react'
import { CameBack, LogicStrip } from '../components/Logic'
import { work, SERVER_ONLY } from '../lib/workApi'
import { UnitPill } from '../components/Unit'
import { ServerOnly } from '../components/WorkBits'
import { Empty, ErrorBox, PageHead, Panel, Skeleton, fmtDate } from '../components/ui'
import { DISPOSAL_LABEL, STAGE_LABEL } from '../lib/labels'
import type { DisposalType, Lifecycle } from '../lib/types'

export default function Radar() {
  const q = useQuery({ queryKey: ['radar'], queryFn: work.radar, enabled: !SERVER_ONLY })
  if (SERVER_ONLY) return <><PageHead icon={<RadarIcon size={22} />} title="Came back or repeating" /><ServerOnly /></>
  const d = q.data
  return (
    <>
      <PageHead icon={<RadarIcon size={22} />} title="Came back or repeating"
        lead="Complaints that came back after closure, and issues that keep coming."
        stats={d ? [{ label: 'Came back after closure', value: d.repeats.length, tone: d.repeats.length ? 'amber' : undefined }, { label: 'Issues that keep coming', value: d.systemic.length, tone: d.systemic.length ? 'amber' : undefined },
          { label: 'Cases in those issues', value: d.systemic.reduce((a, s) => a + s.count, 0) }] : undefined} />
      <LogicStrip title="The two rules" steps={[
        { icon: Repeat, title: 'Came back', text: 'Same issue within 30 days of closure.', tone: 'rule' },
        { icon: Layers3, title: 'Keeps coming', text: '3 or more on one issue in 180 days.', tone: 'rule' },
        { icon: SearchCheck, title: 'You decide', text: 'Whether to inspect or reopen.', tone: 'person' },
      ]} foot="Prototype settings. Synthetic data." />
      {q.isLoading && <Skeleton className="h-64" />}
      {q.isError && <ErrorBox error={q.error} />}
      {d && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Came back after closure" note="Received within 30 days of a closed case at the same institution, on the same issue or complaint number.">
            {!d.repeats.length && <Empty title="No complaint has come back" />}
            <ul className="space-y-3">{d.repeats.map((r) => (
              <li key={r.case.id} className="rounded-xl border border-line p-4">
                <p className="flex items-center gap-2 font-medium text-ink-950"><Repeat size={15} className="text-turmeric" aria-hidden /><Link to={`/institutions/${r.institutionId}`} className="hover:underline">{r.institution}</Link></p>
                <p className="mt-1 text-14 text-ink-950">{r.text}</p>
                <div className="mt-3"><CameBack closedOn={r.earlier.closedOn} cameOn={r.case.receivedOn} days={Math.round((new Date(r.case.receivedOn).getTime() - new Date(r.earlier.closedOn).getTime()) / 86400000)} /></div>
                <div className="mt-2 flex flex-wrap gap-2 text-13">
                  <Link to={`/cases/${r.earlier.id}`} className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 hover:border-ink-500"><UnitPill code={r.earlier.unit} /><span className="font-mono">{r.earlier.uid}</span>closed {fmtDate(r.earlier.closedOn)}{r.earlier.how ? ` (${DISPOSAL_LABEL[r.earlier.how as DisposalType]?.toLowerCase()})` : ''}</Link>
                  <Link to={`/cases/${r.case.id}`} className="flex items-center gap-1.5 rounded-lg border border-turmeric/50 px-2.5 py-1 hover:border-ink-500"><UnitPill code={r.case.unit} /><span className="font-mono">{r.case.uid}</span>received {fmtDate(r.case.receivedOn)}</Link>
                </div>
              </li>))}</ul>
          </Panel>
          <Panel title="Issues that keep coming" note="Three or more cases on one issue at one institution in 180 days (issue words from the case summaries).">
            {!d.systemic.length && <Empty title="No repeated issue found" />}
            <ul className="space-y-3">{d.systemic.map((s) => (
              <li key={s.institutionId + s.issue} className="rounded-xl border border-line p-4">
                <p className="flex flex-wrap items-center gap-2"><Link to={`/institutions/${s.institutionId}`} className="font-medium text-ink-950 hover:underline">{s.institution}</Link><span className="rounded-full bg-turmeric/10 px-2 py-0.5 text-12 text-ink-950">{s.issue}</span></p>
                <p className="mt-1 text-14 text-ink-950">{s.text} {s.open} still open.</p>
                <ul className="mt-2 flex flex-wrap gap-2">{s.cases.map((c) => (
                  <li key={c.id}><Link to={`/cases/${c.id}`} className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-13 hover:border-ink-500"><UnitPill code={c.unit} /><span className="font-mono">{c.uid}</span><span className="text-muted">{STAGE_LABEL[c.stage as Lifecycle]}</span></Link></li>))}</ul>
              </li>))}</ul>
          </Panel>
          <p className="text-12 text-muted lg:col-span-2">{d.howCounted}</p>
        </div>
      )}
    </>
  )
}
