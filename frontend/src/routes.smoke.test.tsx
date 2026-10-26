// @vitest-environment jsdom
// Smoke test: every screen renders for every kind of user, finishes loading, and logs no React errors.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UserProvider } from './hooks/useUser'
import App from './App'
import { api } from './lib/api'

beforeAll(() => {
  // jsdom lacks these browser APIs used by charts and motion checks.
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia
  window.scrollTo = () => {}
})
afterEach(() => { cleanup(); localStorage.clear() })

async function renderAt(path: string, userId: string) {
  localStorage.setItem('ekatra.user', userId)
  const errors: string[] = []
  const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errors.push(a.map(String).join(' ')) })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const { container } = render(
    <QueryClientProvider client={qc}><UserProvider><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></UserProvider></QueryClientProvider>,
  )
  await waitFor(() => {
    expect(container.querySelector('[aria-busy="true"]')).toBeNull()
    expect(container.querySelector('.skeleton')).toBeNull()
  }, { timeout: 6000 })
  spy.mockRestore()
  return { container, errors: errors.filter((e) => !/width\(0\) and height\(0\)|ResponsiveContainer/.test(e)) }
}

describe('every screen renders without errors', async () => {
  const ov = await api.overlaps()
  const firstOverlap = encodeURIComponent(ov.open[0].id)
  const paths = [
    '/', '/inbox', '/cases', '/cases/c1', '/cases/new', '/institutions', '/institutions/inst-1', '/overlaps', `/overlaps/${firstOverlap}`,
    '/matching', '/deadlines', '/import', '/import/b212', '/reports', '/data-health', '/settings', '/settings/statuses', '/settings/users', '/audit', '/how-it-works', '/check', '/flow', '/management', '/calendar', '/demo', '/nowhere',
  ]
  // Nodal officer, coordinator, data steward, senior management, admin.
  for (const user of ['u1', 'u3', 'u6', 'u5', 'u7']) {
    for (const p of paths) {
      it(`${p} as ${user}`, async () => {
        const { container, errors } = await renderAt(p, user)
        expect(errors).toEqual([])
        expect(container.textContent?.length ?? 0).toBeGreaterThan(50)
      }, 10_000)
    }
  }
  it('the institution reply page renders for a used link and an unknown link', async () => {
    for (const t of ['demo-hooghly-7Q2', 'no-such-token']) {
      const { errors, container } = await renderAt(`/reply/${t}`, 'u1')
      expect(errors).toEqual([])
      expect(container.textContent).toMatch(t === 'no-such-token' ? /not valid/ : /received/)
    }
  })
})
