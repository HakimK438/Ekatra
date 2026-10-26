// Chart colours. SVG charts need literal colours, so these mirror the CSS tokens in index.css; nothing else
// in the app should hard-code a hex value.
import type { Lifecycle, UnitKind } from './types'

export const C = {
  ink: '#0E1A33',
  blue: '#2952CC',
  blueDeep: '#1F3FAF',
  blueMid: '#6B8DE6',
  blueLight: '#A8BEF2',
  blueFaint: '#DCE5FA',
  good: '#0F7A55',
  tape: '#C2353F',
  saffron: '#A44C08',
  saffronFill: '#F0A43A',
  line: '#E3DFD5',
  muted: '#5D6371',
  stamp: '#9AA0AB',
} as const

/** Age of open cases: sequential blues, then red for the oldest bucket. */
export const AGE_COLORS = [C.blueFaint, C.blueLight, C.blueMid, C.blue, C.tape]

/** Open stages in reading order. Escalated is saffron because it needs someone senior. */
export const STAGE_COLORS: Partial<Record<Lifecycle, string>> = {
  received: C.blueFaint,
  under_examination: C.blueLight,
  awaiting_party: C.blueMid,
  inspection_hearing: C.blue,
  escalated: C.saffronFill,
}

export const UNIT_KIND_COLOR: Record<UnitKind | 'none', string> = {
  grievance_cell: '#2952CC',
  regulation_bureau: '#0E7C86',
  regional_office: '#A16207',
  other_cell: '#6D4AB8',
  none: '#7A808C',
}
export const UNIT_KIND_CLASS: Record<UnitKind | 'none', string> = {
  grievance_cell: 'bg-unit-gr',
  regulation_bureau: 'bg-unit-rb',
  regional_office: 'bg-unit-ro',
  other_cell: 'bg-unit-other',
  none: 'bg-unit-none',
}

/** Unit kind from its code, following the AICTE unit code pattern (PGRC, RB-xx, RO-xx, other cells). */
export const unitKind = (code: string): UnitKind =>
  code === 'PGRC' ? 'grievance_cell' : code.startsWith('RB-') ? 'regulation_bureau' : code.startsWith('RO-') ? 'regional_office' : 'other_cell'

export const tooltipStyle = {
  contentStyle: { borderRadius: 10, border: `1px solid ${C.line}`, boxShadow: '0 10px 28px -14px rgba(14,26,51,.35)', fontSize: 13 },
  cursor: { stroke: C.line },
}
