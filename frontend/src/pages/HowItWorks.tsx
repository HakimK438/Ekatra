// How Ekatra works: the six steps every case goes through (with a play-through), who does what, the rules
// Ekatra follows, live proof that the checks work on planted difficult cases, and what AICTE still has to decide.
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarClock, Check, CircleHelp, GitMerge, Link2, Pause, Play, ShieldCheck, X } from 'lucide-react'
import clsx from 'clsx'
import { api } from '../lib/api'
import { ProofStamp } from '../components/ProofRail'
import { Button, PageHead, Panel, Skeleton } from '../components/ui'
import type { StampState } from '../lib/types'

const STORY: { title: string; state: StampState; text: string; who: string }[] = [
  { title: 'Received', state: 'auto', text: 'A case arrives from a unit’s file, a form, or a connected system. Its details are checked: dates, unit, category.', who: 'Automatic' },
  { title: 'Institution found', state: 'auto', text: 'Matched by Permanent ID, or another verified ID. With only a name, likely institutions are suggested and a person chooses.', who: 'Automatic, or a person chooses' },
  { title: 'Overlap check', state: 'needs_person', text: 'Is another unit already working on this institution? If so, both units are told straight away, with the reason.', who: 'Automatic' },
  { title: 'Clock set', state: 'auto', text: 'The right time limit is set: 21 days for CPGRAMS, with an interim reply by day 18. Late cases are raised step by step.', who: 'Automatic, re-checked every hour' },
  { title: 'Units agreed', state: 'confirmed', text: 'People from the units decide: related, same complaint, not related, or which unit leads. A reason is recorded.', who: 'A person decides' },
  { title: 'Closed', state: 'confirmed', text: 'The owning unit closes its own case, with how it was closed. Transfers are counted apart, never as disposals.', who: 'A person decides' },
]

const BLOCKS = [
  { icon: <Link2 size={20} />, title: 'Finding the institution', points: [
    'A Permanent ID, or a verified Current ID or AISHE code, finds the institution automatically.',
    'With only a name, Ekatra shows likely institutions and compares each detail. Nothing is linked until a person chooses.',
    'A confirmed spelling is remembered, so it is recognised automatically next time.'] },
  { icon: <GitMerge size={20} />, title: 'Spotting overlaps', pointsLead: 'Five simple rules:', points: [
    'The Grievance Cell and a Regulation Bureau both have open cases.',
    'Open cases in two or more units.',
    'The same kind of complaint in two units within six months.',
    'A new case arrives while another unit has a notice or hearing pending.',
    'The same complaint number is held by two units: probably the same complaint.'] },
  { icon: <CalendarClock size={20} />, title: 'Time limits', points: [
    'CPGRAMS: 21 days, with an interim reply by day 18, and a 30-day appeal window after closure (verified).',
    'Every other time limit is a prototype setting, shown with a dotted underline, until AICTE confirms it.',
    'A late case goes to the nodal officer after 7 days, then to senior management after 14 (prototype settings).'] },
  { icon: <ShieldCheck size={20} />, title: 'What Ekatra never does', points: [
    'It never merges, closes or transfers a case, and never decides a regulatory matter.',
    'Complainant names and complaint text are visible only to the owning unit, and every view is logged.',
    'It never counts a transfer as a disposal, and never ranks institutions.'] },
]

