import clsx from 'clsx'

// Initials on a muted tint, one colour per person. Formal and distinct: no illustrated people, and no real photos
// next to invented names. Falls back to a neutral silhouette when no name is given.
const TINTS = [
  { bg: '#DCE6FB', fg: '#1F3F99' }, { bg: '#D5ECE6', fg: '#0B5E48' }, { bg: '#F6E7D0', fg: '#8A4A0A' },
  { bg: '#E6DDF7', fg: '#5B2BB3' }, { bg: '#D6EAF0', fg: '#0B5A70' }, { bg: '#F4DDE0', fg: '#8E2A33' },
]
const hash = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7)
const initials = (name: string) => {
  const w = name.trim().split(/\s+/).filter(Boolean)
  return ((w[0]?.[0] ?? '') + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase()
}

export default function Avatar({ name, size = 36, className }: { name?: string; size?: number; className?: string }) {
  if (!name?.trim()) {
    return (
      <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden className={clsx('shrink-0 rounded-full', className)} style={{ width: size, height: size }}>
        <rect width="40" height="40" fill="#E3E6EB" /><circle cx="20" cy="16" r="7.5" fill="#A9B0BD" /><path d="M6 40c0-9 6-15 14-15s14 6 14 15z" fill="#A9B0BD" />
      </svg>
    )
  }
  const t = TINTS[hash(name) % TINTS.length]
  return (
    <span aria-hidden className={clsx('inline-flex shrink-0 select-none items-center justify-center rounded-full font-display font-semibold', className)}
      style={{ width: size, height: size, background: t.bg, color: t.fg, fontSize: size * 0.38 }}>{initials(name)}</span>
  )
}
