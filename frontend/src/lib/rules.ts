// Editing the tunable rules: validation, applying changes, and the rows the Settings screen shows.
// Same behaviour as backend/app/engine/rules.py (the real API does the work in http mode; this serves the offline demo).
import { RULES_TABLE, RULE_DEFAULTS, SETTINGS, type Rule, type RuleKey } from './logic'

const SCALE: Record<string, number> = { percent: 100 }
const k = (r: Rule) => SCALE[r.unit] ?? 1
/** Stored value to the number people see and type (0.75 to 75). */
export const shown = (r: Rule, stored: number) => Math.round(stored * k(r) * 1e4) / 1e4
export const stored = (r: Rule, typed: number) => Math.round((typed / k(r)) * 1e4) / 1e4
export const ruleByKey = (key: string) => RULES_TABLE.find((r) => r.key === key)

export function display(r: Rule, value: number): string {
  const n = String(shown(r, value))
  return r.unit === 'percent' ? `${n}%` : r.unit === 'day' ? `day ${n}` : r.unit === 'count' ? `top ${n}` : `${n} ${r.unit}`
}

/** Make the live settings equal to the given values (what the server says is in force). */
export function applyRules(values: Partial<Record<RuleKey, number>>) {
  Object.assign(SETTINGS, RULE_DEFAULTS, values)
}

/** Check typed values (as people see them). Returns the stored values, or a message saying what to fix. */
export function validateRules(values: Record<string, number>): { ok: true; stored: Partial<Record<RuleKey, number>> } | { ok: false; message: string } {
  const out: Partial<Record<RuleKey, number>> = {}
  for (const [key, raw] of Object.entries(values)) {
    const r = ruleByKey(key)
    if (!r || !r.key) return { ok: false, message: `“${key}” is not a setting.` }
    if (!r.editable) return { ok: false, message: `“${r.label}” is verified and cannot be changed here.` }
    if (typeof raw !== 'number' || Number.isNaN(raw)) return { ok: false, message: `“${r.label}” needs a number.` }
    const lo = shown(r, r.min!), hi = shown(r, r.max!)
    if (raw < lo || raw > hi) return { ok: false, message: `“${r.label}” must be between ${lo} and ${hi}.` }
    if (r.unit !== 'percent' && !Number.isInteger(raw)) return { ok: false, message: `“${r.label}” must be a whole number.` }
    out[r.key] = stored(r, raw)
  }
  const final = { ...SETTINGS, ...out }
  if (final.coordSecondLevelDays <= final.coordDueDays) return { ok: false, message: 'The second-level reminder must come after the decision due date.' }
  if (final.cpgramsInterimDay >= final.cpgramsDays) return { ok: false, message: 'The interim reply reminder must come before the CPGRAMS time limit.' }
  return { ok: true, stored: out }
}

/** The rows for the Settings screen, in the order of rules.json. */
export function ruleItems() {
  return RULES_TABLE.map((r) => {
    const cur = r.key ? SETTINGS[r.key] : r.default
    const base = { group: r.group, label: r.label, value: display(r, cur), verified: r.verified, basis: r.basis, key: r.key, unit: r.unit, editable: r.editable }
    return r.key
      ? { ...base, current: shown(r, cur), default: shown(r, r.default), min: shown(r, r.min!), max: shown(r, r.max!), changed: cur !== r.default }
      : { ...base, current: undefined, default: undefined, min: undefined, max: undefined, changed: false }
  })
}
