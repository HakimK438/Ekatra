// One door for the whole app. With VITE_API_MODE=http the pages talk to the real backend (FastAPI + PostgreSQL);
// otherwise they use the built-in mock service (offline demo and the test suite).
import * as mock from './mock/mockApi'
import { httpApi } from './http'

export * from './mock/mockApi'

export const MODE: 'http' | 'mock' = import.meta.env.VITE_API_MODE === 'http' ? 'http' : 'mock'
/** Screens that exist only in the offline demo: institution reply links, watch lists, data-health, planted tests. */
export const EXTRA = MODE === 'mock'
export const api = (MODE === 'http' ? httpApi : mock.api) as unknown as typeof mock.api
