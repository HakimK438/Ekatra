// Calendar of actions: the next six weeks as a month-style grid, one dot per dated step, coloured by the kind of unit.
// A day turns amber when two units act on the same institution within a week of each other. Select a day to see what
// happens, at which institution, and what to do. Below, each institution gets its own timeline, so a clash is seen before it happens.
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarDays } from 'lucide-react'
import clsx from 'clsx'
import { api } from '../lib/api'
import { addDays, daysBetween } from '../lib/logic'
import { weekStart, type Collision, type DatedAction } from '../lib/calendar'
import { UNIT_KIND_COLOR, unitKind } from '../lib/chartColors'
import { unitFull } from '../lib/labels'
import { fmtDay, plural } from '../lib/text'
import { Empty, ErrorBox, PageHead, Skeleton, btn } from '../components/ui'

const WEEKS = 6
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
type Inst = { id: string; name: string; permanentId: string }
interface Step extends DatedAction { overlapId: string; institution: Inst; with: DatedAction[] }

const Dot = ({ unit, size = 'h-2.5 w-2.5' }: { unit: string; size?: string }) => <span className={clsx('inline-block shrink-0 rounded-full ring-2 ring-white', size)} style={{ background: UNIT_KIND_COLOR[unitKind(unit)] }} aria-hidden />

/** Why the calendar exists, how to read it, and where its dates come from, so a new user can use it without being shown. */
function HowTo() {
  return (
    <section aria-label="How to use the calendar" className="rounded-panel border border-line bg-surface p-5 shadow-card">
      <h2 className="font-display text-17 font-semibold text-ink-950">What this calendar is for</h2>
      <p className="mt-1 text-14 text-text">A clash happens when two units send something to the same institution in the same week. The institution then gets two instructions on one matter. This calendar puts every unit’s dated steps on one page so that week is visible before it happens.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="text-13 font-semibold text-ink-950">How to use it</h3>
          <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-13 text-text">
            <li>Find a day with coloured dots. Each dot is one unit’s step, coloured by the kind of unit.</li>
            <li>An amber day means two units act on the same institution within a week of each other.</li>
            <li>Select the day to see which units, which institution and which dates are involved.</li>
          </ol>
        </div>
        <div>
          <h3 className="text-13 font-semibold text-ink-950">Where the dates come from</h3>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-13 text-text">
            <li>Dates you book on a case (open a case, then <strong>Book a date</strong>).</li>
            <li>The <strong>Next step on</strong> and <strong>Next step</strong> columns of a file you import.</li>
            <li>Reply deadlines and CPGRAMS interim reply dates, worked out from the time limits.</li>
          </ul>
        </div>
      </div>
    </section>
  )
}

