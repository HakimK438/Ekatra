// How Ekatra works: the five things it does, each with the rule it follows (in plain words, with the values currently in force),
// what it never does by itself, and a live number from the records that shows it working. Nothing on this page is a judgement
// by the system: every statement is a rule that can be read, changed by an administrator, and checked against the records.
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowRight, BarChart3, Building2, FileCheck2, GitMerge, Gavel, History, AlarmClock, Route, ShieldCheck, XCircle, CheckCircle2, type LucideIcon } from 'lucide-react'
import clsx from 'clsx'
import { api } from '../lib/api'
import { useUser } from '../hooks/useUser'
import { CountUp } from '../hooks/useCountUp'
import { DECISION_LABEL, RULE_LABEL } from '../lib/labels'
import { ErrorBox, PageHead, Skeleton } from '../components/ui'

interface Pillar {
  icon: LucideIcon; title: string; question: string; rules: string[]; never: string
  live: { value: number | string; label: string; tone?: 'red' | 'amber' | 'green' }[]; to: string; cta: string
}

const TONE = { red: 'text-tape', amber: 'text-turmeric', green: 'text-good' } as const
const pct = (x: number) => `${Math.round(x * 100)}%`

export default function Flow() {
  const { user } = useUser()
  const meta = useQuery({ queryKey: ['meta'], queryFn: api.meta })
  const sum = useQuery({ queryKey: ['summary', user.id], queryFn: () => api.summary(user) })
  const dash = useQuery({ queryKey: ['dashboard', {}], queryFn: () => api.dashboard() })
  if (meta.isError || sum.isError || dash.isError) return <ErrorBox error={meta.error ?? sum.error ?? dash.error} />
  if (!meta.data || !sum.data || !dash.data) return <div className="space-y-4" aria-busy="true"><Skeleton className="h-40" /><Skeleton className="h-96" /></div>
  const s = sum.data, d = dash.data, set = meta.data.settings as Record<string, number>
  const c = s.cases, o = s.overlaps
  const auto = c.total ? (c.total - s.matching.toConfirm) / c.total : 1
  const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`

  const pillars: Pillar[] = [
    {
      icon: Building2, title: 'Matching', question: 'Is this case about an institution we already know?',
      rules: [
        'A Permanent ID that matches exactly links the case to the institution on its own.',
        'Other verified IDs (Current ID, application ID, AISHE code) also link on their own.',
        `A name alone never links. Ekatra lists up to ${set.topN} look-alike institutions, each with a similarity score of at least ${pct(set.suggestMinScore)} and the words that matched. A coordinator picks one, and the choice is remembered.`,
      ],
      never: 'Link an institution by name without a person confirming it.',
      live: [{ value: pct(auto), label: 'of cases linked to an institution', tone: auto >= 0.9 ? 'green' : 'amber' }, { value: s.matching.toConfirm, label: 'names waiting for a person', tone: s.matching.toConfirm ? 'amber' : 'green' }],
      to: '/matching', cta: 'Open name matching',
    },
    {
      icon: GitMerge, title: 'Overlaps', question: 'Is more than one unit working on the same institution?',
      rules: [
        ...(['O1', 'O2', 'O3', 'O4', 'O5'] as const).map((k) => `${RULE_LABEL[k].full}${k === 'O3' ? ` (looking back ${days(set.o3WindowDays)})` : k === 'O4' ? ` (a case is “new” for ${days(set.o4NewWithinDays)})` : ''}.`),
        'Priority is High when O1, O4 or O5 applies, and Medium otherwise. Each clash lists the rules and dates behind its priority.',
      ],
      never: 'Merge, close or move a case. Two units on one institution is a possibility to look at, not a finding.',
      live: [{ value: o.all, label: 'clashes found' }, { value: o.awaiting, label: 'waiting for a decision', tone: o.awaiting ? 'amber' : 'green' }],
      to: '/overlaps', cta: 'Open clashes',
    },
    {
      icon: Gavel, title: 'Coordination', question: 'Who decided what, and why?',
      rules: [
        `A nodal officer of an involved unit, or the coordinator, records one of five decisions: ${Object.values(DECISION_LABEL).join(', ').toLowerCase()}.`,
        'A reason is required for every decision except “related”. The decision is saved on every case involved and in the audit log.',
        `A decision is due ${days(set.coordDueDays)} after a clash is found, with a second reminder at ${days(set.coordSecondLevelDays)}. A follow-up task is due ${days(set.followUpDays)} after a decision.`,
      ],
      never: 'Choose a decision, change who owns a case, or change a case’s stage.',
      live: [{ value: o.decided, label: 'decisions on record', tone: 'green' }, { value: s.outcomes.overlaps.decided ? pct(s.outcomes.overlaps.inTarget / s.outcomes.overlaps.decided) : '—', label: `decided within ${s.outcomes.overlaps.targetDays} days` }],
      to: '/overlaps', cta: 'See decisions',
    },
    {
      icon: AlarmClock, title: 'Deadlines', question: 'Which cases are about to miss, or have missed, a time limit?',
      rules: [
        `CPGRAMS cases have ${days(set.cpgramsDays)} (verified: DARPG guidelines of 23 Aug 2024). An interim reply reminder appears on day ${set.cpgramsInterimDay}; that day is a prototype setting.`,
        `Cases from other sources have ${days(set.defaultDays)}. This is a prototype setting until AICTE fixes it.`,
        `A case is “due soon” once ${pct(set.approachingPct)} of its time has passed. After ${days(set.escalateAfterOverdue)} overdue it is raised to the nodal officer, and after ${days(set.escalateAfterOverdue * 2)} to senior management.`,
        'Every case is re-checked every hour.',
      ],
      never: 'Close a case, or treat a prototype time limit as an official one. Prototype limits are labelled wherever they appear.',
      live: [{ value: c.overdue, label: 'cases past their limit', tone: c.overdue ? 'red' : 'green' }, { value: d.dueSoon, label: 'due soon', tone: d.dueSoon ? 'amber' : 'green' }],
      to: '/deadlines', cta: 'Open deadlines',
    },
    {
      icon: BarChart3, title: 'Reporting', question: 'How many cases are pending, under process, transferred, escalated or disposed?',
      rules: [
        'Every figure is counted from the case records when you open the page. Nothing is typed in.',
        'Transferred cases are counted apart from disposed cases, everywhere. Disposal rate = disposed ÷ (disposed + open).',
        'Every number opens the cases behind it, and a “How was this counted” note shows the counting rule.',
      ],
      never: 'Show a figure that cannot be traced to its cases.',
      live: [{ value: c.total, label: 'cases on record' }, { value: c.disposed, label: 'disposed', tone: 'green' }, { value: c.transferred, label: 'transferred (counted apart)' }],
      to: '/reports', cta: 'Open reports',
    },
  ]

  return (
    <>
      <PageHead icon={<Route size={22} />} title="How Ekatra works" lead="Five things Ekatra does for the units of AICTE. For each one: the rule it follows, what it never does on its own, and a live number from the records." />

      <section aria-label="The problem" className="mb-8 grid gap-4 md:grid-cols-2">
        <div className="rounded-panel border border-tape/25 bg-tape-soft/60 p-5">
          <h2 className="flex items-center gap-2 font-display text-18 font-semibold text-tape"><XCircle size={20} aria-hidden />The problem</h2>
          <p className="mt-2 text-14 text-ink-950">Every AICTE unit keeps its cases in its own system. Each unit decides correctly with the information it has, but none can see what the others are doing about the same institution. So two units can write to one institution in the same week, a deadline is noticed only after it has passed, and a report takes days to put together by hand.</p>
        </div>
        <div className="rounded-panel border border-good/25 bg-good-soft/70 p-5">
          <h2 className="flex items-center gap-2 font-display text-18 font-semibold text-good"><CheckCircle2 size={20} aria-hidden />What Ekatra does about it</h2>
          <p className="mt-2 text-14 text-ink-950">Ekatra keeps one index of every unit’s cases, organised by institution. It never replaces a unit’s own system and never decides for anyone. It shows, from the records, where units overlap, which deadlines are close, and what has been decided. Every rule it uses is on this page.</p>
        </div>
      </section>

      <ol className="space-y-5" aria-label="The five pillars">
        {pillars.map((p, i) => (
          <li key={p.title} className="overflow-hidden rounded-panel border border-line bg-surface shadow-card">
            <div className="grid gap-0 lg:grid-cols-[1.6fr_1fr]">
              <div className="p-5 md:p-6">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-ink-700 to-ink-900 text-white" aria-hidden><p.icon size={21} /></span>
                  <div>
                    <p className="text-12 font-medium text-muted">Pillar {i + 1}</p>
                    <h2 className="font-display text-22 font-semibold leading-tight text-ink-950">{p.title}</h2>
                    <p className="mt-0.5 text-15 text-ink-900">{p.question}</p>
                  </div>
                </div>
                <h3 className="mt-4 text-13 font-semibold text-ink-950">The rule</h3>
                <ul className="mt-1.5 space-y-1.5 text-14 text-text">
                  {p.rules.map((r) => <li key={r} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-500" aria-hidden />{r}</li>)}
                </ul>
                <p className="mt-4 flex gap-2 rounded-lg bg-paper px-3.5 py-2.5 text-13 text-text"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-ink-700" aria-hidden /><span><strong className="text-ink-950">Never done by Ekatra on its own: </strong>{p.never}</span></p>
              </div>
              <div className="flex flex-col justify-between gap-4 border-t border-line bg-ink-50/60 p-5 md:p-6 lg:border-l lg:border-t-0">
                <div>
                  <h3 className="text-13 font-semibold text-ink-950">Live from the records</h3>
                  <dl className="mt-2 space-y-3">
                    {p.live.map((x) => (
                      <div key={x.label}>
                        <dd className={clsx('font-display text-34 font-semibold leading-none', x.tone ? TONE[x.tone] : 'text-ink-950')}>{typeof x.value === 'number' ? <CountUp value={x.value} /> : x.value}</dd>
                        <dt className="mt-1 text-13 text-muted">{x.label}</dt>
                      </div>
                    ))}
                  </dl>
                </div>
                <Link to={p.to} className="inline-flex items-center gap-1.5 text-14 font-semibold text-ink-700 hover:underline">{p.cta}<ArrowRight size={15} aria-hidden /></Link>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <section aria-label="Underneath all five" className="mt-8">
        <h2 className="mb-3 font-display text-18 font-semibold text-ink-950">Underneath all five</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <article className="rounded-panel border border-line bg-surface p-5 shadow-card">
            <FileCheck2 size={22} className="text-ink-700" aria-hidden />
            <h3 className="mt-2 font-display text-16 font-semibold text-ink-950">Every file is checked before it is saved</h3>
            <p className="mt-1 text-13 text-text">Each row of an uploaded file is checked for missing fields, unreadable dates, unknown sources and categories, and a reference repeated inside the file. A row with a problem is kept out and listed with how to fix it. Importing the same file again updates cases and never duplicates them. {s.sources.total - s.sources.stale.length} of {s.sources.total} units sent data within the last {days(Math.round(set.staleHours / 24) || 1)}.</p>
            <Link to="/import" className="mt-3 inline-flex items-center gap-1.5 text-14 font-semibold text-ink-700 hover:underline">Import records<ArrowRight size={15} aria-hidden /></Link>
          </article>
          <article className="rounded-panel border border-line bg-surface p-5 shadow-card">
            <History size={22} className="text-ink-700" aria-hidden />
            <h3 className="mt-2 font-display text-16 font-semibold text-ink-950">Every action is on record</h3>
            <p className="mt-1 text-13 text-text">Each action writes an entry to the audit log with the person, the time and the case. Each entry carries the fingerprint of the one before it, and the database refuses edits and deletions, so a change would show. When an action goes ahead while another unit has an open case, the entry says so.</p>
            <Link to="/audit" className="mt-3 inline-flex items-center gap-1.5 text-14 font-semibold text-ink-700 hover:underline">Open the audit log<ArrowRight size={15} aria-hidden /></Link>
          </article>
          <article className="rounded-panel border border-line bg-surface p-5 shadow-card">
            <ShieldCheck size={22} className="text-ink-700" aria-hidden />
            <h3 className="mt-2 font-display text-16 font-semibold text-ink-950">Verified and prototype are kept apart</h3>
            <p className="mt-1 text-13 text-text">Only the CPGRAMS time limits are verified. Every other limit is a prototype setting, labelled as one, and an administrator can change it with a reason that is written to the audit log. All the data in this demonstration is synthetic.</p>
            <Link to="/settings" className="mt-3 inline-flex items-center gap-1.5 text-14 font-semibold text-ink-700 hover:underline">See the settings<ArrowRight size={15} aria-hidden /></Link>
          </article>
        </div>
      </section>
    </>
  )
}
