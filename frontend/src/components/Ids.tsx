// Case numbers and Permanent IDs: always monospace and on one line, so they never wrap or get cut.
import clsx from 'clsx'
import { Link } from 'react-router-dom'

export function CaseNo({ id, uid, className }: { id: string; uid: string; className?: string }) {
  return <Link to={`/cases/${id}`} className={clsx('whitespace-nowrap font-mono font-semibold text-ink-950 hover:underline', className)}>{uid}</Link>
}

export const PermId = ({ id, className }: { id: string; className?: string }) => <span className={clsx('whitespace-nowrap font-mono text-12 text-muted', className)}>{id}</span>

/** The institution's full name (it wraps, never truncated) with its Permanent ID beside it. */
export function InstName({ id, name, permanentId, className }: { id?: string | null; name: string; permanentId?: string; className?: string }) {
  return (
    <span className={clsx('inline-flex flex-wrap items-baseline gap-x-2', className)}>
      {id ? <Link to={`/institutions/${id}`} className="font-medium text-ink-950 hover:underline">{name}</Link> : <span className="font-medium text-ink-950">{name}</span>}
      {permanentId && <PermId id={permanentId} />}
    </span>
  )
}
