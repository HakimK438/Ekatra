import { afterEach, describe, expect, it } from 'vitest'
import { api } from './mock/mockApi'
import { RULE_DEFAULTS, SETTINGS, deadlineFor } from './logic'
import { applyRules, display, ruleByKey, ruleItems, validateRules } from './rules'
import type { Case, DemoUser } from './types'

const admin: DemoUser = { id: 'u7', name: 'Vikram Joshi', role: 'admin' }
const officer: DemoUser = { id: 'u1', name: 'Anjali Rao', role: 'nodal_officer', unit: 'PGRC' }
const other = { channel: 'EMAIL_POST', receivedOn: '2026-10-01', lifecycle: 'under_examination' } as Case
afterEach(() => applyRules({}))

describe('one table of rules', () => {
  it('live settings start at the defaults in rules.json', () => {
    for (const [k, v] of Object.entries(RULE_DEFAULTS)) expect(SETTINGS[k as keyof typeof RULE_DEFAULTS]).toBe(v)
    expect(SETTINGS.cpgramsDays).toBe(21)
  })
  it('shows percent as people read it and keeps the verified limit locked', () => {
    expect(display(ruleByKey('approachingPct')!, 0.75)).toBe('75%')
    expect(ruleItems().find((i) => i.key === 'cpgramsDays')).toMatchObject({ editable: false, verified: true, current: 21 })
  })
  it('rejects values that are out of range, fractional, locked or inconsistent', () => {
    expect(validateRules({ defaultDays: 0 }).ok).toBe(false)
    expect(validateRules({ defaultDays: 12.5 }).ok).toBe(false)
    expect(validateRules({ cpgramsDays: 25 })).toMatchObject({ ok: false })
    expect(validateRules({ coordDueDays: 12 })).toMatchObject({ ok: false })
    expect(validateRules({ cpgramsInterimDay: 25 })).toMatchObject({ ok: false })
    expect(validateRules({ approachingPct: 80 })).toEqual({ ok: true, stored: { approachingPct: 0.8 } })
  })
})

describe('an administrator changes a rule', () => {
  it('changes the time limit that every screen uses, and the audit log records why', async () => {
    expect(deadlineFor(other, '2026-10-23').days).toBe(30)
    const s = await api.updateRules({ values: { defaultDays: 45 }, reason: 'New circular' }, admin)
    expect(s.values.defaultDays).toBe(45)
    expect(deadlineFor(other, '2026-10-23').days).toBe(45)
    expect((await api.settings()).items.find((i) => i.key === 'defaultDays')).toMatchObject({ changed: true, default: 30, current: 45 })
    const log = await api.auditLog({})
    expect(log.rows[0]).toMatchObject({ action: 'Rule changed' })
    expect(log.rows[0].details).toContain('30 days -> 45 days')
  })
  it('only administrators may, a reason is required, and reset restores the defaults', async () => {
    await expect(api.updateRules({ values: { defaultDays: 45 }, reason: 'x' }, officer)).rejects.toMatchObject({ code: 'forbidden' })
    await expect(api.updateRules({ values: { defaultDays: 45 }, reason: ' ' }, admin)).rejects.toMatchObject({ code: 'validation_error' })
    await api.updateRules({ values: { defaultDays: 45, topN: 5 }, reason: 'Trial' }, admin)
    const s = await api.resetRules({ reason: 'Back' }, admin)
    expect(s.values.defaultDays).toBe(30)
    expect(s.items.some((i) => i.changed)).toBe(false)
  })
})