export default function Calendar() {
  const today = api.today
  const start = weekStart(today)
  const end = addDays(start, WEEKS * 7 - 1)
  const q = useQuery({ queryKey: ['calendar', today], queryFn: () => api.calendar(today, end) })
  const [picked, setPicked] = useState<string | null>(null)

  const steps: Step[] = useMemo(() => (q.data?.institutions ?? []).flatMap((r) => r.actions.map((x) => {
    const col = r.collisions.find((c: Collision) => c.actions.some((y) => y.caseId === x.caseId && y.date === x.date && y.what === x.what))
    return { ...x, overlapId: r.overlapId, institution: r.institution, with: col ? col.actions.filter((y) => y.unit !== x.unit) : [] }
  })), [q.data])
  const hotDates = useMemo(() => new Set(steps.filter((s) => s.with.length).map((s) => s.date)), [steps])
  // Open on the first day that matters: the first clash, else the first dated step.
  useEffect(() => {
    if (picked || !steps.length) return
    setPicked([...steps].sort((a, b) => Number(!!b.with.length) - Number(!!a.with.length) || a.date.localeCompare(b.date))[0].date)
  }, [steps, picked])

  const from = today, to = end
  // One block per calendar month, Monday first, only the days from today to the end of the six weeks.
  const months = (() => {
    const out: { key: string; label: string; cells: (string | null)[] }[] = []
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const key = d.slice(0, 7)
      let m = out.find((x) => x.key === key)
      if (!m) {
        const lead = (new Date(d + 'T00:00:00').getDay() + 6) % 7
        m = { key, label: new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }), cells: Array(lead).fill(null) }
        out.push(m)
      }
      m.cells.push(d)
    }
    return out
  })()
  const open = picked ? steps.filter((s) => s.date === picked) : []
  const clashes = q.data?.institutions.flatMap((r) => r.collisions.map((c) => ({ ...r, c }))).sort((x, y) => x.c.from.localeCompare(y.c.from)) ?? []

  return (
    <>
      <PageHead kind="calendar" icon={<CalendarDays size={22} />} title="Calendar of actions" lead="Dated steps of every unit, institution by institution. A highlighted day means two units act on the same institution within a week of each other." />
      {q.isError ? <ErrorBox error={q.error} /> : !q.data ? <Skeleton className="h-96" /> : steps.length === 0 ? <div className="space-y-6"><HowTo /><Empty title="No dated steps in the next six weeks">Nothing is booked yet. Book a date on a case, or import a file with the Next step columns, and it appears here.</Empty></div> : (
        <div className="space-y-6">
          <HowTo />
          <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
            <section aria-label="Next six weeks" className="rounded-panel border border-line bg-surface p-4 shadow-card md:p-5">
              <h2 className="font-display text-17 font-semibold text-ink-950">{clashes.length ? `${plural(clashes.length, 'institution')} where two units act in the same week` : 'No two units act on the same institution in the same week'}</h2>
              <p className="mb-3 text-13 text-muted">{plural(steps.length, 'dated step')} in six weeks. Select a day for details.</p>
              <div className="space-y-6">
                {months.map((mo) => (
                  <div key={mo.key}>
                    <h3 className="mb-2 flex items-baseline gap-2 font-display text-16 font-semibold text-ink-950">{mo.label}<span className="text-12 font-normal text-muted">{plural(steps.filter((x) => x.date.startsWith(mo.key)).length, 'dated step')}</span></h3>
                    <div className="grid grid-cols-7 gap-1 text-center text-12 font-medium text-muted">{WEEKDAYS.map((w) => <span key={w}>{w}</span>)}</div>
                    <div className="mt-1 grid grid-cols-7 gap-1" role="group" aria-label={mo.label}>
                      {mo.cells.map((d, i) => {
                        if (!d) return <span key={`b${i}`} aria-hidden />
                        const here = steps.filter((x) => x.date === d)
                        const dt = new Date(d + 'T00:00:00')
                        const hot = hotDates.has(d), on = picked === d, isToday = d === today
                        return (
                          <button key={d} type="button" disabled={!here.length} onClick={() => setPicked(on ? null : d)} aria-pressed={on}
                            aria-label={`${fmtDay(d)}: ${here.length ? here.map((x) => `${x.unit} ${x.what}`).join('; ') : 'nothing dated'}`}
                            className={clsx('flex min-h-[74px] flex-col items-start rounded-lg border p-1.5 text-left transition',
                              hot ? 'border-turmeric bg-turmeric-soft' : here.length ? 'border-line bg-white hover:border-ink-500' : 'border-transparent bg-paper/60',
                              on && '!border-ink-700 ring-2 ring-ink-700/30', here.length ? 'cursor-pointer' : 'cursor-default')}>
                            <span className={clsx('flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-12 font-semibold', isToday ? 'bg-ink-800 text-white' : 'text-ink-950')}>{dt.getDate()}</span>
                            {isToday && <span className="text-11 font-medium text-ink-800">Today</span>}
                            <span className="mt-1 flex flex-wrap gap-1">
                              {here.slice(0, 4).map((x, k) => <Dot key={k} unit={x.unit} size="h-3 w-3" />)}
                              {here.length > 4 && <span className="text-11 font-semibold text-ink-950">+{here.length - 4}</span>}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-12 text-muted" aria-label="Key">
                <li className="inline-flex items-center gap-1.5"><Dot unit="PGRC" />Grievance cell</li>
                <li className="inline-flex items-center gap-1.5"><Dot unit="RB-WR" />Regulation Bureau</li>
                <li className="inline-flex items-center gap-1.5"><Dot unit="RO-WR" />Regional Office</li>
                <li className="inline-flex items-center gap-1.5"><Dot unit="LEGAL" />Legal and other cells</li>
                <li className="inline-flex items-center gap-1.5"><span className="h-3.5 w-5 rounded border border-turmeric bg-turmeric-soft" />Two units act within a week</li>
              </ul>
            </section>

            <section aria-label="Selected day" className="rounded-panel border border-line bg-surface p-4 shadow-card md:p-5">
              {picked && open.length ? (
                <>
                  <h2 className="font-display text-17 font-semibold text-ink-950">{fmtDay(picked)}: {plural(open.length, 'step')}</h2>
                  <ul className="mt-3 divide-y divide-line">
                    {open.map((s) => (
                      <li key={`${s.caseId}-${s.what}`} className="py-3 first:pt-0 last:pb-0">
                        <p className="flex flex-wrap items-center gap-x-2 text-14"><span className="inline-flex items-center gap-1.5 font-semibold"><Dot unit={s.unit} />{unitFull(s.unit)}</span><span>{s.what}</span></p>
                        <p className="mt-0.5 text-13 text-muted">At <Link to={`/institutions/${s.institution.id}`} className="font-medium text-ink-700 hover:underline">{s.institution.name}</Link> · case <span className="font-mono">{s.uid}</span></p>
                        {s.with.length > 0 ? (
                          <div className="mt-2 rounded-lg bg-turmeric-soft px-3 py-2.5 text-13 text-ink-950">
                            <p className="flex items-start gap-1.5 font-semibold text-turmeric"><AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />Another unit acts on this institution within a week</p>
                            <ul className="mt-1 list-disc space-y-0.5 pl-5">{s.with.map((w) => <li key={`${w.unit}-${w.date}-${w.what}`}><strong>{w.unit}</strong> {w.what} on {fmtDay(w.date)} ({daysBetween(s.date, w.date) === 0 ? 'the same day' : `${plural(Math.abs(daysBetween(s.date, w.date)), 'day')} ${w.date > s.date ? 'later' : 'earlier'}`})</li>)}</ul>
                            <p className="mt-1.5">If both act, the institution receives two separate communications about the same matter.</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Link to={`/overlaps/${encodeURIComponent(s.overlapId)}`} className={btn('primary', '!px-3.5 !py-1.5 !text-13')}>Open the clash</Link>
                              <Link to={`/check?inst=${s.institution.id}`} className={btn('secondary', '!px-3.5 !py-1.5 !text-13')}>Before you act</Link>
                            </div>
                          </div>
                        ) : <p className="mt-1.5 text-13 text-muted">No other unit acts on this institution within a week of this step.</p>}
                      </li>
                    ))}
                  </ul>
                </>
              ) : <p className="text-14 text-muted">Select a day with dots to see what happens that day, at which institution, and whether it clashes with another unit.</p>}
            </section>
          </div>

          <section aria-label="Institution by institution" className="rounded-panel border border-line bg-surface p-4 shadow-card md:p-5">
            <h2 className="font-display text-17 font-semibold text-ink-950">Institution by institution</h2>
            <p className="mb-4 text-13 text-muted">One timeline per institution. Dots that sit close together on the same line are steps of different units. A shaded stretch is a clash.</p>
            <div className="overflow-x-auto">
              <div className="min-w-[720px]">
                <div className="grid grid-cols-[220px_1fr] gap-4 pb-1 text-11 text-muted">
                  <span />
                  <div className="relative h-4">{Array.from({ length: WEEKS }, (_, i) => <span key={i} className="absolute -translate-x-0" style={{ left: `${(i / WEEKS) * 100}%` }}>{fmtDay(addDays(start, i * 7)).replace(/^\w+, /, '')}</span>)}</div>
                </div>
                {q.data.institutions.map((r) => (
                  <div key={r.overlapId} className="grid grid-cols-[220px_1fr] items-center gap-4 border-t border-line py-3">
                    <Link to={`/institutions/${r.institution.id}`} className="min-w-0 text-13 font-semibold leading-snug text-ink-950 hover:underline">{r.institution.name}<span className="block font-mono text-11 font-normal text-muted">{r.institution.permanentId}</span></Link>
                    <div className="relative h-9 rounded-lg bg-paper">
                      {Array.from({ length: WEEKS - 1 }, (_, i) => <span key={i} className="absolute inset-y-0 w-px bg-line" style={{ left: `${((i + 1) / WEEKS) * 100}%` }} aria-hidden />)}
                      {r.collisions.map((c, i) => <span key={i} className="absolute inset-y-1 rounded bg-turmeric/25 ring-1 ring-turmeric/50" style={{ left: `${(daysBetween(start, c.from) / (WEEKS * 7)) * 100}%`, width: `${Math.max(2.4, ((daysBetween(c.from, c.to) + 1) / (WEEKS * 7)) * 100)}%` }} title={`${c.units.join(' and ')} act within a week`} />)}
                      {r.actions.map((a, i) => <span key={i} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${((daysBetween(start, a.date) + 0.5) / (WEEKS * 7)) * 100}%` }} title={`${fmtDay(a.date)}: ${a.unit} ${a.what}`}><Dot unit={a.unit} size="h-3.5 w-3.5" /></span>)}
                      {today >= start && <span className="absolute inset-y-0 w-0.5 bg-ink-800" style={{ left: `${((daysBetween(start, today) + 0.5) / (WEEKS * 7)) * 100}%` }} title="Today" aria-hidden />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  )
}
