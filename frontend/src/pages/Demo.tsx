// Everything that is for demonstrating Ekatra rather than for working in it lives here, in one place:
// the five-minute story, the demo accounts, and the live "a new case arrives" run.
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { PlayCircle } from 'lucide-react'
import { api } from '../lib/api'
import { ROLE_LABEL } from '../lib/labels'
import AutomationPanel from '../components/AutomationPanel'
import { Empty, PageHead, Panel, Step } from '../components/ui'

const STORY: { title: string; hint: string; to?: string }[] = [
  { title: 'Sign in as Anjali Rao (PGRC nodal officer)', hint: 'Her desk shows the overlap she must decide, with the other unit’s name and date.', to: '/' },
  { title: 'Open the Sahyadri overlap', hint: 'PGRC has a new CPGRAMS grievance. RB-WR already has a hearing on the same issue.', to: '/overlaps' },
  { title: 'See the week the two units collide', hint: 'The calendar marks weeks where two units act on one institution.', to: '/calendar' },
  { title: 'Run the check before acting', hint: 'Enter the institution and the action. The light says whom to talk to first.', to: '/check' },
  { title: 'Record the decision', hint: 'Accept the suggested lead unit. Follow-up tasks get owners and dates, and the count on the desk drops.', to: '/overlaps' },
]

export default function Demo() {
  const users = useQuery({ queryKey: ['demo-users'], queryFn: api.demoUsers })
  return (
    <>
      <PageHead icon={<PlayCircle size={22} />} title="Demo guide" lead="One institution, five minutes. This page is for showing Ekatra, not for working in it." />
      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <div className="space-y-6">
          <Panel title="The five-minute story">
            <ol className="space-y-5">
              {STORY.map((s, i) => (
                <li key={s.title}><Step n={i + 1} title={s.title} hint={s.hint} />{s.to && <Link to={s.to} className="ml-10 mt-1 inline-block text-13 font-semibold text-ink-700 hover:underline">Open</Link>}</li>
              ))}
            </ol>
          </Panel>
          <AutomationPanel />
        </div>
        <Panel title="Demo accounts" note="Password for all of them: demo. Sign out, then choose one on the sign-in page.">
          {!users.data ? <Empty title="Loading…" /> : (
            <ul className="divide-y divide-line text-14">
              {users.data.map((u) => (
                <li key={u.id} className="py-2.5"><span className="font-semibold text-ink-950">{u.name}</span><span className="text-muted"> · {ROLE_LABEL[u.role]}{u.unit ? `, ${u.unit}` : ''}</span><div className="font-mono text-12 text-muted">{(u as { username?: string }).username}</div></li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  )
}
