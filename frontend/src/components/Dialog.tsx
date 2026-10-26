// A small accessible dialog: focus moves in, Escape closes, focus returns to the button that opened it.
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

export default function Dialog({ open, title, lead, onClose, children }: { open: boolean; title: string; lead?: string; onClose: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    const back = document.activeElement as HTMLElement | null
    const first = box.current?.querySelector<HTMLElement>('input, textarea, select, button:not([data-close])')
    first?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab' && box.current) {
        const f = [...box.current.querySelectorAll<HTMLElement>('a, button, input, textarea, select')].filter((x) => !x.hasAttribute('disabled'))
        if (!f.length) return
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus() }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus() }
      }
    }
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('keydown', key); back?.focus() }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/40 p-4 pt-[10vh]" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby={id} className="w-full max-w-lg rounded-panel border border-line bg-surface p-6 shadow-card">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id={id} className="font-display text-20 font-semibold text-ink-950">{title}</h2>
            {lead && <p className="mt-1 text-14 text-muted">{lead}</p>}
          </div>
          <button type="button" data-close onClick={onClose} className="rounded-full p-1 text-muted hover:bg-paper hover:text-text" aria-label="Close"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

export const fieldCls = 'mt-1 block w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-14 text-text focus:border-ink-500 focus:outline-none focus:ring-4 focus:ring-ink-100'
