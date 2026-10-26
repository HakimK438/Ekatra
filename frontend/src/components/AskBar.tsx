import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, Building2, FileText, ListFilter } from 'lucide-react'
import clsx from 'clsx'
import { api } from '../lib/api'
import { ask, toQueryString } from '../lib/ask'

const EXAMPLES = ['overdue cases in PGRC', 'CPGRAMS cases due soon', 'ragging complaints this month', 'escalated in western region', 'cases not matched to an institution']

export default function AskBar() {
  const nav = useNavigate()
  const idx = useQuery({ queryKey: ['searchIndex'], queryFn: api.searchIndex, staleTime: 60_000 })
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  // "/" or Ctrl/⌘+K focuses the search from anywhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest('input, textarea, select')
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) { e.preventDefault(); input.current?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const result = useMemo(() => (idx.data && text.trim() ? ask(text, idx.data) : null), [text, idx.data])
  const options = useMemo(() => {
    if (!text.trim()) return EXAMPLES.map((e) => ({ kind: 'example' as const, label: e, to: '' }))
    if (!result) return []
    const list: { kind: 'case' | 'inst' | 'filter'; label: string; hint?: string; to: string }[] = result.jumps.map((j) => ({ kind: j.to.startsWith('/cases') ? 'case' as const : 'inst' as const, label: j.label, hint: j.hint, to: j.to }))
    if (result.chips.length) list.push({ kind: 'filter', label: 'Show matching cases', to: `/cases?${toQueryString(result.filters)}` })
    return list
  }, [text, result])

  const go = (i: number) => {
    const o = options[i]
    if (!o) return
    if (o.kind === 'example') { setText(o.label); setActive(0); return }
    nav(o.to)
    setOpen(false)
    setText('')
    input.current?.blur()
  }

  return (
    <div className="relative w-full max-w-xl">
      <Search size={16} className="pointer-events-none absolute left-3 top-[11px] text-muted" aria-hidden />
      <input
        ref={input}
        value={text}
        onChange={(e) => { setText(e.target.value); setActive(0); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, options.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
          else if (e.key === 'Enter') { e.preventDefault(); go(active) }
          else if (e.key === 'Escape') { setOpen(false); input.current?.blur() }
        }}
        role="combobox"
        aria-expanded={open && options.length > 0}
        aria-controls="ask-list"
        aria-activedescendant={open ? `ask-${active}` : undefined}
        aria-label="Ask Ekatra: search in plain words"
        placeholder="Search cases or institutions"
        className="w-full rounded-md border border-line bg-surface py-2 pl-9 pr-14 text-14 placeholder:text-muted/80 focus:border-ink-700 focus:outline-none"
      />
      <kbd className="pointer-events-none absolute right-2.5 top-2 hidden rounded border border-line px-1.5 text-11 text-muted sm:block">Ctrl K</kbd>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-panel bg-surface shadow-card shadow-[0_12px_32px_-12px_rgb(var(--ink-950)/0.25)]">
          {result && result.chips.length > 0 && (
            <div className="border-b border-line px-4 py-3">
              <div className="text-12 text-muted">Understood as</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {result.chips.map((c) => <span key={c.key + c.label} className="rounded-chip bg-ink-50 px-2 py-0.5 text-13 font-medium text-ink-900">{c.label}</span>)}
              </div>
            </div>
          )}
          {!text.trim() && <div className="px-4 pt-3 text-12 text-muted">Try asking</div>}
          <ul id="ask-list" role="listbox" aria-label="Search options" className="py-1.5">
            {options.length === 0 && <li className="px-4 py-2 text-13 text-muted">No match yet. Try a unit, region, status, category, case number or Permanent ID.</li>}
            {options.map((o, i) => (
              <li key={o.kind + o.label} id={`ask-${i}`} role="option" aria-selected={i === active}
                onMouseDown={(e) => { e.preventDefault(); go(i) }} onMouseEnter={() => setActive(i)}
                className={clsx('flex cursor-pointer items-center gap-3 px-4 py-2 text-14', i === active && 'bg-ink-50')}>
                {o.kind === 'case' ? <FileText size={15} className="text-muted" aria-hidden /> : o.kind === 'inst' ? <Building2 size={15} className="text-muted" aria-hidden /> : o.kind === 'filter' ? <ListFilter size={15} className="text-ink-700" aria-hidden /> : <Search size={14} className="text-muted" aria-hidden />}
                <span className={clsx('flex-1 truncate', o.kind === 'filter' && 'font-semibold text-ink-700')}>{o.label}</span>
                {'hint' in o && o.hint && <span className="shrink-0 text-12 text-muted">{o.hint}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