const QUESTIONS = [
  ['Q1', 'Are the Regulation Bureau and the Approval Bureau the same function, and how are regional units organised?'],
  ['Q2', 'When PGRC and a Regulation Bureau both have a matter on one institution, who leads, and can either pause its action?'],
  ['Q3', 'Which systems hold case records today, and can they export files or offer an API?'],
  ['Q4', 'How many cases does each unit handle per year, and how large is the backlog?'],
  ['Q5', 'What status words does each unit use?'],
  ['Q6', 'What are the time limits for sources other than CPGRAMS?'],
  ['Q7', 'Is the Permanent ID recorded on PGRC and Bureau case files?'],
  ['Q8', 'Hosting, single sign-on, how long to keep data, and data protection duties?'],
  ['Q9', 'Which other cells join in the first version?'],
  ['Q10', 'Is the Standing Complaint Scrutiny Committee part of the current Approval Process Handbook?'],
]

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export default function HowItWorks() {
  const [at, setAt] = useState(0)
  const [playing, setPlaying] = useState(false)
  const planted = useQuery({ queryKey: ['planted'], queryFn: api.plantedTests })
  useEffect(() => {
    if (!playing) return
    if (reduced()) { setAt(STORY.length - 1); setPlaying(false); return }
    const t = window.setTimeout(() => { if (at >= STORY.length - 1) setPlaying(false); else setAt(at + 1) }, 1800)
    return () => clearTimeout(t)
  }, [playing, at])

  return (
    <>
      <PageHead icon={<CircleHelp size={22} />} title="How Ekatra works" lead="Six steps for every case. The machine does the checking. A person makes every decision." />

      <Panel className="mb-6" title="The six steps of a case" action={<Button variant="secondary" className="!py-1.5 !text-13" onClick={() => { if (!playing && at === STORY.length - 1) setAt(0); setPlaying(!playing) }}>{playing ? <><Pause size={14} aria-hidden />Pause</> : <><Play size={14} aria-hidden />Play it through</>}</Button>}>
        <ol className="grid grid-cols-3 gap-3 md:grid-cols-6">
          {STORY.map((s, i) => (
            <li key={s.title}>
              <button onClick={() => { setAt(i); setPlaying(false) }} aria-current={at === i ? 'step' : undefined}
                className={clsx('flex w-full flex-col items-center rounded-xl px-2 py-3 text-center transition', at === i ? 'bg-ink-50 ring-2 ring-ink-500' : 'hover:bg-paper', i > at && 'opacity-50')}>
                <ProofStamp state={i <= at ? s.state : 'not_reached'} fresh={i === at} />
                <span className="mt-2 text-12 font-semibold text-ink-950"><span className="font-mono">{i + 1}</span> · {s.title}</span>
              </button>
            </li>
          ))}
        </ol>
        <div className="mt-4 rounded-xl border border-line bg-paper/60 p-4" aria-live="polite">
          <p className="text-16 text-ink-950">{STORY[at].text}</p>
          <p className="mt-1 text-13 text-muted">{STORY[at].who}</p>
        </div>
      </Panel>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {[
          { cls: 'bg-ink-50 text-ink-900', title: 'Automatic', text: 'Checking details, finding the institution by ID, spotting overlaps, setting clocks, reminders, raising late cases, checking freshness.' },
          { cls: 'bg-turmeric-soft text-turmeric', title: 'Suggested', text: 'Likely institutions for a name, “already known?” while typing, a next step for each overlap, hints about rules that are often judged not related.' },
          { cls: 'bg-good-soft text-good', title: 'A person decides', text: 'Choosing an institution, every overlap decision, who leads, transfers, closing a case. Each needs a reason and gets a receipt.' },
        ].map((b) => <div key={b.title} className={clsx('rounded-panel p-5', b.cls)}><h2 className="font-display text-17 font-semibold">{b.title}</h2><p className="mt-1 text-14 text-text">{b.text}</p></div>)}
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        {BLOCKS.map((b) => (
          <Panel key={b.title}>
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink-50 text-ink-700" aria-hidden>{b.icon}</span>
              <h2 className="font-display text-18 font-semibold text-ink-950">{b.title}</h2>
            </div>
            {b.pointsLead && <p className="mb-2 text-14 text-muted">{b.pointsLead}</p>}
            <ul className="space-y-2 text-14 leading-relaxed text-text">
              {b.points.map((p) => <li key={p} className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-500" aria-hidden />{p}</li>)}
            </ul>
          </Panel>
        ))}
      </div>

      <Panel className="mb-6" title={planted.data ? `Proof that the checks work: ${planted.data.passed} of ${planted.data.rows.length} planted difficult cases handled correctly` : 'Proof that the checks work'}
        note="The sample data contains difficult situations on purpose. This table is worked out live, every time you open the page.">
        {!planted.data ? <Skeleton className="h-60" /> : (
          <div className="-mx-6 -mb-6 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-14">
              <thead className="border-b border-line text-12 text-muted"><tr><th className="px-6 py-2 font-medium">What we planted</th><th className="px-3 py-2 font-medium">What should happen</th><th className="px-3 py-2 font-medium">What happened</th><th className="px-6 py-2 font-medium">Result</th></tr></thead>
              <tbody className="divide-y divide-line">{planted.data.rows.map((r) => (
                <tr key={r.planted}>
                  <td className="px-6 py-2.5">{r.planted}</td><td className="px-3 py-2.5 text-muted">{r.expected}</td><td className="px-3 py-2.5">{r.happened}</td>
                  <td className="px-6 py-2.5">{r.ok ? <span className="inline-flex items-center gap-1 rounded-full bg-good-soft px-2 py-0.5 text-12 font-semibold text-good"><Check size={13} aria-hidden />Handled</span> : <span className="inline-flex items-center gap-1 rounded-full bg-tape-soft px-2 py-0.5 text-12 font-semibold text-tape"><X size={13} aria-hidden />Missed</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Still to agree with AICTE" note="Ekatra does not guess these. Until they are decided, the related settings are marked “prototype”.">
        <ol className="grid gap-x-8 gap-y-2 md:grid-cols-2">
          {QUESTIONS.map(([k, t]) => <li key={k} className="flex gap-3 text-14"><span className="font-mono text-12 font-semibold text-muted">{k}</span><span>{t}</span></li>)}
        </ol>
        <p className="mt-4 border-t border-line pt-3 text-12 text-muted">A prototype for SIH PS 26264, built on synthetic data. It is not an official AICTE system.</p>
      </Panel>
    </>
  )
}
